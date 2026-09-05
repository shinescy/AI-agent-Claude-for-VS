// WebView2 与代理会话之间的双向消息桥

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text.Json;
using System.Threading;
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

        /// <summary>出站通道。面板重建 WebView 后会换成新的那个，见 <see cref="RebindWebView"/>。</summary>
        private CoreWebView2 _webView;

        private readonly DeltaCoalescer _coalescer;
        private readonly DispatcherTimer _flushTimer;
        private readonly Dispatcher _dispatcher;

        private readonly string _executablePath;

        private readonly Func<string> _workingDirectoryProvider;

        private ClaudePanelService? _panelService;

        /// <summary>用户亲手挑/拖进来的路径。工作目录之外唯一允许预览的来源，不设防等于给网页读任意本机文件的能力。</summary>
        private readonly HashSet<string> _userPickedFiles =
            new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        private ConPtySession? _terminal;

        private TerminalLaunchOptions? _terminalOptions;

        /// <summary>起终端时向宿主要一套启动参数与其闭集。</summary>
        public Func<TerminalLaunchOptions>? TerminalLaunchProvider { get; set; }

        private IReadOnlyList<string> _knownModels = Array.Empty<string>();

        private IReadOnlyList<string> _knownEfforts = Array.Empty<string>();

        private readonly List<byte> _terminalBuffer = new List<byte>();

        private readonly List<AgentEvent> _log = new List<AgentEvent>();

        private IAgentSession _session;

        private bool _disposed;

        private bool _outboundBroken;

        private readonly CancellationTokenSource _shutdownCts = new CancellationTokenSource();

        #endregion

        #region 构造与启动

        /// <summary>构造消息桥。</summary>
        public WebViewBridge(
            CoreWebView2 webView,
            IAgentSession session,
            Dispatcher uiDispatcher,
            string executablePath,
            Func<string> workingDirectoryProvider)
        {
            _webView = webView ?? throw new ArgumentNullException(nameof(webView));
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
            // WebView2 进程崩溃的**主动**信号。
            _webView.ProcessFailed += OnWebViewProcessFailed;
            _webView.WebMessageReceived += OnWebMessageReceived;
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

        /// <summary>前端请求切换模型。</summary>
        public event EventHandler<string>? ModelChangeRequested;

        /// <summary>前端请求执行一条 CLI 子命令。</summary>
        public event EventHandler<ClaudeSubcommand>? SubcommandRequested;

        /// <summary>前端请求切换思考强度。</summary>
        public event EventHandler<string>? EffortChangeRequested;

        /// <summary>前端挂载完成并已能接收消息。</summary>
        public event EventHandler? ClientReady;

        /// <summary>用户点了转录里的文件位置链接，请求在编辑器中打开。</summary>
        public event EventHandler<OpenFileRequest>? OpenFileRequested;

        /// <summary>请求接回一条历史会话。</summary>
        public event EventHandler<SessionResumeRequest>? SessionResumeRequested;

        /// <summary>网页没用上刚按下的 Esc。</summary>
        public event EventHandler? EscapeUnhandled;

        /// <summary>前端请求丢掉当前会话、开一条干净的。</summary>
        public event EventHandler? NewSessionRequested;

        /// <summary>点了 +。</summary>
        public event EventHandler? TabCreateRequested;

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
                _webView.ProcessFailed -= OnWebViewProcessFailed;
                _webView.WebMessageReceived -= OnWebMessageReceived;
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

        /// <summary>把别的 tab 广播来的语言/外观偏好转发给这块前端。</summary>
        public void PostUiPrefs(object payload)
        {
            if (payload == null)
            {
                return;
            }

            PostEnvelope(BridgeMessageTypes.UiPrefs, payload);
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
            if (_disposed || _outboundBroken)
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
                    // 只记进日志、不下发：实时那一路前端已经本地加过用户块（state.ts 的 userSent），
                    // 再下发一遍同一句话会重。记这一笔是为了 replay——不记的话，
                    // 面板一被拖动重建 WebView，用户自己发过的每句话都会消失，只剩助手的回复。
                    _log.Add(AgentEvent.UserPromptText(text));
                    _session.Send(new AgentPrompt { Text = text, Images = message.Images });
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

                case BridgeMessageTypes.RestoreFile:
                    HandleRestoreFile(message.Value);
                    break;

                case BridgeMessageTypes.EscapeUnhandled:
                    EscapeUnhandled?.Invoke(this, EventArgs.Empty);
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
                    _terminal?.Resize(message.Columns, message.Rows);
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

            if (_terminal != null && _terminal.IsRunning)
            {
                _terminal.Resize(columns, rows);

                PostTerminalStarted(_terminalOptions ?? new TerminalLaunchOptions());
                return;
            }

            StopTerminal();

            if (string.IsNullOrWhiteSpace(_executablePath))
            {
                PostTerminalExited(-1, "没有找到 claude 可执行文件，终端起不来。");
                return;
            }

            TerminalLaunchOptions effective = ResolveTerminalOptions();

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
                _terminalOptions = effective;

                // 必须回报**实际用上的**那套值，而不是前端以为的那套。
                PostTerminalStarted(effective);
            }
            catch (Exception ex)
            {
                // 起不来要说清楚为什么，不能只留一个空白的终端标签。
                session.OutputReceived -= OnTerminalOutput;
                session.Exited -= OnTerminalExited;
                session.Dispose();
                PostTerminalExited(-1, "终端启动失败：" + ex.Message);
            }
        }

        private TerminalLaunchOptions ResolveTerminalOptions()
        {
            Func<TerminalLaunchOptions>? provider = TerminalLaunchProvider;

            if (provider == null)
            {
                return new TerminalLaunchOptions();
            }

            TerminalLaunchOptions effective = TerminalLaunchSanitizer.Sanitize(
                provider(),
                _knownModels,
                _knownEfforts,
                out IReadOnlyList<string> rejections);

            foreach (string reason in rejections)
            {
                PostEvent(AgentEvent.Failure(reason));
            }

            return effective;
        }

        private void PostTerminalStarted(TerminalLaunchOptions options)
        {
            var payload = new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["model"] = options.Model,
                ["effort"] = options.Effort,
                ["permissionMode"] = options.PermissionMode
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

            _terminal.Write(data);
        }

        private void OnTerminalOutput(object sender, byte[] chunk)
        {
            lock (_terminalBuffer)
            {
                _terminalBuffer.AddRange(chunk);
            }
        }

        private void OnTerminalExited(object sender, int exitCode)
        {
            if (!_dispatcher.CheckAccess())
            {
                _dispatcher.BeginInvoke(new Action(() => OnTerminalExited(sender, exitCode)));
                return;
            }

            // 退出前把攒下的最后一批输出发出去，否则用户看不到子进程的临终遗言。
            FlushTerminalOutput();
            PostTerminalExited(exitCode, null);
        }

        private void FlushTerminalOutput()
        {
            byte[] pending;

            lock (_terminalBuffer)
            {
                if (_terminalBuffer.Count == 0)
                {
                    return;
                }

                pending = _terminalBuffer.ToArray();
                _terminalBuffer.Clear();
            }

            var payload = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["data"] = Convert.ToBase64String(pending)
            };

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
            ConPtySession? terminal = _terminal;
            _terminal = null;

            if (terminal == null)
            {
                return;
            }

            terminal.OutputReceived -= OnTerminalOutput;
            terminal.Exited -= OnTerminalExited;
            terminal.Dispose();

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
                _webView.ProcessFailed -= OnWebViewProcessFailed;
                _webView.WebMessageReceived -= OnWebMessageReceived;
            }
            catch (Exception)
            {
            }

            _session.Received -= OnSessionEvent;
        }

        #endregion
    }
}
