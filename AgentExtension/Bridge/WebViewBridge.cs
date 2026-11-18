// WebView2 与代理会话之间的双向消息桥

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Threading;
using AgentExtension.Agents;
using AgentExtension.Terminal;
using AgentExtension.ToolWindows;
using AgentExtension.Vs;
using Microsoft.Web.WebView2.Core;

namespace AgentExtension.Bridge
{
    /// <summary>把会话事件推给前端，把前端命令交给会话。</summary>
    public class WebViewBridge : IDisposable
    {
        #region 字段

        private static readonly TimeSpan FlushInterval = TimeSpan.FromMilliseconds(16);

        /// <summary>出站通道；为 null 时终端已先起、WebView 还在建。</summary>
        private CoreWebView2? _webView;

        private readonly DeltaCoalescer _coalescer;
        private readonly DispatcherTimer _flushTimer;
        private readonly Dispatcher _dispatcher;

        /// <summary>认终端里敲下的 /clear。</summary>
        private readonly TerminalClearDetector _clearDetector = new TerminalClearDetector();

        private readonly string _executablePath;

        private readonly Func<string> _workingDirectoryProvider;

        private ClaudePanelService? _panelService;

        /// <summary>用户亲手挑/拖进来的路径。工作目录之外唯一允许预览的来源，不设防等于给网页读任意本机文件的能力。</summary>
        private readonly HashSet<string> _userPickedFiles =
            new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        private ConPtySession? _terminal;

        private TerminalLaunchOptions? _terminalOptions;

        /// <summary>下一次起终端要拉回的网页会话 id；用一次就清。</summary>
        private string _pendingTeleportId = string.Empty;

        /// <summary>前端 xterm 接上没有；没接上输出只攒不发。</summary>
        private bool _terminalAttached = true;

        /// <summary>下一批输出是预启动攒下的回放。</summary>
        private bool _replayPending;

        /// <summary>伪控制台当前列数。</summary>
        private int _terminalColumns;

        /// <summary>伪控制台当前行数。</summary>
        private int _terminalRows;

        /// <summary>接上前等尺寸稳定的静默时长。</summary>
        private static readonly TimeSpan AttachSettle = TimeSpan.FromMilliseconds(200);

        /// <summary>接上前最多等这么久。</summary>
        private static readonly TimeSpan AttachMaxWait = TimeSpan.FromMilliseconds(800);

        /// <summary>等尺寸稳定的计时器。</summary>
        private DispatcherTimer? _attachTimer;

        /// <summary>最晚接上的时刻。</summary>
        private DateTime _attachDeadlineUtc;

        /// <summary>等稳定期间记下的最新列数。</summary>
        private int _pendingColumns;

        /// <summary>等稳定期间记下的最新行数。</summary>
        private int _pendingRows;

        /// <summary>起终端时向宿主要一套启动参数与其闭集。</summary>
        public Func<TerminalLaunchOptions>? TerminalLaunchProvider { get; set; }

        private IReadOnlyList<string> _knownModels = Array.Empty<string>();

        private IReadOnlyList<string> _knownEfforts = Array.Empty<string>();

        private readonly List<byte> _terminalBuffer = new List<byte>();

        /// <summary>这一路终端下发过首批输出没有，诊断用。</summary>
        private bool _firstOutputSent;

        /// <summary>这一路终端的起步期。</summary>
        private readonly TerminalWarmUp _warmUp = new TerminalWarmUp();

        /// <summary>这一路终端起的时刻，诊断用。</summary>
        private DateTime _terminalStartedUtc;

        /// <summary>终端已出首屏、已退出或起步超时。</summary>
        public bool IsTerminalSettled
        {
            get
            {
                bool settled = _warmUp.IsSettled(DateTime.UtcNow);
                return settled;
            }
        }

        private readonly List<AgentEvent> _log = new List<AgentEvent>();

        /// <summary>起终端前问宿主；返回 false 就先等。</summary>
        public Func<bool>? TerminalStartAllowed { get; set; }

        /// <summary>等放行的终端尺寸；0 表示没有在等的。</summary>
        private int _heldTerminalColumns;

        /// <summary>等放行的终端行数。</summary>
        private int _heldTerminalRows;

        /// <summary>进程没起时压着的用户消息。</summary>
        private readonly List<AgentPrompt> _heldPrompts = new List<AgentPrompt>();

        /// <summary>压着消息期间回灌过，前端的本地气泡已没了。</summary>
        private bool _replayedSinceHold;

        private IAgentSession _session;

        private bool _disposed;

        private bool _outboundBroken;

        private readonly CancellationTokenSource _shutdownCts = new CancellationTokenSource();

        #endregion

        #region 构造与启动

        /// <summary>构造消息桥；webView 可后补，见 RebindWebView。</summary>
        public WebViewBridge(
            CoreWebView2? webView,
            IAgentSession session,
            Dispatcher uiDispatcher,
            string executablePath,
            Func<string> workingDirectoryProvider)
        {
            _webView = webView;
            _session = session ?? throw new ArgumentNullException(nameof(session));
            _dispatcher = uiDispatcher ?? throw new ArgumentNullException(nameof(uiDispatcher));
            _executablePath = executablePath ?? string.Empty;
            _workingDirectoryProvider = workingDirectoryProvider
                ?? throw new ArgumentNullException(nameof(workingDirectoryProvider));

            _coalescer = new DeltaCoalescer(PostEvent);

            _flushTimer = new DispatcherTimer(DispatcherPriority.Normal, _dispatcher)
            {
                Interval = FlushInterval
            };

            _flushTimer.Tick += OnFlushTick;
        }

        public void Start()
        {
            if (_webView != null)
            {
                // WebView2 进程崩溃的**主动**信号。
                _webView.ProcessFailed += OnWebViewProcessFailed;
                _webView.WebMessageReceived += OnWebMessageReceived;
            }

            _session.Received += OnSessionEvent;
            _flushTimer.Start();
        }

        /// <summary>
        /// 预置事件日志（历史回放用）。**必须在 <see cref="Start"/> 之前调用**：
        /// 前端 ready 时会把整份日志回灌，晚于那一刻塞进去的历史画不出来。
        /// </summary>
        public void SeedLog(IEnumerable<AgentEvent> events)
        {
            if (events == null)
            {
                return;
            }

            _log.AddRange(events);
        }

        /// <summary>
        /// 整份换掉日志并立刻回灌一次。<see cref="SeedLog"/> 只往日志里塞、不推给前端，
        /// 那是给「前端还没挂载」用的；前端挂载之后再塞就得走这条，否则界面不会变。
        /// </summary>
        public void ReseedLog(IEnumerable<AgentEvent> events)
        {
            // 丢弃合并器残留的理由同 ResetLog：上一条会话没冲刷出去的半句话会打脏新界面。
            _coalescer.Discard();
            _log.Clear();

            if (events != null)
            {
                _log.AddRange(events);
            }

            PostReplay();
        }

        /// <summary>清空日志并立刻回灌一次，让界面归零（开新会话用）。</summary>
        public void ResetLog()
        {
            // 只清 _log 不够：合并器里可能还压着上一条会话尚未被 16ms 定时器冲刷出去的
            // 文本增量（正文/思考）。调用方即便已经先 Dispose 旧会话再叫这个方法，
            // Dispose 只能保证旧会话此后不会再产生新事件，挡不住此刻已经躺在缓冲区里、
            // 还没冲出去的残留——不丢弃它，下一次 Flush/PostNotice 就会把这段属于
            // 上一条会话的半句话当成新会话的输出发出去，界面刚归零就被打脏。
            _coalescer.Discard();
            _log.Clear();
            PostReplay();
        }

        /// <summary>出站通道彻底不可用时触发一次，参数是可读原因。</summary>
        public event EventHandler<string>? OutboundFailed;

        /// <summary>前端请求切换权限模式。</summary>
        public event EventHandler<string>? PermissionModeChangeRequested;

        /// <summary>底部开关要改终端的 remote-control。</summary>
        public event EventHandler<bool>? RemoteControlChangeRequested;

        /// <summary>前端请求切换模型。</summary>
        public event EventHandler<string>? ModelChangeRequested;

        /// <summary>前端请求执行一条 CLI 子命令。</summary>
        public event EventHandler<ClaudeSubcommand>? SubcommandRequested;

        /// <summary>前端请求切换思考强度。</summary>
        public event EventHandler<string>? EffortChangeRequested;

        /// <summary>前端请求开关 Ultracode。</summary>
        public event EventHandler<bool>? UltracodeChangeRequested;

        /// <summary>前端挂载完成并已能接收消息。</summary>
        public event EventHandler? ClientReady;

        /// <summary>用户点了转录里的文件位置链接，请求在编辑器中打开。</summary>
        public event EventHandler<OpenFileRequest>? OpenFileRequested;

        /// <summary>请求接回一条历史会话。</summary>
        public event EventHandler<SessionResumeRequest>? SessionResumeRequested;

        /// <summary>会话面板里改了某条会话的名字，参数是会话 id。</summary>
        public event EventHandler<string>? SessionRenamed;

        /// <summary>网页没用上刚按下的 Esc。</summary>
        public event EventHandler? EscapeUnhandled;

        /// <summary>前端埋点上报的一行文字。</summary>
        public event EventHandler<string>? ClientDiagnostic;

        /// <summary>前端请求丢掉当前会话、开一条干净的。</summary>
        public event EventHandler? NewSessionRequested;

        /// <summary>用户敲了一段正文，不含固定提示词，用来起标题。</summary>
        public event EventHandler<string>? PromptSent;

        /// <summary>点了 +。</summary>
        public event EventHandler? TabCreateRequested;

        /// <summary>终端起来了，带预分配的会话 id。</summary>
        public event EventHandler<string>? TerminalSessionStarted;

        /// <summary>聊天进程还没起，用户就先说了话：请宿主立刻起。</summary>
        public event EventHandler? AgentStartRequested;

        /// <summary>聊天框真发给了聊天进程，带原文。</summary>
        public event EventHandler<string>? ChatPromptSent;

        /// <summary>终端里敲了 /clear，标题该退回初始。</summary>
        public event EventHandler? TerminalClearDetected;

        /// <summary>切到某个 tab，带 id 与是否键盘触发。</summary>
        public event EventHandler<TabActivateRequest>? TabActivateRequested;

        /// <summary>关掉某个 tab，参数是 tab id。</summary>
        public event EventHandler<string>? TabCloseRequested;

        /// <summary>这个 tab 的语言/外观变了，请宿主转发给其余 tab。</summary>
        public event EventHandler<UiPrefsPayload>? UiPrefsChanged;

        /// <summary>前端的 @ 文件检索。</summary>
        public Func<string, IReadOnlyList<string>>? FileSearchRequested { get; set; }

        /// <summary>前端请求「挑文件」，由宿主弹原生对话框，返回绝对路径。</summary>
        public Func<IReadOnlyList<string>>? FilePickRequested { get; set; }

        /// <summary>读系统剪贴板里复制的文件，返回绝对路径。</summary>
        public Func<IReadOnlyList<string>>? ClipboardFilesRequested { get; set; }

        /// <summary>粘贴截图的落盘处。</summary>
        private readonly PastedImageStore _pastedImages = new PastedImageStore(PastedImageStore.DefaultDirectory());

        /// <summary>
        /// 把桥挂到新的 WebView 上（面板重建 WebView2 之后）。
        ///
        /// 会话、转录日志、用户挑过的文件、终端全部原样保留：换的只是「消息往哪儿发」。
        /// 新前端挂载后会发 ready，那时 <see cref="PostReplay"/> 把整份转录回灌回去，
        /// 用户看到的是「界面闪了一下又回来了」，而不是「聊天记录没了」。
        /// </summary>
        public void RebindWebView(CoreWebView2 webView)
        {
            if (webView == null)
            {
                throw new ArgumentNullException(nameof(webView));
            }

            // 旧控制器多半已经关掉了，退订会抛 COM 异常——那正是要换掉它的原因，不该让它挡住换绑。
            try
            {
                if (_webView != null)
                {
                    _webView.ProcessFailed -= OnWebViewProcessFailed;
                    _webView.WebMessageReceived -= OnWebMessageReceived;
                }
            }
            catch (Exception)
            {
            }

            _webView = webView;

            // 旧通道的坏账不能继承：不清掉这个标记，新通道上第一条消息就会被 TrySend 直接丢掉，
            // 表现是「重建出来的面板还是空的」。
            _outboundBroken = false;

            _webView.ProcessFailed += OnWebViewProcessFailed;
            _webView.WebMessageReceived += OnWebMessageReceived;
        }

        /// <summary>进程起来了：把压着的话发出去。</summary>
        /// <remarks>走 PostEvent 下发：期间可能回灌过，前端那块本地气泡已被清掉。</remarks>
        public void FlushHeldPrompts()
        {
            if (_disposed || _heldPrompts.Count == 0 || !_session.IsStarted)
            {
                return;
            }

            AgentPrompt[] held = _heldPrompts.ToArray();
            _heldPrompts.Clear();

            foreach (AgentPrompt prompt in held)
            {
                if (_replayedSinceHold)
                {
                    PostEvent(AgentEvent.UserPromptText(prompt.Text));
                }
                else
                {
                    _log.Add(AgentEvent.UserPromptText(prompt.Text).StampIfMissing(AgentEvent.NowUnixMs()));
                }

                _session.Send(prompt);
                ChatPromptSent?.Invoke(this, prompt.Text);
            }

            _replayedSinceHold = false;
        }

        /// <summary>把桥挂到新会话上（切权限模式重启 CLI 后）。</summary>
        public void ReplaceSession(IAgentSession session)
        {
            if (session == null)
            {
                throw new ArgumentNullException(nameof(session));
            }

            _session.Received -= OnSessionEvent;
            _session = session;
            _session.Received += OnSessionEvent;

            // 新进程里没有我们加过的浏览器服务器
            _chromeConnected = false;

            // 远程控制跟着旧进程一起没了，告诉界面别再亮着
            PostEvent(AgentEvent.RemoteControl(new AgentRemoteControl { State = AgentRemoteControl.StateOff }));
        }

        /// <summary>下发主题令牌。</summary>
        public void PostTheme(IReadOnlyDictionary<string, string> tokens)
        {
            if (tokens == null)
            {
                return;
            }

            string payload = SerializeEnvelope(BridgeMessageTypes.Theme, tokens);
            TrySend(payload);
        }

        /// <summary>报一次远程控制状态（会话还没起来时由宿主直接回）。</summary>
        public void PostRemoteControl(AgentRemoteControl state)
        {
            PostEvent(AgentEvent.RemoteControl(state));
        }

        /// <summary>把 VS 侧收集到的上下文（选中代码、编译错误等）推给前端，由它插进输入框。</summary>
        public void PostContext(string kind, string text)
        {
            var payload = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["kind"] = kind ?? string.Empty,
                ["text"] = text ?? string.Empty
            };

            string json = SerializeEnvelope(BridgeMessageTypes.Context, payload);
            TrySend(json);
        }

        /// <summary>往转录里插一条可翻译的系统提示：<paramref name="template"/> 取自 <see cref="NoticeText"/>。</summary>
        public void PostNotice(string template, Dictionary<string, string>? args = null)
        {
            AgentEvent notice = AgentEvent.Notice(template, args);

            _coalescer.Flush();
            _coalescer.Enqueue(notice);
        }

        /// <summary>补发一轮结束：旧会话被换掉时让前端解除忙。</summary>
        public void PostTurnAborted()
        {
            AgentEvent aborted = AgentEvent.Aborted();

            _coalescer.Flush();
            _coalescer.Enqueue(aborted);
        }

        /// <summary>往转录里插一条已经成形的文本（子命令输出这类），前端不翻译。</summary>
        public void PostRawNotice(string text)
        {
            AgentEvent notice = AgentEvent.RawNotice(text);

            _coalescer.Flush();
            _coalescer.Enqueue(notice);
        }

        /// <summary>把整条 tab 条推给前端。载荷形状由宿主决定，这里只负责发。</summary>
        public void PostTabs(object payload)
        {
            if (payload == null)
            {
                return;
            }

            PostEnvelope(BridgeMessageTypes.Tabs, payload);
        }

        /// <summary>终端转录里读到的实际型号及其时间戳。</summary>
        public void PostTerminalModel(string model, string at)
        {
            var payload = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["model"] = model ?? string.Empty,
                ["at"] = at ?? string.Empty
            };

            PostEnvelope(BridgeMessageTypes.TerminalModel, payload);
        }

        /// <summary>把别的 tab 广播来的语言/外观偏好转发给这块前端。</summary>
        public void PostUiPrefs(object payload)
        {
            if (payload == null)
            {
                return;
            }

            PostEnvelope(BridgeMessageTypes.UiPrefs, payload);
        }

        /// <summary>推送 VS 当前活动文档，空串表示没有。</summary>
        public void PostActiveFile(string fullPath)
        {
            Dictionary<string, string> payload = ActiveFileRules.BuildPayload(_workingDirectoryProvider(), fullPath);

            PostEnvelope(BridgeMessageTypes.ActiveFile, payload);
        }

        #endregion

        #region 出站

        /// <summary>必须自带 try-catch：这是 DispatcherTimer 回调，异常逃出去没有任何地方接，直接掀掉 VS。</summary>
        private void OnFlushTick(object sender, EventArgs e)
        {
            try
            {
                _coalescer.Flush();
                FlushTerminalOutput();
            }
            catch (Exception ex)
            {
                _outboundBroken = true;
                RaiseOutboundFailed(ex.Message);
            }
        }

        private void OnSessionEvent(object sender, AgentEvent evt)
        {
            AgentSessionInfo? info = evt.SessionInfo;

            if (info != null)
            {
                info.AutoCompactEnabled = AutoCompactSetting.Read();

                if (info.AvailableModels.Count > 0)
                {
                    _knownModels = info.AvailableModels;
                }

                if (info.EffortLevels.Count > 0)
                {
                    _knownEfforts = info.EffortLevels;
                }
            }

            // 会话事件来自后台读取线程，必须切回 UI 线程再碰 WebView 与合并器。
            if (!_dispatcher.CheckAccess())
            {
                _dispatcher.BeginInvoke(new Action(() =>
                {
                    if (_disposed)
                    {
                        return;
                    }

                    try
                    {
                        _coalescer.Enqueue(evt);
                    }
                    catch (Exception ex)
                    {
                        _outboundBroken = true;
                        RaiseOutboundFailed(ex.Message);
                    }
                }));
                return;
            }

            _coalescer.Enqueue(evt);
        }

        private void PostEvent(AgentEvent evt)
        {
            if (_disposed)
            {
                return;
            }

            evt.StampIfMissing(AgentEvent.NowUnixMs());
            _log.Add(evt);

            string payload = SerializeEnvelope(BridgeMessageTypes.Event, evt);
            TrySend(payload);
        }

        /// <summary>把额度快照发给这块前端。</summary>
        /// <remarks>不进 <see cref="_log"/>；理由见 docs/memory/multi-session-tabs.md。</remarks>
        public void PostUsage(object payload)
        {
            if (payload == null)
            {
                return;
            }

            PostEnvelope(BridgeMessageTypes.Usage, payload);
        }

        private void PostReplay()
        {
            _replayedSinceHold = _heldPrompts.Count > 0;

            string payload = SerializeEnvelope(BridgeMessageTypes.Replay, _log.ToArray());
            TrySend(payload);
        }

        private void OnWebViewProcessFailed(object sender, CoreWebView2ProcessFailedEventArgs e)
        {
            try
            {
                if (_outboundBroken)
                {
                    return;
                }

                _outboundBroken = true;
                RaiseOutboundFailed(e == null ? "WebView2 process failed" : e.ProcessFailedKind.ToString());
            }
            catch (Exception)
            {
                // 上报路径自己出问题就没辙了，但绝不能把异常放出这个回调。
            }
        }

        /// <summary>把一条 JSON 发给前端，发不出去也绝不让异常越过调用者。</summary>
        private void TrySend(string json)
        {
            // 还没绑 WebView：前端也没挂载，ready 时会回放日志、补发终端状态
            if (_disposed || _outboundBroken || _webView == null)
            {
                return;
            }

            try
            {
                _webView.PostWebMessageAsJson(json);
            }
            catch (Exception ex)
            {
                _outboundBroken = true;
                RaiseOutboundFailed(ex.Message);
            }
        }

        private void RaiseOutboundFailed(string reason)
        {
            try
            {
                OutboundFailed?.Invoke(this, reason);
            }
            catch (Exception)
            {
            }
        }

        private static string SerializeEnvelope(string type, object payload)
        {
            string json = BridgeSerializer.SerializeEnvelope(type, payload);
            return json;
        }

        private void PostEnvelope(string type, object payload)
        {
            if (_disposed)
            {
                return;
            }

            string json = SerializeEnvelope(type, payload);
            TrySend(json);
        }

        #endregion

        #region 入站

        private void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            // 解析与分发拆成两段独立的 try：解析段只会抛 JsonException，分发段能抛的类型五花八门
            InboundMessage? message = TryParse(e.WebMessageAsJson);

            if (message == null)
            {
                return;
            }

            try
            {
                HandleInbound(message);
            }
            catch (Exception ex)
            {
                // 不静默失败：把原因经既有的 PostNotice 送进转录，让用户至少看到一条提示。
                TryPostDispatchError(ex);
            }
        }

        private static InboundMessage? TryParse(string webMessageAsJson)
        {
            try
            {
                using (JsonDocument document = JsonDocument.Parse(webMessageAsJson))
                {
                    JsonElement root = document.RootElement;

                    if (root.ValueKind != JsonValueKind.Object)
                    {
                        return null;
                    }

                    if (!root.TryGetProperty("type", out JsonElement typeElement)
                        || typeElement.ValueKind != JsonValueKind.String)
                    {
                        return null;
                    }

                    // 载荷必须在 JsonDocument 释放前提取成托管值。
                    var message = new InboundMessage
                    {
                        Type = typeElement.GetString() ?? string.Empty,
                        Text = ReadString(root, "text"),
                        Option = ReadString(root, "option"),
                        Value = ReadString(root, "value"),
                        Line = ReadInt(root, "line"),
                        RequestId = ReadString(root, "requestId"),
                        PanelId = ReadString(root, "panelId"),
                        ActionId = ReadString(root, "actionId"),
                        Fork = ReadBool(root, "fork"),
                        Columns = ReadInt(root, "columns"),
                        Rows = ReadInt(root, "rows"),
                        Data = ReadString(root, "data"),
                        Lang = ReadString(root, "lang"),
                        Appearance = ReadAppearance(root)
                    };

                    ReadImages(root, message.Images);
                    ReadStringArray(root, "values", message.Values);

                    return message;
                }
            }
            catch (JsonException)
            {
                return null;
            }
        }

        private void TryPostDispatchError(Exception ex)
        {
            try
            {
                PostNotice(NoticeText.BridgeMessageFailed, NoticeText.Args("reason", ex.Message));
            }
            catch (Exception)
            {
            }
        }

        private class InboundMessage
        {
            public string Type { get; set; } = string.Empty;

            public string Text { get; set; } = string.Empty;

            public string Option { get; set; } = string.Empty;

            public string Value { get; set; } = string.Empty;

            public int Line { get; set; }

            /// <summary>请求-响应用的关联 id，回包原样带回，供前端丢弃过期结果。</summary>
            public string RequestId { get; set; } = string.Empty;

            public List<AgentImage> Images { get; } = new List<AgentImage>();

            /// <summary>面板 id，仅 panelOpen / panelAction 使用。</summary>
            public string PanelId { get; set; } = string.Empty;

            /// <summary>面板动作 id，仅 panelAction 使用。</summary>
            public string ActionId { get; set; } = string.Empty;

            /// <summary>面板动作的槽位值，按模板中占位符的出现顺序排列。</summary>
            public List<string> Values { get; } = new List<string>();

            /// <summary>接回会话时是否开分支（--fork-session），仅 resumeSession 使用。</summary>
            public bool Fork { get; set; }

            /// <summary>终端列数，仅 terminalStart / terminalResize 使用。</summary>
            public int Columns { get; set; }

            /// <summary>终端行数。</summary>
            public int Rows { get; set; }

            /// <summary>终端按键，base64 编码的字节，仅 terminalInput 使用。</summary>
            public string Data { get; set; } = string.Empty;

            /// <summary>切到的语言，仅 uiPrefsChanged 使用。</summary>
            public string Lang { get; set; } = string.Empty;

            /// <summary>切到的外观，仅 uiPrefsChanged 使用；没有该字段时为 null。</summary>
            public UiPrefsAppearance? Appearance { get; set; }
        }

        private static void ReadImages(JsonElement root, List<AgentImage> target)
        {
            if (!root.TryGetProperty("images", out JsonElement array) || array.ValueKind != JsonValueKind.Array)
            {
                return;
            }

            foreach (JsonElement item in array.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                var image = new AgentImage
                {
                    MediaType = ReadString(item, "mediaType"),
                    Base64Data = ReadString(item, "data")
                };

                if (image.IsValid)
                {
                    target.Add(image);
                }
            }
        }

        /// <summary>读 <c>appearance</c> 子对象；不存在或形状不对时返回 null，不当异常处理。</summary>
        private static UiPrefsAppearance? ReadAppearance(JsonElement root)
        {
            if (!root.TryGetProperty("appearance", out JsonElement appearance)
                || appearance.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            return new UiPrefsAppearance
            {
                FontFamily = ReadString(appearance, "fontFamily"),
                FontSize = ReadInt(appearance, "fontSize"),
                TextColor = ReadString(appearance, "textColor")
            };
        }

        private static void ReadStringArray(JsonElement root, string name, List<string> target)
        {
            if (!root.TryGetProperty(name, out JsonElement array) || array.ValueKind != JsonValueKind.Array)
            {
                return;
            }

            foreach (JsonElement item in array.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.String)
                {
                    target.Add(item.GetString() ?? string.Empty);
                }
            }
        }

        private void HandleInbound(InboundMessage message)
        {
            string type = message.Type;
            string text = message.Text;
            string option = message.Option;
            string value = message.Value;

            switch (type)
            {
                case BridgeMessageTypes.Ready:
                    PostReplay();

                    ClientReady?.Invoke(this, EventArgs.Empty);
                    break;

                case BridgeMessageTypes.Send:
                    if (!_session.IsStarted)
                    {
                        // 进程还没起就先说话：请宿主立刻起
                        AgentStartRequested?.Invoke(this, EventArgs.Empty);
                    }

                    var prompt = new AgentPrompt { Text = text, Images = message.Images };

                    if (!_session.IsStarted)
                    {
                        // 宿主没让起（解决方案还在打开）：压住，等 FlushHeldPrompts
                        _heldPrompts.Add(prompt);
                        PostNotice(NoticeText.PromptHeldForSolution);
                        break;
                    }

                    // 只记进日志、不下发：实时那一路前端已经本地加过用户块（state.ts 的 userSent），
                    // 再下发一遍同一句话会重。记这一笔是为了 replay——不记的话，
                    // 面板一被拖动重建 WebView，用户自己发过的每句话都会消失，只剩助手的回复。
                    _log.Add(AgentEvent.UserPromptText(text).StampIfMissing(AgentEvent.NowUnixMs()));
                    _session.Send(prompt);
                    ChatPromptSent?.Invoke(this, text);
                    break;

                case BridgeMessageTypes.TitleHint:
                    // 对话框和终端输入框都发这条，终端那路没有 Send。
                    PromptSent?.Invoke(this, text);
                    break;

                case BridgeMessageTypes.Interrupt:
                    _session.Interrupt();
                    break;

                case BridgeMessageTypes.SetOption:
                    HandleSetOption(option, value);
                    break;

                case BridgeMessageTypes.VsAction:
                    HandleVsAction(option, value, message.Line);
                    break;

                case BridgeMessageTypes.Query:
                    HandleQuery(option, value, message.RequestId);
                    break;

                case BridgeMessageTypes.RunCommand:
                    HandleRunCommand(option);
                    break;

                case BridgeMessageTypes.PanelOpen:
                    HandlePanelOpen(message.PanelId, message.RequestId);
                    break;

                case BridgeMessageTypes.RefreshUsage:
                    (_session as ClaudeStreamJsonSession)?.RefreshUsage();
                    break;

                case BridgeMessageTypes.PanelAction:
                    HandlePanelAction(message.PanelId, message.ActionId, message.Values, message.RequestId);
                    break;

                case BridgeMessageTypes.ResumeSession:
                    HandleResumeSession(message.Value, message.Fork);
                    break;

                case BridgeMessageTypes.TeleportSession:
                    HandleTeleportSession(message.Value);
                    break;

                case BridgeMessageTypes.RestoreFile:
                    HandleRestoreFile(message.Value);
                    break;

                case BridgeMessageTypes.EscapeUnhandled:
                    EscapeUnhandled?.Invoke(this, EventArgs.Empty);
                    break;

                case BridgeMessageTypes.ClientDiag:
                    ClientDiagnostic?.Invoke(this, text);
                    break;

                case BridgeMessageTypes.ExportTranscript:
                    HandleExportTranscript(text);
                    break;

                case BridgeMessageTypes.TerminalStart:
                    HandleTerminalStart(message.Columns, message.Rows);
                    break;

                case BridgeMessageTypes.TerminalInput:
                    HandleTerminalInput(message.Data);
                    break;

                case BridgeMessageTypes.TerminalResize:
                    PanelDiagnostics.Log($"终端改尺寸 {message.Columns}x{message.Rows}");
                    TerminalSizeMemory.Default.Remember(message.Columns, message.Rows);

                    if (!DeferResizeWhileAttaching(message.Columns, message.Rows))
                    {
                        ResizeTerminal(message.Columns, message.Rows);
                    }

                    break;

                case BridgeMessageTypes.TerminalStop:
                    StopTerminal();
                    break;

                case BridgeMessageTypes.NewSession:
                    NewSessionRequested?.Invoke(this, EventArgs.Empty);
                    break;

                case BridgeMessageTypes.TabCreate:
                    TabCreateRequested?.Invoke(this, EventArgs.Empty);
                    break;

                case BridgeMessageTypes.TabActivate:
                    TabActivateRequested?.Invoke(this, new TabActivateRequest
                    {
                        TabId = value,
                        FromKeyboard = option == "keyboard"
                    });
                    break;

                case BridgeMessageTypes.TabClose:
                    TabCloseRequested?.Invoke(this, value);
                    break;

                case BridgeMessageTypes.UiPrefsChanged:
                    HandleUiPrefsChanged(message);
                    break;
            }
        }

        private void HandleUiPrefsChanged(InboundMessage message)
        {
            var payload = new UiPrefsPayload
            {
                Lang = message.Lang,
                Appearance = message.Appearance ?? new UiPrefsAppearance()
            };

            UiPrefsChanged?.Invoke(this, payload);
        }

        #endregion

        #region 终端标签

        private void HandleTerminalStart(int columns, int rows)
        {
            if (_disposed)
            {
                return;
            }

            PanelDiagnostics.Log($"收到 terminalStart {columns}x{rows} 旧终端在跑={_terminal != null && _terminal.IsRunning}");
            TerminalSizeMemory.Default.Remember(columns, rows);

            if (_terminal != null && _terminal.IsRunning)
            {
                if (!_terminalAttached)
                {
                    // 前端刚挂载，主题字体和各条栏还在陆续到，等尺寸稳了再接
                    _pendingColumns = columns;
                    _pendingRows = rows;
                    _attachDeadlineUtc = DateTime.UtcNow + AttachMaxWait;
                    ArmAttachTimer();
                    return;
                }

                ResizeTerminal(columns, rows);
                PostTerminalStarted(_terminalOptions ?? new TerminalLaunchOptions());
                return;
            }

            Func<bool>? allowed = TerminalStartAllowed;

            if (allowed != null && !allowed())
            {
                // 解决方案还在打开：起了会落在兜底目录，等宿主放行
                _heldTerminalColumns = columns;
                _heldTerminalRows = rows;
                PanelDiagnostics.Log("终端等解决方案目录");
                return;
            }

            _terminalAttached = true;
            StartTerminal(columns, rows);
        }

        /// <summary>宿主放行：把等着的终端起起来。</summary>
        public void StartHeldTerminal()
        {
            if (_disposed || _heldTerminalColumns <= 0 || (_terminal != null && _terminal.IsRunning))
            {
                return;
            }

            int columns = _heldTerminalColumns;
            int rows = _heldTerminalRows;
            _heldTerminalColumns = 0;
            _heldTerminalRows = 0;

            _terminalAttached = true;
            StartTerminal(columns, rows);
        }

        /// <summary>等尺寸稳定期间来了新尺寸；返回 true 表示已记下、不必真改。</summary>
        private bool DeferResizeWhileAttaching(int columns, int rows)
        {
            if (_terminalAttached || _attachTimer == null || !_attachTimer.IsEnabled)
            {
                return false;
            }

            _pendingColumns = columns;
            _pendingRows = rows;
            ArmAttachTimer();
            return true;
        }

        /// <summary>重新计时；超过最长等待就立刻接上。</summary>
        private void ArmAttachTimer()
        {
            if (_attachTimer == null)
            {
                _attachTimer = new DispatcherTimer(DispatcherPriority.Normal, _dispatcher)
                {
                    Interval = AttachSettle
                };
                _attachTimer.Tick += (_, __) => CompleteAttach();
            }

            _attachTimer.Stop();

            if (DateTime.UtcNow >= _attachDeadlineUtc)
            {
                CompleteAttach();
                return;
            }

            _attachTimer.Start();
        }

        /// <summary>尺寸稳了：与预启动一致就回放攒下的输出，否则清掉重画。</summary>
        private void CompleteAttach()
        {
            _attachTimer?.Stop();

            if (_disposed || _terminal == null || _terminalAttached)
            {
                return;
            }

            int columns = _pendingColumns;
            int rows = _pendingRows;

            _terminalAttached = true;

            if (columns == _terminalColumns && rows == _terminalRows)
            {
                lock (_terminalBuffer)
                {
                    // 没攒下东西就没有回放，别把标记留给之后的正常输出
                    _replayPending = _terminalBuffer.Count > 0;
                }

                PanelDiagnostics.Log($"尺寸与预启动一致 {columns}x{rows}，直接回放");
            }
            else
            {
                // 扔掉按临时尺寸画的屏，逼 TUI 整屏重画
                lock (_terminalBuffer)
                {
                    _terminalBuffer.Clear();
                }

                PanelDiagnostics.Log($"尺寸与预启动不同 {_terminalColumns}x{_terminalRows}→{columns}x{rows}，整屏重画");
                ResizeTerminal(Math.Max(20, columns - 1), rows);
                ResizeTerminal(columns, rows);
            }

            PostTerminalStarted(_terminalOptions ?? new TerminalLaunchOptions());
            FlushTerminalOutput();
        }

        /// <summary>改伪控制台尺寸；没变就不动，免得 TUI 白白重画。</summary>
        private void ResizeTerminal(int columns, int rows)
        {
            if (_terminal == null || columns <= 0 || rows <= 0)
            {
                return;
            }

            if (columns == _terminalColumns && rows == _terminalRows)
            {
                return;
            }

            _terminal.Resize(columns, rows);
            _terminalColumns = columns;
            _terminalRows = rows;
        }

        /// <summary>前端挂载前先起 TUI 进程；已在跑就不动。</summary>
        public void PrelaunchTerminal()
        {
            if (_disposed || _terminal != null)
            {
                return;
            }

            _terminalAttached = false;
            StartTerminal(TerminalSizeMemory.Default.Columns, TerminalSizeMemory.Default.Rows);
        }

        /// <summary>起一路新的 TUI 进程。</summary>
        private void StartTerminal(int columns, int rows)
        {
            StopTerminal();

            if (string.IsNullOrWhiteSpace(_executablePath))
            {
                PostTerminalExited(-1, "没有找到 claude 可执行文件，终端起不来。");
                return;
            }

            TerminalLaunchOptions effective = ResolveTerminalOptions();
            PanelDiagnostics.Log($"终端选项就绪 接回={(effective.ResumeSessionId.Length > 0 ? effective.ResumeSessionId.Substring(0, Math.Min(8, effective.ResumeSessionId.Length)) : "新开")}");

            // 拉网页会话时本地会话由 CLI 自己建，预分配的 id 用不上
            bool teleporting = effective.TeleportSessionId.Length > 0;
            effective.SessionId = teleporting ? string.Empty : Guid.NewGuid().ToString();

            _firstOutputSent = false;
            _terminalStartedUtc = DateTime.UtcNow;
            _warmUp.Begin(_terminalStartedUtc);

            var session = new ConPtySession();
            session.OutputReceived += OnTerminalOutput;
            session.Exited += OnTerminalExited;

            try
            {
                // 路径可能含空格，必须带引号；命令行由宿主拼，前端碰不到。
                string arguments = ClaudeCommandBuilder.BuildTerminalArguments(effective);
                string commandLine = "\"" + _executablePath + "\"";

                if (arguments.Length > 0)
                {
                    commandLine += " " + arguments;
                }

                string environmentBlock = ClaudeChildEnvironment.BuildBlock(
                    ClaudeChildEnvironment.Sanitize(ClaudeChildEnvironment.Current()));

                session.Start(commandLine, _workingDirectoryProvider(), columns, rows, environmentBlock);
                _terminal = session;
                _terminalColumns = columns;
                _terminalRows = rows;
                _terminalOptions = effective;
                PanelDiagnostics.Log("终端进程已起，等首批输出");

                // 必须回报**实际用上的**那套值，而不是前端以为的那套。
                PostTerminalStarted(effective);

                if (!teleporting)
                {
                    TerminalSessionStarted?.Invoke(this, effective.SessionId);
                }
            }
            catch (Exception ex)
            {
                // 起不来要说清楚为什么，不能只留一个空白的终端标签。
                session.OutputReceived -= OnTerminalOutput;
                session.Exited -= OnTerminalExited;
                session.Dispose();
                _warmUp.MarkExited();
                PostTerminalExited(-1, "终端启动失败：" + ex.Message);
            }
        }

        private TerminalLaunchOptions ResolveTerminalOptions()
        {
            Func<TerminalLaunchOptions>? provider = TerminalLaunchProvider;
            TerminalLaunchOptions effective = new TerminalLaunchOptions();

            if (provider != null)
            {
                effective = TerminalLaunchSanitizer.Sanitize(
                    provider(),
                    _knownModels,
                    _knownEfforts,
                    out IReadOnlyList<string> rejections);

                foreach (string reason in rejections)
                {
                    PostEvent(AgentEvent.Failure(reason));
                }
            }

            // 用户点了拉回，不管有没有 provider 都得用上，不能悄悄吞掉
            if (_pendingTeleportId.Length > 0)
            {
                // 一次性：这次起终端去拉网页会话，之后的重启照常
                effective.TeleportSessionId = _pendingTeleportId;
                effective.ResumeSessionId = string.Empty;
                _pendingTeleportId = string.Empty;
            }

            return effective;
        }

        private void PostTerminalStarted(TerminalLaunchOptions options)
        {
            var payload = new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["model"] = options.Model,
                ["effort"] = options.Effort,
                ["permissionMode"] = options.PermissionMode,
                ["remoteControl"] = options.RemoteControl
            };

            PostEnvelope(BridgeMessageTypes.TerminalStarted, payload);
        }

        private void HandleTerminalInput(string base64)
        {
            if (_terminal == null || string.IsNullOrEmpty(base64))
            {
                return;
            }

            byte[] data;

            try
            {
                data = Convert.FromBase64String(base64);
            }
            catch (FormatException)
            {
                // 坏 base64 只可能来自我们自己写的前端，丢掉即可，不该把桥搞崩。
                return;
            }

            if (_clearDetector.Feed(data))
            {
                TerminalClearDetected?.Invoke(this, EventArgs.Empty);
            }

            _terminal.Write(data);
        }

        private void OnTerminalOutput(object sender, byte[] chunk)
        {
            lock (_terminalBuffer)
            {
                _terminalBuffer.AddRange(chunk);
            }

            if (_warmUp.Feed(chunk.Length))
            {
                double seconds = (DateTime.UtcNow - _terminalStartedUtc).TotalSeconds;
                PanelDiagnostics.Log($"终端首屏已出 {seconds:0.00}s");
            }
        }

        private void OnTerminalExited(object sender, int exitCode)
        {
            if (!_dispatcher.CheckAccess())
            {
                _dispatcher.BeginInvoke(new Action(() => OnTerminalExited(sender, exitCode)));
                return;
            }

            _warmUp.MarkExited();

            // 退出前把攒下的最后一批输出发出去，否则用户看不到子进程的临终遗言。
            FlushTerminalOutput();
            PostTerminalExited(exitCode, null);
        }

        private void FlushTerminalOutput()
        {
            byte[] pending;

            lock (_terminalBuffer)
            {
                // 前端还没接上就不发：发出去也没人收，等接上时整屏重画
                if (!_terminalAttached || _terminalBuffer.Count == 0)
                {
                    return;
                }

                pending = _terminalBuffer.ToArray();
                _terminalBuffer.Clear();
            }

            if (!_firstOutputSent)
            {
                _firstOutputSent = true;
                PanelDiagnostics.Log($"终端首批输出已下发 {pending.Length} 字节");
            }

            var payload = new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["data"] = Convert.ToBase64String(pending)
            };

            // 前端写这一批时丢掉 xterm 对旧查询的应答
            if (_replayPending)
            {
                _replayPending = false;
                payload["replay"] = true;
            }

            PostEnvelope(BridgeMessageTypes.TerminalOutput, payload);
        }

        private void PostTerminalExited(int exitCode, string? message)
        {
            var payload = new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["exitCode"] = exitCode,
                ["message"] = message ?? string.Empty
            };

            PostEnvelope(BridgeMessageTypes.TerminalExited, payload);
        }

        private void StopTerminal()
        {
            _attachTimer?.Stop();

            ConPtySession? terminal = _terminal;
            _terminal = null;

            if (terminal == null)
            {
                return;
            }

            _warmUp.MarkExited();

            terminal.OutputReceived -= OnTerminalOutput;
            terminal.Exited -= OnTerminalExited;

            // Dispose 同步等进程退出最多 3 秒，移出 UI 线程免卡。
            System.Threading.Tasks.Task.Run(() =>
            {
                terminal.Dispose();
                PanelDiagnostics.Log("终端旧进程已清理（后台）");
            });

            _terminalOptions = null;

            lock (_terminalBuffer)
            {
                _terminalBuffer.Clear();
            }
        }

        private void HandleQuery(string option, string value, string requestId)
        {
            if (option == "files")
            {
                HandleFileSearch(value, requestId);
                return;
            }

            if (option == "fileContent")
            {
                HandleFileContent(value, requestId);
                return;
            }

            if (option == "pickFile")
            {
                HandleFilePick(requestId);
                return;
            }

            if (option == "clipboardFiles")
            {
                HandleClipboardFiles(requestId);
                return;
            }

            if (option == "saveImage")
            {
                HandleSaveImage(value, requestId);
                return;
            }

            if (option == "login")
            {
                HandleLogin(value, requestId);
                return;
            }

            if (option == "loginCode")
            {
                HandleLoginCode(value, requestId);
                return;
            }

            if (option == "loginDocs")
            {
                OpenInBrowser(ThirdPartyProvidersDocUrl);
                return;
            }

            if (option == "logout")
            {
                HandleLogout(requestId);
                return;
            }

            if (option == "sideQuestion")
            {
                HandleSideQuestion(value, requestId);
                return;
            }

            if (option == "skills")
            {
                HandleSkillsDialog(requestId);
                return;
            }

            if (option == "setSkillState")
            {
                HandleSetSkillState(value, requestId);
                return;
            }

            if (option == "cliDialog")
            {
                HandleCliDialog(value, null, requestId);
                return;
            }

            if (option == "cliEdit")
            {
                HandleCliEdit(value, requestId);
                return;
            }

            if (option == "reloadPlugins")
            {
                HandleReloadPlugins(requestId);
                return;
            }

            if (option == "background")
            {
                HandleBackground(value, requestId);
                return;
            }

            if (option == "feedback")
            {
                HandleFeedback(value, requestId);
                return;
            }

            if (option == "designLogin")
            {
                HandleDesignLogin(value, requestId);
                return;
            }

            if (option == "memoryFile")
            {
                HandleMemoryFile(value, requestId);
                return;
            }

            if (option == "chromeConnect")
            {
                HandleChromeConnect(value == "on", requestId);
                return;
            }

            if (option == "chromeBrowsers")
            {
                HandleChromeBrowsers(null, requestId);
                return;
            }

            if (option == "chromeSelect")
            {
                HandleChromeBrowsers(value, requestId);
                return;
            }

            if (option == "openLink")
            {
                OpenClaudeLink(value);
                return;
            }

            if (option == "openWebLink")
            {
                OpenWebLink(value);
                return;
            }

            if (option == "revealFeedback")
            {
                RevealFeedbackBundle(value);
                return;
            }

            if (option == "openMemoryFolder")
            {
                OpenMemoryFolder();
                return;
            }

            if (option == "permissionRules")
            {
                HandlePermissionRules(null, requestId);
                return;
            }

            if (option == "editPermissionRules")
            {
                HandlePermissionRules(value, requestId);
                return;
            }
        }

        #region 记忆与沙箱等设置弹窗

        /// <summary>弹窗名 → 读数据的控制请求。</summary>
        private static readonly Dictionary<string, string> CliDialogRequests =
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["memory"] = "{\"subtype\":\"get_memory_dialog\"}",
                ["sandbox"] = "{\"subtype\":\"get_sandbox_dialog\"}",
                ["hooks"] = "{\"subtype\":\"get_hooks_listing\"}",
                ["chrome"] = "{\"subtype\":\"get_chrome_dialog\"}"
            };

        /// <summary>弹窗名 → 改设置的子命令。</summary>
        private static readonly Dictionary<string, string> CliEditSubcommands =
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["memory"] = "edit-memory-settings",
                ["sandbox"] = "edit-sandbox-settings",
                ["hooks"] = "edit-hook",
                ["chrome"] = "edit-chrome-settings"
            };

        /// <summary>读一个设置弹窗的数据；edit 不为空时先改再反复重读。</summary>
        private async void HandleCliDialog(string name, string? editInput, string requestId)
        {
            string dialog = string.Empty;
            string error = string.Empty;

            try
            {
                if (!CliDialogRequests.TryGetValue(name ?? string.Empty, out string? request))
                {
                    throw new InvalidOperationException("不认识的设置弹窗。");
                }

                ClaudeStreamJsonSession session = RequireCliSession();

                if (editInput == null)
                {
                    dialog = await session.SendControlRequestAsync(request);
                }
                else
                {
                    string before = await session.SendControlRequestAsync(request);

                    var runner = new ClaudeSubcommandRunner();
                    string subcommand = CliEditSubcommands[name!];
                    var arguments = new[] { subcommand, "--json" };

                    SubcommandOutcome outcome = await runner.RunWithInputAsync(
                        _executablePath, arguments, editInput, _workingDirectoryProvider(), _shutdownCts.Token);

                    error = DescribeSubcommandFailure("claude " + subcommand, outcome);

                    string refusal = HookEditRules.DescribeRefusal(outcome.StandardOutput);

                    if (refusal.Length > 0)
                    {
                        error = refusal;
                    }
                    dialog = error.Length == 0 ? await RereadUntilChangedAsync(session, request, before) : before;
                }
            }
            catch (Exception ex)
            {
                error = ex.Message;
            }

            PostCliDialog(name ?? string.Empty, requestId, dialog, error);
        }

        /// <summary>改设置：value 为 {name, edit}，按弹窗白名单校验后交给子命令。</summary>
        private void HandleCliEdit(string value, string requestId)
        {
            string name = string.Empty;

            try
            {
                using (JsonDocument document = JsonDocument.Parse(value))
                {
                    name = ReadString(document.RootElement, "name");

                    if (!document.RootElement.TryGetProperty("edit", out JsonElement edit))
                    {
                        throw new InvalidOperationException("缺少要改的内容。");
                    }

                    string input = name == "memory" ? BuildMemoryEdit(edit)
                        : name == "sandbox" ? BuildSandboxEdit(edit)
                        : name == "hooks" ? HookEditRules.Build(edit)
                        : name == "chrome" ? BuildChromeEdit(edit)
                        : throw new InvalidOperationException("不认识的设置弹窗。");
                    HandleCliDialog(name, input, requestId);
                }
            }
            catch (Exception ex)
            {
                PostCliDialog(name, requestId, string.Empty, ex.Message);
            }
        }

        /// <summary>记忆设置只允许一个键：autoMemoryEnabled 或 autoDreamEnabled，值为布尔。</summary>
        private static string BuildMemoryEdit(JsonElement edit)
        {
            var input = new Dictionary<string, bool>(StringComparer.Ordinal);

            if (edit.ValueKind == JsonValueKind.Object)
            {
                foreach (JsonProperty property in edit.EnumerateObject())
                {
                    bool knownKey = property.Name == "autoMemoryEnabled" || property.Name == "autoDreamEnabled";
                    bool isBool = property.Value.ValueKind == JsonValueKind.True || property.Value.ValueKind == JsonValueKind.False;

                    if (!knownKey || !isBool)
                    {
                        throw new InvalidOperationException("不是有效的记忆设置修改。");
                    }

                    input[property.Name] = property.Value.GetBoolean();
                }
            }

            if (input.Count != 1)
            {
                throw new InvalidOperationException("不是有效的记忆设置修改。");
            }

            string json = JsonSerializer.Serialize(input);
            return json;
        }

        /// <summary>沙箱设置只认 mode / allowUnsandboxedCommands / excludeCommand 三个键。</summary>
        private static string BuildSandboxEdit(JsonElement edit)
        {
            var input = new Dictionary<string, object>(StringComparer.Ordinal);

            if (edit.ValueKind == JsonValueKind.Object)
            {
                foreach (JsonProperty property in edit.EnumerateObject())
                {
                    JsonElement item = property.Value;

                    if (property.Name == "mode" && item.ValueKind == JsonValueKind.String
                        && (item.GetString() == "auto-allow" || item.GetString() == "regular" || item.GetString() == "disabled"))
                    {
                        input["mode"] = item.GetString()!;
                    }
                    else if (property.Name == "allowUnsandboxedCommands"
                        && (item.ValueKind == JsonValueKind.True || item.ValueKind == JsonValueKind.False))
                    {
                        input["allowUnsandboxedCommands"] = item.GetBoolean();
                    }
                    else if (property.Name == "excludeCommand" && item.ValueKind == JsonValueKind.String
                        && IsUsableCommand(item.GetString()))
                    {
                        input["excludeCommand"] = item.GetString()!.Trim();
                    }
                    else
                    {
                        throw new InvalidOperationException("不是有效的沙箱设置修改。");
                    }
                }
            }

            if (input.Count == 0)
            {
                throw new InvalidOperationException("不是有效的沙箱设置修改。");
            }

            string json = JsonSerializer.Serialize(input);
            return json;
        }

        /// <summary>排除命令去掉首尾空白后须为 1~1000 字。</summary>
        private static bool IsUsableCommand(string? command)
        {
            int length = (command ?? string.Empty).Trim().Length;
            bool usable = length > 0 && length <= 1000;
            return usable;
        }

        /// <summary>把设置弹窗数据回给前端。</summary>
        private void PostCliDialog(string name, string requestId, string dialog, string error)
        {
            if (_disposed)
            {
                return;
            }

            var payload = new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["kind"] = "cliDialog",
                ["name"] = name,
                ["requestId"] = requestId ?? string.Empty,
                ["dialog"] = dialog,
                ["error"] = error
            };

            string json = SerializeEnvelope(BridgeMessageTypes.Context, payload);
            TrySend(json);
        }

        #endregion

        #region 重载插件与转后台

        /// <summary>取其他已起 tab 的会话；重载插件时一并重载。宿主不设就只重载本 tab。</summary>
        public Func<IReadOnlyList<ClaudeStreamJsonSession>>? OtherSessionsProvider { get; set; }

        /// <summary>重载插件：本 tab 先重载并报错误数，再逐个重载其他 tab。</summary>
        private async void HandleReloadPlugins(string requestId)
        {
            string error = string.Empty;
            int errorCount = 0;
            int otherTabs = 0;
            int otherFailed = 0;

            try
            {
                ClaudeStreamJsonSession session = RequireCliSession();
                errorCount = await ReloadPluginsAsync(session);
            }
            catch (Exception ex)
            {
                error = ex.Message;
            }

            IReadOnlyList<ClaudeStreamJsonSession> others =
                OtherSessionsProvider?.Invoke() ?? Array.Empty<ClaudeStreamJsonSession>();

            foreach (ClaudeStreamJsonSession other in others)
            {
                otherTabs++;

                try
                {
                    // 别的 tab 一个个来：插件重载要读盘，并发没好处
                    await ReloadPluginsAsync(other);
                }
                catch (Exception)
                {
                    otherFailed++;
                }
            }

            PostSimpleResult("reloadPlugins", requestId, error, new Dictionary<string, object>
            {
                ["errorCount"] = errorCount,
                ["otherTabs"] = otherTabs,
                ["otherFailed"] = otherFailed
            });
        }

        /// <summary>对一个会话先 get_settings 再 reload_plugins，返回加载出错的插件数。</summary>
        private static async Task<int> ReloadPluginsAsync(ClaudeStreamJsonSession session)
        {
            await session.SendControlRequestAsync("{\"subtype\":\"get_settings\"}");
            string response = await session.SendControlRequestAsync("{\"subtype\":\"reload_plugins\"}");

            using (JsonDocument document = JsonDocument.Parse(response))
            {
                int errorCount = ReadInt(document.RootElement, "error_count");
                return errorCount;
            }
        }

        /// <summary>把正在跑的工具调用转到后台；value 为 tool_use 的 id。</summary>
        private async void HandleBackground(string toolUseId, string requestId)
        {
            string error = string.Empty;
            bool moved = false;

            try
            {
                if (string.IsNullOrWhiteSpace(toolUseId) || toolUseId.Length > 500)
                {
                    throw new InvalidOperationException("没有可转后台的工具调用。");
                }

                ClaudeStreamJsonSession session = RequireCliSession();
                string body = "{\"subtype\":\"background_tasks\",\"tool_use_id\":" + JsonSerializer.Serialize(toolUseId) + "}";
                string response = await session.SendControlRequestAsync(body);

                using (JsonDocument document = JsonDocument.Parse(response))
                {
                    // CLI 没说就按转成了算，与 VS Code 版一致
                    moved = !(document.RootElement.ValueKind == JsonValueKind.Object
                        && document.RootElement.TryGetProperty("backgrounded", out JsonElement flag)
                        && flag.ValueKind == JsonValueKind.False);
                }
            }
            catch (Exception ex)
            {
                error = ex.Message;
            }

            PostSimpleResult("background", requestId, error, new Dictionary<string, object>
            {
                ["moved"] = moved,
                ["toolUseId"] = toolUseId ?? string.Empty
            });
        }

        /// <summary>提交反馈：value 为 {description, saveLocally}；saveLocally 时只存本机。</summary>
        private async void HandleFeedback(string value, string requestId)
        {
            string error = string.Empty;
            string feedbackId = string.Empty;
            string bundlePath = string.Empty;

            try
            {
                string description;
                bool saveLocally;

                using (JsonDocument document = JsonDocument.Parse(value))
                {
                    description = ReadString(document.RootElement, "description").Trim();
                    saveLocally = ReadBool(document.RootElement, "saveLocally");
                }

                if (description.Length == 0 || description.Length > 20000)
                {
                    throw new InvalidOperationException("反馈内容不能为空，也不能超过 20000 字。");
                }

                ClaudeStreamJsonSession session = RequireCliSession();
                string body = "{\"subtype\":\"submit_feedback\",\"description\":" + JsonSerializer.Serialize(description)
                            + ",\"surface\":\"ide\",\"save_locally\":" + (saveLocally ? "true" : "false") + "}";
                string response = await session.SendControlRequestAsync(body);

                using (JsonDocument document = JsonDocument.Parse(response))
                {
                    JsonElement root = document.RootElement;
                    feedbackId = ReadString(root, "feedback_id");
                    bundlePath = ReadString(root, "bundle_path");

                    string unavailable = ReadString(root, "unavailable_reason");
                    string failure = ReadString(root, "failure_reason");
                    error = unavailable.Length > 0 ? unavailable : failure;
                }

                error = FeedbackOutcome.Check(error, saveLocally, feedbackId, bundlePath);
            }
            catch (Exception ex)
            {
                error = ex.Message;
            }

            PostSimpleResult("feedback", requestId, error, new Dictionary<string, object>
            {
                ["feedbackId"] = feedbackId,
                ["bundlePath"] = bundlePath
            });
        }

        /// <summary>在资源管理器里显示本机保存的反馈报告；只认 ~/.claude/feedback-bundles 下的文件。</summary>
        private static void RevealFeedbackBundle(string path)
        {
            try
            {
                string root = Path.GetFullPath(Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".claude", "feedback-bundles"))
                    .TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                string full = Path.GetFullPath(path ?? string.Empty);

                if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase) || !File.Exists(full))
                {
                    return;
                }

                var startInfo = new ProcessStartInfo("explorer.exe", "/select,\"" + full + "\"") { UseShellExecute = true };
                Process.Start(startInfo);
            }
            catch (Exception)
            {
                // 打不开文件夹不影响反馈本身，界面上已显示路径
            }
        }

        #region 记忆文件

        /// <summary>在资源管理器里打开自动记忆文件夹；路径向 CLI 要，不信前端。</summary>
        private async void OpenMemoryFolder()
        {
            try
            {
                ClaudeStreamJsonSession session = RequireCliSession();
                string dialog = await session.SendControlRequestAsync("{\"subtype\":\"get_memory_dialog\"}");
                string autoFolder = string.Empty;

                using (JsonDocument document = JsonDocument.Parse(dialog))
                {
                    JsonElement root = document.RootElement;

                    if (root.TryGetProperty("folders", out JsonElement folders) && folders.ValueKind == JsonValueKind.Array)
                    {
                        foreach (JsonElement folder in folders.EnumerateArray())
                        {
                            if (ReadString(folder, "kind") == "auto")
                            {
                                autoFolder = ReadString(folder, "path");
                            }
                        }
                    }
                }

                if (autoFolder.Length == 0)
                {
                    return;
                }

                // 还没记过东西时文件夹可能不存在，先建出来再打开
                Directory.CreateDirectory(autoFolder);

                var startInfo = new ProcessStartInfo("explorer.exe", "\"" + Path.GetFullPath(autoFolder) + "\"")
                {
                    UseShellExecute = true
                };
                Process.Start(startInfo);
            }
            catch (Exception ex)
            {
                PostRawNotice(ex.Message);
            }
        }

        /// <summary>
        /// 记忆文件的读、写、删：value 为 {op: read/write/delete, path, content?, version?}。
        /// 每次都向 CLI 重新要清单，只认清单里列出、且在自动记忆文件夹内的文件。
        /// </summary>
        private async void HandleMemoryFile(string value, string requestId)
        {
            string op = string.Empty;
            var extra = new Dictionary<string, object>();
            string error = string.Empty;

            try
            {
                string path;
                string content;
                string version;

                using (JsonDocument document = JsonDocument.Parse(value))
                {
                    JsonElement root = document.RootElement;
                    op = ReadString(root, "op");
                    path = ReadString(root, "path");
                    content = ReadString(root, "content");
                    version = ReadString(root, "version");
                }

                ClaudeStreamJsonSession session = RequireCliSession();
                string dialog = await session.SendControlRequestAsync("{\"subtype\":\"get_memory_dialog\"}");

                var listed = new HashSet<string>(StringComparer.Ordinal);
                string autoFolder = string.Empty;
                string name = string.Empty;

                using (JsonDocument document = JsonDocument.Parse(dialog))
                {
                    JsonElement root = document.RootElement;

                    if (root.TryGetProperty("memories", out JsonElement memories) && memories.ValueKind == JsonValueKind.Array)
                    {
                        foreach (JsonElement memory in memories.EnumerateArray())
                        {
                            string listedPath = ReadString(memory, "path");
                            listed.Add(listedPath);

                            if (listedPath == path)
                            {
                                name = ReadString(memory, "name");
                            }
                        }
                    }

                    if (root.TryGetProperty("folders", out JsonElement folders) && folders.ValueKind == JsonValueKind.Array)
                    {
                        foreach (JsonElement folder in folders.EnumerateArray())
                        {
                            if (ReadString(folder, "kind") == "auto")
                            {
                                autoFolder = ReadString(folder, "path");
                            }
                        }
                    }
                }

                // 文件读写放后台线程，别卡 UI
                MemoryFileContent? result = await Task.Run(() =>
                {
                    switch (op)
                    {
                        case "read":
                            return MemoryFileGuard.Read(path, autoFolder, listed);

                        case "write":
                            return MemoryFileGuard.Write(path, content, version, autoFolder, listed, DateTime.UtcNow);

                        case "delete":
                            MemoryFileGuard.Delete(path, name, version, autoFolder, listed);
                            return null;

                        default:
                            throw new InvalidOperationException("不认识的记忆文件操作。");
                    }
                });

                if (result != null)
                {
                    extra["content"] = result.Content;
                    extra["version"] = result.Version;
                    extra["editable"] = result.Editable;
                }
            }
            catch (Exception ex)
            {
                error = ex.Message;
            }

            extra["op"] = op;
            PostSimpleResult("memoryFile", requestId, error, extra);
        }

        #endregion

        #region Chrome

        /// <summary>接入时给会话加的工具服务器名，与 VS Code 版一致。</summary>
        private const string ChromeServerName = "claude-in-chrome";

        /// <summary>本会话是否由我们接入了浏览器。</summary>
        private bool _chromeConnected;

        /// <summary>Chrome 设置只认一个键：enabledByDefault，布尔。</summary>
        private static string BuildChromeEdit(JsonElement edit)
        {
            if (edit.ValueKind == JsonValueKind.Object
                && edit.TryGetProperty("enabledByDefault", out JsonElement flag)
                && (flag.ValueKind == JsonValueKind.True || flag.ValueKind == JsonValueKind.False))
            {
                int count = 0;

                foreach (JsonProperty unused in edit.EnumerateObject())
                {
                    count++;
                }

                if (count == 1)
                {
                    string json = JsonSerializer.Serialize(new Dictionary<string, bool> { ["enabledByDefault"] = flag.GetBoolean() });
                    return json;
                }
            }

            throw new InvalidOperationException("不是有效的 Chrome 设置修改。");
        }

        /// <summary>本会话接入或断开浏览器：经 mcp_set_servers 加或去掉 claude-in-chrome。</summary>
        private async void HandleChromeConnect(bool on, string requestId)
        {
            string error = string.Empty;

            try
            {
                ClaudeStreamJsonSession session = RequireCliSession();

                var servers = new Dictionary<string, object>(StringComparer.Ordinal);

                if (on)
                {
                    servers[ChromeServerName] = new Dictionary<string, object>
                    {
                        ["type"] = "stdio",
                        ["command"] = _executablePath,
                        ["args"] = new[] { "--claude-in-chrome-mcp" }
                    };
                }

                string body = "{\"subtype\":\"mcp_set_servers\",\"servers\":" + JsonSerializer.Serialize(servers) + "}";
                await session.SendControlRequestAsync(body);
                _chromeConnected = on;
            }
            catch (Exception ex)
            {
                error = ex.Message;
            }

            // 失败时不带 connected：实际状态说不准，交给界面重读
            var extra = new Dictionary<string, object>();

            if (error.Length == 0)
            {
                extra["connected"] = _chromeConnected;
            }

            PostSimpleResult("chromeConnect", requestId, error, extra);
        }

        /// <summary>列出可用浏览器；deviceId 不为空时先选中它。</summary>
        private async void HandleChromeBrowsers(string? deviceId, string requestId)
        {
            string error = string.Empty;
            string browsers = string.Empty;

            try
            {
                ClaudeStreamJsonSession session = RequireCliSession();

                if (deviceId != null)
                {
                    if (deviceId.Length == 0 || deviceId.Length > 500)
                    {
                        throw new InvalidOperationException("没有选中浏览器。");
                    }

                    await session.SendControlRequestAsync(
                        "{\"subtype\":\"select_chrome_browser\",\"device_id\":" + JsonSerializer.Serialize(deviceId) + "}");
                }

                browsers = await session.SendControlRequestAsync("{\"subtype\":\"get_chrome_browsers\"}");
            }
            catch (Exception ex)
            {
                error = ex.Message;
            }

            PostSimpleResult("chromeBrowsers", requestId, error, new Dictionary<string, object>
            {
                ["browsers"] = browsers
            });
        }

        /// <summary>打开 Claude 自家的链接（安装扩展、调权限等）；别的域名一律不开。</summary>
        private static void OpenClaudeLink(string url)
        {
            if (!Uri.TryCreate(url ?? string.Empty, UriKind.Absolute, out Uri? uri) || uri.Scheme != Uri.UriSchemeHttps)
            {
                return;
            }

            string host = uri.Host.ToLowerInvariant();
            bool trusted = host == "claude.ai" || host.EndsWith(".claude.ai", StringComparison.Ordinal)
                || host == "claude.com" || host.EndsWith(".claude.com", StringComparison.Ordinal)
                || host == "clau.de";

            if (trusted)
            {
                OpenInBrowser(uri.AbsoluteUri);
            }
        }

        /// <summary>用户点了回复里的网页链接：交给系统浏览器。</summary>
        private static void OpenWebLink(string url)
        {
            if (!Uri.TryCreate(url ?? string.Empty, UriKind.Absolute, out Uri? uri)
                || (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp))
            {
                return;
            }

            try
            {
                var startInfo = new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true };
                Process.Start(startInfo);
            }
            catch (Exception)
            {
                // 打不开就算了，链接文字还在
            }
        }

        #endregion

        #region Claude Design 登录

        /// <summary>正在进行的 Design 登录；没有为 null。</summary>
        private DesignLoginProcess? _designLogin;

        /// <summary>Design 登录：value 为 status / start / cancel，或 code:授权码。</summary>
        private async void HandleDesignLogin(string value, string requestId)
        {
            string action = value ?? string.Empty;

            try
            {
                if (action == "status")
                {
                    await PostDesignStatusAsync(requestId);
                    return;
                }

                if (action == "start")
                {
                    StartDesignLogin(requestId);
                    return;
                }

                if (action == "cancel")
                {
                    _designLogin?.Cancel();
                    _designLogin = null;
                    return;
                }

                if (action.StartsWith("code:", StringComparison.Ordinal))
                {
                    if (_designLogin == null)
                    {
                        throw new InvalidOperationException("没有正在进行的登录，请重新开始。");
                    }

                    _designLogin.SubmitCode(action.Substring("code:".Length));
                    return;
                }

                throw new InvalidOperationException("不认识的 Design 登录操作。");
            }
            catch (Exception ex)
            {
                PostDesignState(requestId, "error", new Dictionary<string, object> { ["message"] = ex.Message });
            }
        }

        /// <summary>查登录状态：claude design-login --json --status。</summary>
        private async Task PostDesignStatusAsync(string requestId)
        {
            var runner = new ClaudeSubcommandRunner();
            var arguments = new[] { "design-login", "--json", "--status" };

            SubcommandOutcome outcome = await runner.RunWithInputAsync(
                _executablePath, arguments, "{}", _workingDirectoryProvider(), _shutdownCts.Token);

            string failure = DescribeSubcommandFailure("claude design-login", outcome);

            if (failure.Length > 0)
            {
                throw new InvalidOperationException(failure);
            }

            string[] lines = outcome.StandardOutput.Trim().Split('\n');

            using (JsonDocument document = JsonDocument.Parse(lines[lines.Length - 1]))
            {
                JsonElement root = document.RootElement;

                PostDesignState(requestId, "status", new Dictionary<string, object>
                {
                    ["available"] = ReadBool(root, "available"),
                    ["signedIn"] = ReadBool(root, "signed_in"),
                    ["canSignInHere"] = ReadBool(root, "can_sign_in_here"),
                    ["message"] = ReadString(root, "reason")
                });
            }
        }

        /// <summary>起登录进程；网址到了替用户开浏览器，结束时回结果。</summary>
        private void StartDesignLogin(string requestId)
        {
            if (_designLogin != null)
            {
                throw new InvalidOperationException("已经有一个登录在等待完成。");
            }

            DesignLoginProcess login = DesignLoginProcess.Start(_executablePath, _workingDirectoryProvider());
            _designLogin = login;

            login.PagesReady += (url, manualUrl, manualFirst) => _dispatcher.BeginInvoke(new Action(() =>
            {
                // 排队期间已被取消：不再开一个作废的登录页
                if (!ReferenceEquals(_designLogin, login))
                {
                    return;
                }

                OpenInBrowser(manualFirst && manualUrl.Length > 0 ? manualUrl : url);
                PostDesignState(requestId, "pages", new Dictionary<string, object>
                {
                    ["url"] = url,
                    ["manualUrl"] = manualUrl
                });
            }));

            login.Finished += (ok, message) => _dispatcher.BeginInvoke(new Action(() =>
            {
                if (ReferenceEquals(_designLogin, login))
                {
                    _designLogin = null;
                }

                PostDesignState(requestId, "done", new Dictionary<string, object>
                {
                    ["ok"] = ok,
                    ["message"] = message
                });
            }));
        }

        /// <summary>回报 Design 登录进度。</summary>
        private void PostDesignState(string requestId, string stage, Dictionary<string, object> extra)
        {
            extra["stage"] = stage;
            PostSimpleResult("designLogin", requestId, stage == "error" ? (string)extra["message"] : string.Empty, extra);
        }

        #endregion

        /// <summary>回一个简单结果：kind、requestId、error 加额外字段。</summary>
        private void PostSimpleResult(string kind, string requestId, string error, Dictionary<string, object> extra)
        {
            if (_disposed)
            {
                return;
            }

            var payload = new Dictionary<string, object>(extra, StringComparer.Ordinal)
            {
                ["kind"] = kind,
                ["requestId"] = requestId ?? string.Empty,
                ["error"] = error
            };

            string json = SerializeEnvelope(BridgeMessageTypes.Context, payload);
            TrySend(json);
        }

        #endregion

        #region 权限规则

        /// <summary>规则种类。</summary>
        private static readonly HashSet<string> RuleBehaviors =
            new HashSet<string>(StringComparer.Ordinal) { "allow", "deny", "ask" };

        /// <summary>能写入的三个设置文件。</summary>
        private static readonly HashSet<string> RuleDestinations =
            new HashSet<string>(StringComparer.Ordinal) { "userSettings", "projectSettings", "localSettings" };

        /// <summary>读规则清单；edit 不为空时先跑 claude edit-permission-rules 再重读。</summary>
        private async void HandlePermissionRules(string? edit, string requestId)
        {
            string state = string.Empty;
            string error = string.Empty;
            string warnings = "[]";

            try
            {
                ClaudeStreamJsonSession session = RequireCliSession();

                if (edit == null)
                {
                    state = await session.SendControlRequestAsync(ListRulesRequest);
                }
                else
                {
                    string input = BuildPermissionEdit(edit);
                    string before = await session.SendControlRequestAsync(ListRulesRequest);

                    var runner = new ClaudeSubcommandRunner();
                    var arguments = new[] { "edit-permission-rules", "--json" };

                    SubcommandOutcome outcome = await runner.RunWithInputAsync(
                        _executablePath, arguments, input, _workingDirectoryProvider(), _shutdownCts.Token);

                    error = DescribeSubcommandFailure("claude edit-permission-rules", outcome);
                    warnings = ReadEditWarnings(outcome.StandardOutput);

                    state = error.Length == 0
                        ? await RereadUntilChangedAsync(session, ListRulesRequest, before)
                        : before;
                }
            }
            catch (Exception ex)
            {
                error = ex.Message;
            }

            if (_disposed)
            {
                return;
            }

            ReadPermissionSettings(out string workspace, out string defaultModes);

            var payload = new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["kind"] = "permissionRules",
                ["requestId"] = requestId ?? string.Empty,
                ["state"] = state,
                ["warnings"] = warnings,
                ["error"] = error,
                ["workspace"] = workspace,
                ["defaultModes"] = defaultModes
            };

            string json = SerializeEnvelope(BridgeMessageTypes.Context, payload);
            TrySend(json);
        }

        /// <summary>读规则清单的控制请求。</summary>
        private const string ListRulesRequest = "{\"subtype\":\"list_permission_rules\"}";

        /// <summary>读一次设置文件，给出工作区目录与默认模式的 JSON；读不出来给空数组。</summary>
        private void ReadPermissionSettings(out string workspace, out string defaultModes)
        {
            workspace = "[]";
            defaultModes = "[]";

            try
            {
                string workingDirectory = _workingDirectoryProvider();
                IReadOnlyList<PanelItem> items = PermissionSettingsReader.List(workingDirectory);

                workspace = JsonSerializer.Serialize(PermissionWorkspaceReader.Compose(workingDirectory, items));
                defaultModes = JsonSerializer.Serialize(PermissionDefaultModeReader.Compose(items));
            }
            catch (Exception)
            {
                // 设置文件读不出来不挡规则显示
            }
        }

        /// <summary>写完设置后重读，直到和改前不同；CLI 读盘有延迟，最多等约 4 秒。</summary>
        private static async Task<string> RereadUntilChangedAsync(
            ClaudeStreamJsonSession session, string request, string before)
        {
            string current = await session.SendControlRequestAsync(request);

            for (int attempt = 0; attempt < 14 && current == before; attempt++)
            {
                await Task.Delay(300);
                current = await session.SendControlRequestAsync(request);
            }

            return current;
        }

        /// <summary>校验前端给的增删请求，拼成子命令输入。</summary>
        private static string BuildPermissionEdit(string value)
        {
            using (JsonDocument document = JsonDocument.Parse(value))
            {
                JsonElement root = document.RootElement;
                string op = ReadString(root, "op");
                string behavior = ReadString(root, "behavior");

                if (!RuleBehaviors.Contains(behavior))
                {
                    throw new InvalidOperationException("规则种类只能是 allow / deny / ask。");
                }

                var edit = new Dictionary<string, object>(StringComparer.Ordinal)
                {
                    ["op"] = op,
                    ["behavior"] = behavior
                };

                if (op == "add")
                {
                    var rules = new List<string>();
                    ReadStringArray(root, "rules", rules);
                    rules.RemoveAll(rule => rule.Trim().Length == 0);

                    string destination = ReadString(root, "destination");

                    if (rules.Count == 0 || rules.Count > 100 || rules.Exists(rule => rule.Length > 10000)
                        || !RuleDestinations.Contains(destination))
                    {
                        throw new InvalidOperationException("不是有效的新增规则请求。");
                    }

                    edit["rules"] = rules.ConvertAll(rule => rule.Trim());
                    edit["destination"] = destination;
                }
                else if (op == "remove")
                {
                    string rule = ReadString(root, "rule");
                    string source = ReadString(root, "source");

                    if (rule.Length == 0 || rule.Length > 10000 || !RuleDestinations.Contains(source))
                    {
                        throw new InvalidOperationException("不是有效的删除规则请求。");
                    }

                    edit["rule"] = rule;
                    edit["source"] = source;
                }
                else
                {
                    throw new InvalidOperationException("不认识的规则操作。");
                }

                string input = JsonSerializer.Serialize(edit);
                return input;
            }
        }

        /// <summary>从子命令最后一行 JSON 里取 warnings，取不到给空数组。</summary>
        private static string ReadEditWarnings(string standardOutput)
        {
            string[] lines = (standardOutput ?? string.Empty).Trim().Split('\n');
            string last = lines[lines.Length - 1].Trim();

            try
            {
                using (JsonDocument document = JsonDocument.Parse(last))
                {
                    if (document.RootElement.ValueKind != JsonValueKind.Object)
                    {
                        return "[]";
                    }

                    var warnings = new List<string>();
                    ReadStringArray(document.RootElement, "warnings", warnings);

                    string json = JsonSerializer.Serialize(warnings);
                    return json;
                }
            }
            catch (JsonException)
            {
                return "[]";
            }
        }

        #endregion

        #region 技能

        /// <summary>技能能设的四种状态。</summary>
        private static readonly HashSet<string> SkillStates =
            new HashSet<string>(StringComparer.Ordinal) { "on", "name-only", "user-invocable-only", "off" };

        /// <summary>读技能清单（get_skills_dialog）回给前端。</summary>
        private async void HandleSkillsDialog(string requestId)
        {
            string dialog = string.Empty;
            string error = string.Empty;

            try
            {
                dialog = await ReadSkillsDialogAsync();
            }
            catch (Exception ex)
            {
                error = ex.Message;
            }

            PostSkills(requestId, dialog, error);
        }

        /// <summary>改一个技能的状态：跑 claude edit-skill-overrides，再重读清单。</summary>
        private async void HandleSetSkillState(string value, string requestId)
        {
            string dialog = string.Empty;
            string error;

            try
            {
                string input = BuildSkillEdit(value);
                string before = await ReadSkillsDialogAsync();

                var runner = new ClaudeSubcommandRunner();
                var arguments = new[] { "edit-skill-overrides", "--json" };

                SubcommandOutcome outcome = await runner.RunWithInputAsync(
                    _executablePath, arguments, input, _workingDirectoryProvider(), _shutdownCts.Token);

                error = DescribeSubcommandFailure("claude edit-skill-overrides", outcome);
                dialog = error.Length == 0
                    ? await RereadUntilChangedAsync(RequireCliSession(), "{\"subtype\":\"get_skills_dialog\"}", before)
                    : before;
            }
            catch (Exception ex)
            {
                error = ex.Message;
            }

            PostSkills(requestId, dialog, error);
        }

        /// <summary>校验前端给的 {name, state, handles}，拼成子命令的输入。</summary>
        private static string BuildSkillEdit(string value)
        {
            using (JsonDocument document = JsonDocument.Parse(value))
            {
                JsonElement root = document.RootElement;
                string name = ReadString(root, "name");
                string state = ReadString(root, "state");

                if (name.Length == 0 || name.Length > 500 || !SkillStates.Contains(state))
                {
                    throw new InvalidOperationException("不是有效的技能状态修改。");
                }

                var edit = new Dictionary<string, object>(StringComparer.Ordinal)
                {
                    ["name"] = name,
                    ["state"] = state
                };

                if (root.TryGetProperty("handles", out JsonElement handles) && handles.ValueKind == JsonValueKind.Object)
                {
                    edit["handles"] = handles.Clone();
                }

                string input = JsonSerializer.Serialize(edit);
                return input;
            }
        }

        /// <summary>向 CLI 要技能清单，原样返回回包正文。</summary>
        private Task<string> ReadSkillsDialogAsync()
        {
            ClaudeStreamJsonSession session = RequireCliSession();
            Task<string> read = session.SendControlRequestAsync("{\"subtype\":\"get_skills_dialog\"}");
            return read;
        }

        /// <summary>把技能清单或错误回给前端。</summary>
        private void PostSkills(string requestId, string dialog, string error)
        {
            if (_disposed)
            {
                return;
            }

            var payload = new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["kind"] = "skills",
                ["requestId"] = requestId ?? string.Empty,
                ["dialog"] = dialog,
                ["error"] = error
            };

            string json = SerializeEnvelope(BridgeMessageTypes.Context, payload);
            TrySend(json);
        }

        #endregion

        /// <summary>侧问；value 为 {question, history} 的 JSON。</summary>
        private async void HandleSideQuestion(string value, string requestId)
        {
            string answer = string.Empty;
            string error = string.Empty;

            try
            {
                string question;
                string history;

                using (JsonDocument document = JsonDocument.Parse(value))
                {
                    question = ReadString(document.RootElement, "question");
                    history = document.RootElement.TryGetProperty("history", out JsonElement found)
                        ? found.GetRawText()
                        : string.Empty;
                }

                ClaudeStreamJsonSession session = RequireCliSession();
                answer = await session.AskSideQuestionAsync(question, history);
            }
            catch (Exception ex)
            {
                error = ex.Message;
            }

            if (_disposed)
            {
                return;
            }

            var payload = new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["kind"] = "sideQuestion",
                ["requestId"] = requestId ?? string.Empty,
                ["response"] = answer,
                ["error"] = error
            };

            string json = SerializeEnvelope(BridgeMessageTypes.Context, payload);
            TrySend(json);
        }

        /// <summary>第三方服务商（Bedrock 等）的说明文档。</summary>
        private const string ThirdPartyProvidersDocUrl =
            "https://code.claude.com/docs/en/vs-code#use-third-party-providers";

        #region 登录

        /// <summary>走 CLI 的登录流程：拿网址、开浏览器、等完成。</summary>
        private async void HandleLogin(string method, string requestId)
        {
            try
            {
                ClaudeStreamJsonSession session = RequireCliSession();

                ClaudeLoginUrls urls = await session.BeginLoginAsync(method != "console");
                PostLoginState(requestId, "url", urls.ManualUrl.Length > 0 ? urls.ManualUrl : urls.AutomaticUrl, string.Empty);

                OpenInBrowser(urls.AutomaticUrl.Length > 0 ? urls.AutomaticUrl : urls.ManualUrl);

                await session.WaitForLoginAsync();
                PostLoginState(requestId, "done", string.Empty, string.Empty);
            }
            catch (Exception ex)
            {
                PostLoginState(requestId, "error", string.Empty, ex.Message);
                return;
            }

            await RefreshAfterLoginAsync();
        }

        /// <summary>登录后刷新额度与账号；失败不改「已登录」的结论。</summary>
        private async Task RefreshAfterLoginAsync()
        {
            if (!(_session is ClaudeStreamJsonSession session))
            {
                return;
            }

            try
            {
                session.RefreshUsage();
                await session.RefreshAccountAsync();
            }
            catch (Exception)
            {
                // 账号栏下次握手时会自然更新
            }
        }

        /// <summary>退出登录：替用户跑 claude auth logout。</summary>
        private async void HandleLogout(string requestId)
        {
            string error;

            try
            {
                var runner = new ClaudeSubcommandRunner();
                var arguments = new[] { "auth", "logout" };

                SubcommandOutcome outcome = await runner.RunAsync(
                    _executablePath, arguments, _workingDirectoryProvider(), _shutdownCts.Token);

                error = DescribeSubcommandFailure("claude auth logout", outcome);
            }
            catch (Exception ex)
            {
                error = ex.Message;
            }

            PostAuthState("logout", requestId, error.Length == 0 ? "done" : "error", string.Empty, error);
        }

        /// <summary>子命令失败的原因；成功返回空串。</summary>
        private static string DescribeSubcommandFailure(string label, SubcommandOutcome outcome)
        {
            if (outcome.StartFailure != null)
            {
                return outcome.StartFailure;
            }

            if (outcome.TimedOut)
            {
                return $"{label} 超时没有结束。";
            }

            if (outcome.ExitCode != 0)
            {
                string detail = outcome.StandardError.Trim().Length > 0
                    ? outcome.StandardError.Trim()
                    : outcome.StandardOutput.Trim();
                return $"{label} 退出码 {outcome.ExitCode}：{detail}";
            }

            return string.Empty;
        }

        /// <summary>提交用户手动粘贴的授权码。</summary>
        private async void HandleLoginCode(string code, string requestId)
        {
            try
            {
                ClaudeStreamJsonSession session = RequireCliSession();
                await session.SubmitLoginCodeAsync(code);
            }
            catch (Exception ex)
            {
                PostLoginState(requestId, "error", string.Empty, ex.Message);
            }
        }

        /// <summary>取 CLI 会话；进程没起就先请宿主起。</summary>
        private ClaudeStreamJsonSession RequireCliSession()
        {
            if (!(_session is ClaudeStreamJsonSession session))
            {
                throw new InvalidOperationException("当前会话不支持这个操作。");
            }

            if (!session.IsStarted)
            {
                AgentStartRequested?.Invoke(this, EventArgs.Empty);
            }

            if (!session.IsStarted)
            {
                throw new InvalidOperationException("会话还没启动（解决方案可能还在打开），请稍后再试。");
            }

            return session;
        }

        /// <summary>用系统默认浏览器打开登录网址；只放行 https。</summary>
        private static void OpenInBrowser(string url)
        {
            if (!url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            try
            {
                var startInfo = new ProcessStartInfo(url) { UseShellExecute = true };
                Process.Start(startInfo);
            }
            catch (Exception)
            {
                // 打不开浏览器时，界面上还有网址可复制
            }
        }

        /// <summary>把登录进度回给前端：url / done / error。</summary>
        private void PostLoginState(string requestId, string stage, string url, string error)
        {
            PostAuthState("login", requestId, stage, url, error);
        }

        /// <summary>回报登录或退出的进度；kind 为 login / logout。</summary>
        private void PostAuthState(string kind, string requestId, string stage, string url, string error)
        {
            if (_disposed)
            {
                return;
            }

            var payload = new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["kind"] = kind,
                ["requestId"] = requestId ?? string.Empty,
                ["stage"] = stage,
                ["url"] = url,
                ["error"] = error
            };

            string json = SerializeEnvelope(BridgeMessageTypes.Context, payload);
            TrySend(json);
        }

        #endregion

        /// <summary>把剪贴板里复制的文件当作挑中的文件回给前端。</summary>
        private void HandleClipboardFiles(string requestId)
        {
            IReadOnlyList<string> copied = ClipboardFilesRequested?.Invoke() ?? Array.Empty<string>();
            IReadOnlyList<string> display = RememberPicked(copied);

            var payload = new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["kind"] = "clipboardFiles",
                ["requestId"] = requestId ?? string.Empty,
                ["results"] = display
            };

            string json = SerializeEnvelope(BridgeMessageTypes.Context, payload);
            TrySend(json);
        }

        /// <summary>把粘贴的截图落成临时文件，回绝对路径。</summary>
        private void HandleSaveImage(string dataUrl, string requestId)
        {
            string path = "";
            string error = "";

            try
            {
                path = _pastedImages.Save(dataUrl);
            }
            catch (Exception ex)
            {
                error = ex.Message;
            }

            var payload = new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["kind"] = "savedImage",
                ["requestId"] = requestId ?? string.Empty,
                ["path"] = path,
                ["error"] = error
            };

            string json = SerializeEnvelope(BridgeMessageTypes.Context, payload);
            TrySend(json);
        }

        private void HandleFileSearch(string value, string requestId)
        {
            if (FileSearchRequested == null)
            {
                return;
            }

            IReadOnlyList<string> results = FileSearchRequested(value);

            var payload = new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["kind"] = "files",
                ["requestId"] = requestId ?? string.Empty,
                ["results"] = results ?? (IReadOnlyList<string>)Array.Empty<string>()
            };

            string json = SerializeEnvelope(BridgeMessageTypes.Context, payload);
            TrySend(json);
        }

        private void HandleFileContent(string value, string requestId)
        {
            FilePreviewResult preview = FilePreviewReader.Read(
                value, _workingDirectoryProvider(), _userPickedFiles);

            var payload = new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["kind"] = "fileContent",
                ["requestId"] = requestId ?? string.Empty,
                ["path"] = preview.Path,
                ["text"] = preview.Text,
                ["image"] = preview.Image,
                ["truncated"] = preview.Truncated,
                ["totalLines"] = preview.TotalLines,
                ["size"] = preview.Size,
                ["error"] = preview.Error
            };

            string json = SerializeEnvelope(BridgeMessageTypes.Context, payload);
            TrySend(json);
        }

        private void HandleFilePick(string requestId)
        {
            if (FilePickRequested == null)
            {
                return;
            }

            IReadOnlyList<string> picked = FilePickRequested() ?? Array.Empty<string>();
            IReadOnlyList<string> display = RememberPicked(picked);

            var payload = new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["kind"] = "pickedFiles",
                ["requestId"] = requestId ?? string.Empty,
                ["results"] = display
            };

            string json = SerializeEnvelope(BridgeMessageTypes.Context, payload);
            TrySend(json);
        }

        /// <summary>宿主侧收到拖进来的文件，转成路径推给前端。</summary>
        public void PostDroppedFiles(IReadOnlyList<string> paths)
        {
            IReadOnlyList<string> display = RememberPicked(paths ?? Array.Empty<string>());

            if (display.Count == 0)
            {
                return;
            }

            var payload = new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["kind"] = "droppedFiles",
                ["requestId"] = string.Empty,
                ["results"] = display
            };

            string json = SerializeEnvelope(BridgeMessageTypes.Context, payload);
            TrySend(json);
        }

        private IReadOnlyList<string> RememberPicked(IReadOnlyList<string> paths)
        {
            string workingDirectory = _workingDirectoryProvider();
            var display = new List<string>();

            foreach (string path in paths)
            {
                if (string.IsNullOrWhiteSpace(path))
                {
                    continue;
                }

                string full;

                try
                {
                    full = Path.GetFullPath(path);
                }
                catch (Exception)
                {
                    continue;
                }

                _userPickedFiles.Add(full);
                display.Add(FilePreviewRules.ToDisplayPath(workingDirectory, full));
            }

            return display;
        }

        private void HandleRunCommand(string id)
        {
            ClaudeSubcommand? subcommand = ClaudeSubcommandCatalog.Find(id);

            if (subcommand == null)
            {
                return;
            }

            SubcommandRequested?.Invoke(this, subcommand);
        }

        #region 面板

        /// <summary><c>async void</c> 事件处理**必须自带 try-catch**：取数走真实子进程、可达数十秒，这期间 工具窗可能已关闭（<see cref="Dispose"/> 不取消进行中的任务）</summary>
        private async void HandlePanelOpen(string panelId, string requestId)
        {
            try
            {
                PanelResult result = await GetPanelService().OpenAsync(panelId).ConfigureAwait(true);
                result.RequestId = requestId;
                PostPanelData(result);
            }
            catch (Exception ex)
            {
                TryPostPanelError(panelId, requestId, ex);
            }
        }

        private async void HandlePanelAction(string panelId, string actionId, IReadOnlyList<string> values, string requestId)
        {
            try
            {
                PanelResult result = await GetPanelService().ActAsync(panelId, actionId, values).ConfigureAwait(true);
                result.RequestId = requestId;
                PostPanelData(result);

                if (actionId == "session.rename" && result.Error.Length == 0 && values.Count > 0)
                {
                    SessionRenamed?.Invoke(this, values[0]);
                }
            }
            catch (Exception ex)
            {
                TryPostPanelError(panelId, requestId, ex);
            }
        }

        private void HandleResumeSession(string sessionId, bool fork)
        {
            Guid parsed;

            if (string.IsNullOrWhiteSpace(sessionId) || !Guid.TryParseExact(sessionId, "D", out parsed))
            {
                PostNotice(NoticeText.ResumeIdMalformed);
                return;
            }

            if (!GetPanelService().IsKnownMember(PanelSet.Sessions, sessionId))
            {
                PostNotice(NoticeText.ResumeNotListed);
                return;
            }

            SessionResumeRequested?.Invoke(this, new SessionResumeRequest(sessionId, fork));
        }

        /// <summary>把一条网页会话拉回本机：只有终端里的 CLI 认 <c>--teleport</c>，聊天那路会悄悄忽略它。</summary>
        private void HandleTeleportSession(string value)
        {
            string id;

            if (!CloudSessionId.TryParse(value, out id))
            {
                PostNotice(NoticeText.TeleportIdMalformed);
                return;
            }

            Func<bool>? allowed = TerminalStartAllowed;

            if (allowed != null && !allowed())
            {
                PostNotice(NoticeText.TeleportNotReady);
                return;
            }

            bool running = _terminal != null && _terminal.IsRunning;
            int columns = running && _terminalColumns > 0 ? _terminalColumns : TerminalSizeMemory.Default.Columns;
            int rows = running && _terminalRows > 0 ? _terminalRows : TerminalSizeMemory.Default.Rows;

            // 前端从没起过终端（没量过尺寸）：它随后会发 terminalStart，走「已在跑、等尺寸稳了再接」。
            // 起过但已退出：前端的 xterm 还挂着、不会再发 terminalStart，必须保持已接上，否则输出永远攒着不发。
            if (!running && _terminalColumns <= 0)
            {
                _terminalAttached = false;
            }

            _pendingTeleportId = id;
            PostNotice(NoticeText.TeleportStarted, NoticeText.Args("id", id));
            StartTerminal(columns, rows);
        }

        private void HandleExportTranscript(string markdown)
        {
            try
            {
                string path = TranscriptExporter.Export(markdown, DateTime.Now);
                PostNotice(NoticeText.ExportDone, NoticeText.Args("path", path));
                OpenFileRequested?.Invoke(this, new OpenFileRequest(path, 0));
            }
            catch (ArgumentException exception)
            {
                PostNotice(NoticeText.ExportFailed, NoticeText.Args("reason", exception.Message));
            }
            catch (IOException exception)
            {
                PostNotice(NoticeText.ExportFailed, NoticeText.Args("reason", exception.Message));
            }
            catch (UnauthorizedAccessException exception)
            {
                PostNotice(NoticeText.ExportFailed, NoticeText.Args("reason", exception.Message));
            }
        }

        private void HandleRestoreFile(string id)
        {
            if (string.IsNullOrWhiteSpace(id))
            {
                PostNotice(NoticeText.RestoreNoId);
                return;
            }

            if (!GetPanelService().IsKnownMember(PanelSet.FileBackups, id))
            {
                PostNotice(NoticeText.RestoreNotListed);
                return;
            }

            string workingDirectory = _workingDirectoryProvider();
            string sessionId = _session.SessionId;
            string transcript = FileHistoryReader.TranscriptPathFor(workingDirectory, sessionId);

            FileBackupEntry? entry = FileHistoryReader.FindById(
                transcript, FileHistoryReader.DefaultHistoryRoot(), sessionId, workingDirectory, id);

            if (entry == null)
            {
                PostNotice(NoticeText.RestoreGone);
                return;
            }

            try
            {
                string savedTo = FileHistoryReader.Restore(
                    entry, workingDirectory, FileHistoryReader.DefaultBackupRoot());

                // 两句分成两个模板，而不是把后半句当占位塞进来：占位里的中文翻不动。
                string template = savedTo.Length > 0
                    ? NoticeText.RestoreDoneSaved
                    : NoticeText.RestoreDoneNew;

                PostNotice(template, NoticeText.Args(
                    "path", entry.TargetPath,
                    "version", entry.Version.ToString(CultureInfo.InvariantCulture),
                    "backup", entry.BackupFileName,
                    "saved", savedTo));
            }
            catch (Exception ex)
            {
                PostNotice(NoticeText.RestoreFailed, NoticeText.Args("reason", ex.Message));
            }
        }

        /// <summary>取数/动作失败时尽量把可读原因回传前端——面板通道不允许静默失败。</summary>
        private void TryPostPanelError(string panelId, string requestId, Exception ex)
        {
            try
            {
                PostPanelData(new PanelResult { PanelId = panelId, RequestId = requestId, Error = $"面板操作失败：{ex.Message}", ShowsRawText = true });
            }
            catch (Exception)
            {
            }
        }

        private void PostPanelData(PanelResult result)
        {
            PostEnvelope(BridgeMessageTypes.PanelData, result);
        }

        /// <summary>惰性创建。这里没有双重创建竞态（消息泵不重入）；一旦在本方法与首个挂起点之间引入 await，该结论作废。</summary>
        private ClaudePanelService GetPanelService()
        {
            if (_panelService == null)
            {
                var runner = new ClaudeSubcommandRunner();

                _panelService = new ClaudePanelService(
                    (exe, args, workingDirectory) =>
                        runner.RunAsync(exe, args, workingDirectory, _shutdownCts.Token),
                    _executablePath,
                    _workingDirectoryProvider(),
                    () => _session.SessionId);
            }

            return _panelService;
        }

        #endregion

        private void HandleVsAction(string option, string value, int line)
        {
            if (option == "openFile" && !string.IsNullOrWhiteSpace(value))
            {
                OpenFileRequested?.Invoke(this, new OpenFileRequest(value, line));
            }
        }

        private static bool ReadBool(JsonElement parent, string name)
        {
            if (!parent.TryGetProperty(name, out JsonElement value))
            {
                return false;
            }

            bool flag = value.ValueKind == JsonValueKind.True;
            return flag;
        }

        private static int ReadInt(JsonElement parent, string name)
        {
            if (!parent.TryGetProperty(name, out JsonElement value) || value.ValueKind != JsonValueKind.Number)
            {
                return 0;
            }

            int number = value.TryGetInt32(out int parsed) ? parsed : 0;
            return number;
        }

        private void HandleSetOption(string option, string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return;
            }

            switch (option)
            {
                case "permissionMode":
                    if (!PermissionModes.IsKnown(value))
                    {
                        PostEvent(AgentEvent.Failure($"未知的权限模式 “{value}”，已拒绝。"));
                        break;
                    }

                    PermissionModeChangeRequested?.Invoke(this, value);
                    break;

                case "model":
                    ModelChangeRequested?.Invoke(this, value);
                    break;

                case "effort":
                    EffortChangeRequested?.Invoke(this, value);
                    break;

                case "remoteControl":
                    RemoteControlChangeRequested?.Invoke(
                        this, string.Equals(value, "true", StringComparison.OrdinalIgnoreCase));
                    break;

                case "ultracode":
                    UltracodeChangeRequested?.Invoke(
                        this, string.Equals(value, "true", StringComparison.OrdinalIgnoreCase));
                    break;

                default:
                    // 认不出的设置项：契约两侧漂移了，出声别让它静默消失
                    PostEvent(AgentEvent.Failure($"未知的设置项 “{option}”，已忽略。"));
                    break;
            }
        }

        private static string ReadString(JsonElement parent, string name)
        {
            if (!parent.TryGetProperty(name, out JsonElement value) || value.ValueKind != JsonValueKind.String)
            {
                return string.Empty;
            }

            string text = value.GetString() ?? string.Empty;
            return text;
        }

        #endregion

        #region 释放

        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;

            try
            {
                _shutdownCts.Cancel();
            }
            catch (Exception)
            {
            }

            _shutdownCts.Dispose();

            _designLogin?.Dispose();
            _designLogin = null;

            StopTerminal();

            _flushTimer.Stop();
            _flushTimer.Tick -= OnFlushTick;

            // 旧控制器多半已经关掉了，退订会抛 COM 异常——理由同 RebindWebView。
            // 这里不能让它裸抛：调用方是 DisposeTab（CloseTab / ShutdownSession 的 foreach
            // 都靠它），异常一旦逃出去，CloseTab 里紧跟着的 _tabs.Remove 之后的收尾、
            // 以及 ShutdownSession 里排在后面的其余 tab 全部执行不到——表现为「关闭按钮点了
            // 没反应，每次都在同一处抛」，以及「面板关了，claude 子进程全部泄漏在后台」。
            try
            {
                if (_webView != null)
                {
                    _webView.ProcessFailed -= OnWebViewProcessFailed;
                    _webView.WebMessageReceived -= OnWebMessageReceived;
                }
            }
            catch (Exception)
            {
            }

            _session.Received -= OnSessionEvent;
        }

        #endregion
    }
}
