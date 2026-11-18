// 基于 stream-json 的 Claude Code 会话

using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace AgentExtension.Agents
{
    /// <summary>一个常驻 claude 子进程构成的会话。</summary>
    public class ClaudeStreamJsonSession : IAgentSession
    {
        #region 字段

        private readonly ClaudeSessionOptions _options;
        private readonly Func<IJsonLineProcessHost> _hostFactory;
        private readonly ClaudeStreamParser _parser;
        private readonly List<AgentEvent> _eventLog = new List<AgentEvent>();
        private readonly object _logLock = new object();

        private IJsonLineProcessHost? _host;
        private volatile bool _disposed;

        private string _settingsEffortLevel = string.Empty;

        /// <summary>探测短进程等多久。VS 刚启动时实测要 60 多秒。</summary>
        public TimeSpan UsageProbeTimeout { get; set; } = TimeSpan.FromSeconds(90);

        /// <summary>怎么跑额度探测。单测把它换掉，免得真去起进程。</summary>
        internal Func<string, IDictionary<string, string>, int, string> UsageProbe { get; set; }
            = UsageProbeProcess.Run;

        /// <summary>怎么跑模型/强度探测。参数：exe、环境、超时、命令、附加参数。</summary>
        internal Func<string, IDictionary<string, string>, int, string, string, string> StateProbe { get; set; }
            = UsageProbeProcess.RunCommand;

        /// <summary>上次探测的答案；起会话先发它，状态栏不用等三个短进程冷启动。</summary>
        internal ProbeCache Cache { get; set; } = ProbeCache.Default;

        /// <summary>缓存的答案发过一次了。</summary>
        private bool _cachedProbesPublished;

        /// <summary>额度探测在跑没有，0 表示空闲。</summary>
        private int _usageProbeRunning;

        /// <summary>护住 <see cref="_probedState"/>：读取线程与探测线程都会改它。</summary>
        private readonly object _probedStateLock = new object();

        private readonly AgentSessionInfo _probedState = new AgentSessionInfo();

        /// <summary>发出提示词后多久没有任何事件就提醒用户。</summary>
        internal TimeSpan SilenceTimeout { get; set; } = TimeSpan.FromSeconds(90);

        private volatile bool _sawEventSinceSend;

        /// <summary>发送批次号，用于让旧的静默检查在新发送后自动作废。</summary>
        private volatile int _sendGeneration;

        private readonly Queue<string> _errorTail = new Queue<string>();

        private const int ErrorTailLimit = 20;

        /// <summary>等回包的切换请求：id → 给用户看的说法。</summary>
        private readonly Dictionary<string, string> _pendingSwitches = new Dictionary<string, string>();

        /// <summary>护住 <see cref="_pendingSwitches"/>。</summary>
        private readonly object _pendingLock = new object();

        /// <summary>串行化往 stdin 的写入：读取线程也会发控制请求。</summary>
        private readonly object _writeLock = new object();

        /// <summary>Ultracode 开关请求的说法，被拒时据此回滚。</summary>
        private const string UltracodeSwitchName = "切换 Ultracode";

        /// <summary>去转录里找压缩摘要最多试几次。</summary>
        private const int SummaryAttempts = 6;

        /// <summary>每次找摘要前等多久：转录落盘略晚于管道。</summary>
        private static readonly TimeSpan SummaryRetryDelay = TimeSpan.FromMilliseconds(500);

        /// <summary>会话的工作目录，用来定位转录。</summary>
        private string _workingDirectory = string.Empty;

        /// <summary>前端「默认」档的取值，与 efforts.ts 一致。</summary>
        private const string DefaultEffort = "auto";

        /// <summary>CLI 上次报的 Ultracode 可用性；没报过为 null。</summary>
        private bool? _ultracodeAvailable;

        /// <summary>等回包的控制请求：id → 回包正文。</summary>
        private readonly Dictionary<string, TaskCompletionSource<string>> _pendingRequests =
            new Dictionary<string, TaskCompletionSource<string>>();

        #endregion

        #region 构造

        public ClaudeStreamJsonSession(ClaudeSessionOptions options, Func<IJsonLineProcessHost> hostFactory)
        {
            _options = options ?? throw new ArgumentNullException(nameof(options));
            _hostFactory = hostFactory ?? throw new ArgumentNullException(nameof(hostFactory));
            _parser = new ClaudeStreamParser(options.IncludePartialMessages);

            SessionId = InitialSessionId(options);
        }

        /// <summary>
        /// init 要等第一轮才来，在那之前会话 id 只能从启动参数上取。
        ///
        /// 取不到的后果不是「少显示一个 id」：换权限模式要重起进程，那一步按本属性判定
        /// 该接回哪条会话，空串等于判定不出来，于是静默换成一条新会话——屏幕上的记录还挂着，
        /// 上下文却已经没了。分叉除外：<c>--fork-session</c> 由 CLI 另发一个 id，
        /// 预置源 id 会指向别人那份转录。
        /// </summary>
        private static string InitialSessionId(ClaudeSessionOptions options)
        {
            if (!string.IsNullOrWhiteSpace(options.ResumeSessionId))
            {
                return options.ForkSession ? string.Empty : options.ResumeSessionId;
            }

            string id = options.SessionId ?? string.Empty;
            return id;
        }

        #endregion

        #region 属性

        public string SessionId { get; private set; } = string.Empty;

        public string ResumableSessionId { get; private set; } = string.Empty;

        public string Model { get; private set; } = string.Empty;

        public bool IsBusy { get; private set; }

        /// <summary>进程起过了没有。</summary>
        public bool IsStarted
        {
            get
            {
                bool started = _host != null;
                return started;
            }
        }

        /// <summary>是否收到过 <c>system/init</c>。没收到就退出＝握手都没完成。</summary>
        public bool SawSessionStarted { get; private set; }

        public event EventHandler<AgentEvent>? Received;

        /// <summary>进程在握手完成前就退出了（典型成因：--resume 给了 CLI 不认的会话 id）。</summary>
        public event EventHandler? StartupFailed;

        #endregion

        #region 生命周期

        public void Start(string workingDirectory)
        {
            if (_host != null)
            {
                throw new InvalidOperationException("会话已经启动。");
            }

            string arguments = ClaudeCommandBuilder.BuildArguments(_options);

            _workingDirectory = workingDirectory;
            _settingsEffortLevel = ClaudeSettingsReader.ReadEffortLevel(workingDirectory);

            _host = _hostFactory();
            _host.LineReceived += OnLineReceived;
            _host.ErrorLineReceived += OnErrorLineReceived;
            _host.Exited += OnExited;

            try
            {
                _host.Start(_options.ExecutablePath, arguments, workingDirectory, _options.EnvironmentOverrides);
            }
            catch (Exception ex)
            {
                // 启动失败必须让用户看见。
                Publish(AgentEvent.Failure(
                    $"无法启动代理进程：{ex.Message}\n可执行文件：{_options.ExecutablePath}\n工作目录：{workingDirectory}"));

                IsBusy = false;
                return;
            }

            SendInitializeHandshake();
            PublishCachedProbes(workingDirectory);
            StartStateProbes();
            StartUsageProbe();
        }

        /// <summary>探测短进程的附加参数：带上本会话的模型与强度。</summary>
        private string ProbeExtraArguments()
        {
            string effort = string.IsNullOrWhiteSpace(_options.Effort) ? _settingsEffortLevel : _options.Effort;
            string extra = ClaudeCommandBuilder.BuildProbeArguments(_options.Model, effort);
            return extra;
        }

        /// <summary>先发上次缓存的探测答案，只发一次。</summary>
        public void PublishCachedProbes(string workingDirectory)
        {
            if (_cachedProbesPublished || _disposed)
            {
                return;
            }

            if (_settingsEffortLevel.Length == 0)
            {
                _settingsEffortLevel = ClaudeSettingsReader.ReadEffortLevel(workingDirectory);
            }

            string extra = ProbeExtraArguments();
            bool any = false;

            lock (_probedStateLock)
            {
                foreach (string command in AgentProbeCommands.Startup)
                {
                    string text = Cache.Get(ProbeCache.KeyFor(command, extra));

                    if (text.Length > 0)
                    {
                        AbsorbProbeText(text);
                        any = true;
                    }
                }

                string usage = Cache.Get(ProbeCache.KeyFor(AgentProbeCommands.Usage, string.Empty));

                if (usage.Length > 0)
                {
                    AbsorbProbeText(usage);
                    any = true;
                }

                if (any)
                {
                    _cachedProbesPublished = true;
                    PublishProbedState();
                }
            }
        }

        /// <summary>
        /// 后台用短进程探模型与强度，一条都不发进会话。
        ///
        /// 发进会话会被 CLI 记进转录：用户一句话没说，目录里就多出一份
        /// 只有探测的会话。带上本会话的 --model/--effort，短进程答的才是这条会话的值。
        /// </summary>
        private void StartStateProbes()
        {
            string executable = _options.ExecutablePath;
            IDictionary<string, string> environment = _options.EnvironmentOverrides;
            string extra = ProbeExtraArguments();
            Func<string, IDictionary<string, string>, int, string, string, string> run = StateProbe;
            ProbeCache cache = Cache;

            // 每条命令一个短进程，并行跑
            foreach (string command in AgentProbeCommands.Startup)
            {
                string probeCommand = command;

                Task.Run(() =>
                {
                    try
                    {
                        string text = run(
                            executable, environment, (int)UsageProbeTimeout.TotalMilliseconds, probeCommand, extra);

                        if (text.Length == 0 || _disposed)
                        {
                            return;
                        }

                        cache.Set(ProbeCache.KeyFor(probeCommand, extra), text);

                        lock (_probedStateLock)
                        {
                            AbsorbProbeText(text);
                            PublishProbedState();
                        }
                    }
                    catch (Exception)
                    {
                        // 探不到只是状态栏少一块，就地咽下
                    }
                });
            }
        }

        /// <summary>
        /// 重新探一次额度用量。
        ///
        /// 走独立短进程，不发进会话：发进去会被 CLI 记进转录，把真实对话淹掉
        /// （见 <see cref="UsageProbeProcess"/>）。所以这里不看 <see cref="IsBusy"/>——
        /// 它跟当前这一轮互不相干。
        /// </summary>
        public bool RefreshUsage()
        {
            if (_disposed)
            {
                return false;
            }

            StartUsageProbe();
            return true;
        }

        /// <summary>
        /// 后台跑一次额度探测，拿到就并进已探状态发出去。
        ///
        /// 同一时刻只跑一个：起会话与每轮说完各触发一次，多 tab 时会撞在一起，
        /// 而额度是账号级的，重复起进程纯属浪费。
        /// </summary>
        private void StartUsageProbe()
        {
            if (Interlocked.CompareExchange(ref _usageProbeRunning, 1, 0) != 0)
            {
                return;
            }

            string executable = _options.ExecutablePath;
            IDictionary<string, string> environment = _options.EnvironmentOverrides;
            Func<string, IDictionary<string, string>, int, string> run = UsageProbe;

            Task.Run(() =>
            {
                try
                {
                    string text = run(
                        executable, environment, (int)UsageProbeTimeout.TotalMilliseconds);

                    if (text.Length == 0 || _disposed)
                    {
                        return;
                    }

                    Cache.Set(ProbeCache.KeyFor(AgentProbeCommands.Usage, string.Empty), text);

                    // 与 CLI 读取线程共用 _probedState：两边交错改会发出半份状态。
                    lock (_probedStateLock)
                    {
                        AbsorbProbeText(text);

                        // 认出了额度窗口才算这次刷新成功，前端据此停转圈。
                        if (ReferenceEquals(_probedState.UsageRawText, text))
                        {
                            _probedState.UsageCheckedAtUnixMs = AgentEvent.NowUnixMs();
                        }

                        PublishProbedState();
                    }
                }
                catch (Exception)
                {
                    // 抛在这里没人接得住：Task 的未观察异常会被运行时直接丢掉，
                    // 连日志都不会有。额度取不到只是状态栏少一块，就地咽下。
                }
                finally
                {
                    Interlocked.Exchange(ref _usageProbeRunning, 0);
                }
            });
        }

        private void SendInitializeHandshake()
        {
            string payload = "{\"type\":\"control_request\",\"request_id\":\""
                           + Guid.NewGuid().ToString("N")
                           + "\",\"request\":{\"subtype\":\"initialize\"}}";

            WriteToHost(payload);
        }

        public void Send(string text)
        {
            var prompt = new AgentPrompt { Text = text ?? string.Empty };
            Send(prompt);
        }

        public void Send(AgentPrompt prompt)
        {
            if (prompt == null)
            {
                throw new ArgumentNullException(nameof(prompt));
            }

            if (_host == null)
            {
                throw new InvalidOperationException("会话尚未启动。");
            }

            string payload = BuildUserMessage(prompt);

            IsBusy = true;
            _sawEventSinceSend = false;
            WriteToHost(payload);

            StartSilenceWatchdog();
        }

        /// <summary>发出提示词后若长时间收不到**任何**事件，在转录里说明情况。</summary>
        private void StartSilenceWatchdog()
        {
            int generation = ++_sendGeneration;

            Task.Delay(SilenceTimeout).ContinueWith(_ =>
            {
                if (generation != _sendGeneration || _sawEventSinceSend || !IsBusy || _disposed)
                {
                    return;
                }

                Publish(AgentEvent.Failure(
                    $"已等待 {SilenceTimeout.TotalSeconds:0} 秒仍未收到代理的任何响应。"
                    + "进程可能仍在运行但已停止输出，可尝试中断后重新发送。"
                    + DescribeErrorTail()));
            });
        }

        public void Interrupt()
        {
            if (_host == null || !IsBusy)
            {
                return;
            }

            string payload = "{\"type\":\"control_request\",\"request_id\":\""
                           + Guid.NewGuid().ToString("N")
                           + "\",\"request\":{\"subtype\":\"interrupt\"}}";

            WriteToHost(payload);
        }

        /// <summary>运行时换权限模式，不重启进程。</summary>
        public void SetPermissionMode(string mode)
        {
            string wire = string.Equals(mode, ClaudeSessionOptions.DangerouslySentinel, StringComparison.OrdinalIgnoreCase)
                ? "bypassPermissions"
                : (mode ?? string.Empty).Trim();

            SendSwitch("set_permission_mode", "mode", wire, "切换权限模式");
        }

        /// <summary>运行时换型号，不重启进程。</summary>
        public void SetModel(string model)
        {
            string value = (model ?? string.Empty).Trim();
            SendSwitch("set_model", "model", value, "切换型号");

            // 可用性随型号变，换完重读一次
            if (value.Length > 0)
            {
                RequestAppliedSettings();
            }
        }

        /// <summary>运行时换强度：只作用于本会话，不写设置文件。</summary>
        public void SetEffort(string effort)
        {
            string value = (effort ?? string.Empty).Trim();

            if (_host == null || value.Length == 0)
            {
                return;
            }

            string id = Guid.NewGuid().ToString("N");

            lock (_pendingLock)
            {
                _pendingSwitches[id] = "切换强度";
            }

            // 实测：auto 被忽略，null 才回到模型默认档
            string level = string.Equals(value, DefaultEffort, StringComparison.OrdinalIgnoreCase)
                ? "null"
                : JsonSerializer.Serialize(value);

            string payload = "{\"type\":\"control_request\",\"request_id\":\"" + id
                           + "\",\"request\":{\"subtype\":\"apply_flag_settings\",\"settings\":{\"effortLevel\":"
                           + level + "}}}";

            WriteToHost(payload);
            RequestAppliedSettings();
        }

        /// <summary>开关远程控制要等多久：开要到服务端登记。</summary>
        private static readonly TimeSpan RemoteControlTimeout = TimeSpan.FromSeconds(30);

        /// <summary>开关远程控制并等 CLI 回话；结果另发一条事件，成功返回 true。</summary>
        public async Task<bool> SetRemoteControlAsync(bool on)
        {
            if (_host == null)
            {
                Publish(AgentEvent.RemoteControl(new AgentRemoteControl
                {
                    State = AgentRemoteControl.StateFailed,
                    Detail = "会话还没启动，等它起来再开。",
                    Requested = true
                }));
                return false;
            }

            try
            {
                string body = "{\"subtype\":\"remote_control\",\"enabled\":" + (on ? "true" : "false") + "}";
                string response = await SendControlRequestAsync(body, RemoteControlTimeout).ConfigureAwait(false);

                // 标成「对这次点按的回话」：前端据此每点一次都在聊天区说一句
                AgentRemoteControl result = AgentRemoteControl.FromResponse(response, on);
                result.Requested = true;
                Publish(AgentEvent.RemoteControl(result));
                return true;
            }
            catch (Exception ex)
            {
                // 实测：组织策略禁用时 CLI 回 error，原话就是原因
                Publish(AgentEvent.RemoteControl(new AgentRemoteControl
                {
                    State = AgentRemoteControl.StateFailed,
                    Detail = ex.Message,
                    Requested = true
                }));
                return false;
            }
        }

        /// <summary>开关 Ultracode（会话级，不落盘）。关要发 null，不是 false。</summary>
        public void SetUltracode(bool on)
        {
            if (_host == null)
            {
                // 进程没起，发不出去：回报「没开」让界面回滚
                PublishUltracodeOff();
                return;
            }

            string id = Guid.NewGuid().ToString("N");

            lock (_pendingLock)
            {
                _pendingSwitches[id] = UltracodeSwitchName;
            }

            string payload = "{\"type\":\"control_request\",\"request_id\":\"" + id
                           + "\",\"request\":{\"subtype\":\"apply_flag_settings\",\"settings\":{\"ultracode\":"
                           + (on ? "true" : "null") + "}}}";

            WriteToHost(payload);

            // 非法值也回 success，状态以重读为准
            RequestAppliedSettings();
        }

        /// <summary>向 CLI 读一次当前生效设置（get_settings）。</summary>
        public void RequestAppliedSettings()
        {
            if (_host == null)
            {
                return;
            }

            string payload = "{\"type\":\"control_request\",\"request_id\":\""
                           + Guid.NewGuid().ToString("N")
                           + "\",\"request\":{\"subtype\":\"get_settings\"}}";

            try
            {
                WriteToHost(payload);
            }
            catch (IOException)
            {
                // 进程刚好退了：重读只是尽力而为，读取线程上不能抛
            }
            catch (ObjectDisposedException)
            {
            }
        }

        /// <summary>向 CLI 读一次 MCP 服务器状态（mcp_status），读到就发给界面。</summary>
        public async Task RequestMcpStatusAsync()
        {
            try
            {
                string response = await SendControlRequestAsync("{\"subtype\":\"mcp_status\"}").ConfigureAwait(false);
                IReadOnlyList<McpServerInfo>? servers = McpStatusReader.Read(response);

                if (servers == null)
                {
                    return;
                }

                // 不走 ApplyEvent：那里会按握手改写 Model
                Publish(AgentEvent.Started(new AgentSessionInfo { McpServers = servers }));
            }
            catch (Exception)
            {
                // 尽力而为：旧 CLI 不认这条请求时，仍由第一句话之后的 init 补上
            }
        }

        /// <summary>往 CLI 的 stdin 写一行；会话已释放时不写。</summary>
        private void WriteToHost(string payload)
        {
            IJsonLineProcessHost? host = _host;

            if (host == null)
            {
                return;
            }

            lock (_writeLock)
            {
                host.WriteLine(payload);
            }
        }

        /// <summary>回报 Ultracode 没开，可用性沿用上次所知。</summary>
        private void PublishUltracodeOff()
        {
            var settings = new AppliedSettingsInfo
            {
                UltracodeAvailable = _ultracodeAvailable,
                UltracodeRequested = false
            };

            Publish(AgentEvent.Applied(settings));
        }

        private void SendSwitch(string subtype, string field, string value, string what)
        {
            if (_host == null || value.Length == 0)
            {
                return;
            }

            string id = Guid.NewGuid().ToString("N");

            lock (_pendingLock)
            {
                _pendingSwitches[id] = what;
            }

            string payload = "{\"type\":\"control_request\",\"request_id\":\"" + id
                           + "\",\"request\":{\"subtype\":\"" + subtype + "\",\"" + field + "\":"
                           + JsonSerializer.Serialize(value) + "}}";

            WriteToHost(payload);
        }

        /// <summary>切换请求被拒：说出原因，不能让界面以为已经切了。</summary>
        private void ReportRejectedSwitch(string line)
        {
            if (line.IndexOf("control_response", StringComparison.Ordinal) < 0
                || line.IndexOf("\"error\"", StringComparison.Ordinal) < 0)
            {
                return;
            }

            try
            {
                using (JsonDocument document = JsonDocument.Parse(line))
                {
                    if (!document.RootElement.TryGetProperty("response", out JsonElement response)
                        || !response.TryGetProperty("request_id", out JsonElement idElement))
                    {
                        return;
                    }

                    string id = idElement.GetString() ?? string.Empty;
                    string what;

                    lock (_pendingLock)
                    {
                        if (!_pendingSwitches.TryGetValue(id, out what!))
                        {
                            return;
                        }

                        _pendingSwitches.Remove(id);
                    }

                    string reason = response.TryGetProperty("error", out JsonElement error)
                        ? error.GetString() ?? string.Empty
                        : string.Empty;

                    Publish(AgentEvent.Failure(what + "失败：" + reason));

                    if (string.Equals(what, UltracodeSwitchName, StringComparison.Ordinal))
                    {
                        PublishUltracodeOff();
                    }
                }
            }
            catch (JsonException)
            {
            }
        }

        public IReadOnlyList<AgentEvent> Replay()
        {
            lock (_logLock)
            {
                AgentEvent[] snapshot = _eventLog.ToArray();
                return snapshot;
            }
        }

        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            FailPendingRequests("会话已关闭。");

            if (_host != null)
            {
                _host.LineReceived -= OnLineReceived;
                _host.ErrorLineReceived -= OnErrorLineReceived;
                _host.Exited -= OnExited;
                _host.Kill();
                _host.Dispose();
                _host = null;
            }
        }

        #endregion

        #region 登录

        /// <summary>开始登录：让 CLI 生成登录网址。claudeAi=false 走 Console。</summary>
        public async Task<ClaudeLoginUrls> BeginLoginAsync(bool claudeAi)
        {
            string body = "{\"subtype\":\"claude_authenticate\",\"loginWithClaudeAi\":"
                        + (claudeAi ? "true" : "false") + "}";

            string response = await SendControlRequestAsync(body).ConfigureAwait(false);

            using (JsonDocument document = JsonDocument.Parse(response))
            {
                JsonElement root = document.RootElement;

                var urls = new ClaudeLoginUrls
                {
                    ManualUrl = ReadStringField(root, "manualUrl"),
                    AutomaticUrl = ReadStringField(root, "automaticUrl")
                };

                if (urls.ManualUrl.Length == 0 && urls.AutomaticUrl.Length == 0)
                {
                    throw new InvalidOperationException("CLI 没有给出登录网址。");
                }

                return urls;
            }
        }

        /// <summary>等浏览器那边完成登录。</summary>
        public Task WaitForLoginAsync()
        {
            // 用户在浏览器里登录要多久说不准，不设上限
            Task<string> wait = SendControlRequestAsync("{\"subtype\":\"claude_oauth_wait_for_completion\"}", null);
            return wait;
        }

        /// <summary>提交手动粘贴的授权码，形如 code#state。</summary>
        public Task SubmitLoginCodeAsync(string code)
        {
            string text = (code ?? string.Empty).Trim();
            int hash = text.IndexOf('#');
            string authorizationCode = hash >= 0 ? text.Substring(0, hash) : text;
            string state = hash >= 0 ? text.Substring(hash + 1) : string.Empty;

            string body = "{\"subtype\":\"claude_oauth_callback\",\"authorizationCode\":"
                        + JsonSerializer.Serialize(authorizationCode)
                        + ",\"state\":" + JsonSerializer.Serialize(state) + "}";

            Task<string> submit = SendControlRequestAsync(body);
            return submit;
        }

        /// <summary>重发一次握手，只取账号三项发给界面，型号等不动。</summary>
        public async Task RefreshAccountAsync()
        {
            string response = await SendControlRequestAsync("{\"subtype\":\"initialize\"}").ConfigureAwait(false);

            using (JsonDocument document = JsonDocument.Parse(response))
            {
                JsonElement account = document.RootElement.ValueKind == JsonValueKind.Object
                    && document.RootElement.TryGetProperty("account", out JsonElement found)
                        ? found
                        : default;

                var info = new AgentSessionInfo
                {
                    AccountEmail = ReadStringField(account, "email"),
                    AccountOrganization = ReadStringField(account, "organization"),
                    SubscriptionType = ReadStringField(account, "subscriptionType")
                };

                // 不走 ApplyEvent：那里会按握手改写 Model
                Publish(AgentEvent.Started(info));
            }
        }

        /// <summary>侧问：不打断当前对话另问一句；historyJson 为此前问答数组。</summary>
        public async Task<string> AskSideQuestionAsync(string question, string historyJson)
        {
            string history = CompactHistory(historyJson);
            bool hasHistory = history.Length > 0;

            string body = "{\"subtype\":\"side_question\",\"question\":" + JsonSerializer.Serialize(question ?? string.Empty)
                        + (hasHistory ? ",\"history\":" + history : string.Empty) + "}";

            string response = await SendControlRequestAsync(body).ConfigureAwait(false);

            using (JsonDocument document = JsonDocument.Parse(response))
            {
                string answer = ReadStringField(document.RootElement, "response");
                return answer;
            }
        }

        /// <summary>把历史压成单行 JSON 数组；不是非空数组返回空串。</summary>
        private static string CompactHistory(string historyJson)
        {
            if (string.IsNullOrWhiteSpace(historyJson))
            {
                return string.Empty;
            }

            try
            {
                using (JsonDocument document = JsonDocument.Parse(historyJson))
                {
                    JsonElement root = document.RootElement;

                    if (root.ValueKind != JsonValueKind.Array || root.GetArrayLength() == 0)
                    {
                        return string.Empty;
                    }

                    // 重写一遍去掉换行：stdin 协议一行一条
                    string compact = JsonSerializer.Serialize(root);
                    return compact;
                }
            }
            catch (JsonException)
            {
                return string.Empty;
            }
        }

        /// <summary>一般控制请求等回包的上限；等浏览器登录那步不限时。</summary>
        internal static readonly TimeSpan ControlRequestTimeout = TimeSpan.FromSeconds(120);

        /// <summary>发一个控制请求并等回包，超时即失败；成功返回回包正文 JSON。</summary>
        internal Task<string> SendControlRequestAsync(string requestBody)
        {
            Task<string> request = SendControlRequestAsync(requestBody, ControlRequestTimeout);
            return request;
        }

        /// <summary>同上；timeout 为 null 时一直等到回包或进程退出。</summary>
        internal Task<string> SendControlRequestAsync(string requestBody, TimeSpan? timeout)
        {
            if (_host == null)
            {
                throw new InvalidOperationException("会话尚未启动。");
            }

            string id = Guid.NewGuid().ToString("N");
            var pending = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);

            lock (_pendingLock)
            {
                _pendingRequests[id] = pending;
            }

            string payload = "{\"type\":\"control_request\",\"request_id\":\"" + id
                           + "\",\"request\":" + requestBody + "}";

            try
            {
                WriteToHost(payload);
            }
            catch (Exception ex)
            {
                lock (_pendingLock)
                {
                    _pendingRequests.Remove(id);
                }

                pending.TrySetException(ex);
            }

            if (timeout.HasValue)
            {
                ExpireAfter(id, pending, timeout.Value);
            }

            return pending.Task;
        }

        /// <summary>到点还没回包就让这个请求失败，免得界面一直转圈。</summary>
        private void ExpireAfter(string id, TaskCompletionSource<string> pending, TimeSpan timeout)
        {
            Task.Delay(timeout).ContinueWith(_ =>
            {
                lock (_pendingLock)
                {
                    if (!_pendingRequests.Remove(id))
                    {
                        return;
                    }
                }

                pending.TrySetException(new TimeoutException(
                    $"等了 {timeout.TotalSeconds:0} 秒 CLI 仍没有回应。"));
            }, TaskScheduler.Default);
        }

        /// <summary>收到控制回包时交给等它的请求；交出去了返回 true。</summary>
        private bool CompletePendingRequest(string line)
        {
            if (line.IndexOf("control_response", StringComparison.Ordinal) < 0)
            {
                return false;
            }

            lock (_pendingLock)
            {
                if (_pendingRequests.Count == 0)
                {
                    return false;
                }
            }

            try
            {
                using (JsonDocument document = JsonDocument.Parse(line))
                {
                    if (!document.RootElement.TryGetProperty("response", out JsonElement envelope)
                        || envelope.ValueKind != JsonValueKind.Object)
                    {
                        return false;
                    }

                    string id = ReadStringField(envelope, "request_id");
                    TaskCompletionSource<string> pending;

                    lock (_pendingLock)
                    {
                        if (!_pendingRequests.TryGetValue(id, out pending!))
                        {
                            return false;
                        }

                        _pendingRequests.Remove(id);
                    }

                    if (ReadStringField(envelope, "subtype") != "success")
                    {
                        string error = ReadStringField(envelope, "error");
                        pending.TrySetException(new InvalidOperationException(
                            error.Length > 0 ? error : "CLI 拒绝了这个请求。"));
                        return true;
                    }

                    string body = envelope.TryGetProperty("response", out JsonElement response)
                        ? response.GetRawText()
                        : "{}";

                    pending.TrySetResult(body);
                    return true;
                }
            }
            catch (JsonException)
            {
                return false;
            }
        }

        /// <summary>进程没了：所有还在等的请求一起失败。</summary>
        private void FailPendingRequests(string reason)
        {
            List<TaskCompletionSource<string>> waiting;

            lock (_pendingLock)
            {
                waiting = new List<TaskCompletionSource<string>>(_pendingRequests.Values);
                _pendingRequests.Clear();
            }

            foreach (TaskCompletionSource<string> pending in waiting)
            {
                pending.TrySetException(new InvalidOperationException(reason));
            }
        }

        /// <summary>读一个字符串字段；没有或不是字符串返回空串。</summary>
        private static string ReadStringField(JsonElement parent, string name)
        {
            if (parent.ValueKind != JsonValueKind.Object
                || !parent.TryGetProperty(name, out JsonElement value)
                || value.ValueKind != JsonValueKind.String)
            {
                return string.Empty;
            }

            string text = value.GetString() ?? string.Empty;
            return text;
        }

        #endregion

        #region 事件处理

        private void OnLineReceived(object sender, string line)
        {
            // 有人专门在等的回包只交给它，不当成会话事件
            if (CompletePendingRequest(line))
            {
                return;
            }

            ReportRejectedSwitch(line);

            IReadOnlyList<AgentEvent> events = _parser.ParseLine(line);

            foreach (AgentEvent evt in events)
            {
                // 设置回报不是代理的响应，不能让静默看门狗以为有动静
                if (evt.Kind != AgentEventKind.AppliedSettings)
                {
                    _sawEventSinceSend = true;
                }

                ApplyEvent(evt);
                Publish(evt);

                if (evt.CompactionData?.Phase == AgentCompaction.PhaseCompleted)
                {
                    FetchCompactSummary(evt.CompactionData.BoundaryUuid);
                }
            }
        }

        /// <summary>压缩完后到转录里找摘要，找到补发一条。</summary>
        private void FetchCompactSummary(string boundaryUuid)
        {
            string transcript = FileHistoryReader.TranscriptPathFor(_workingDirectory, SessionId);

            if (transcript.Length == 0)
            {
                return;
            }

            Task.Run(async () =>
            {
                try
                {
                    for (int attempt = 1; attempt <= SummaryAttempts && !_disposed; attempt++)
                    {
                        await Task.Delay(SummaryRetryDelay).ConfigureAwait(false);

                        // 最后一次才退回「最近一条」，免得拿到上一次压缩的摘要
                        string summary = CompactSummaryReader.Find(transcript, boundaryUuid, attempt == SummaryAttempts);

                        if (summary.Length > 0)
                        {
                            Publish(AgentEvent.Compaction(new AgentCompaction
                            {
                                Phase = AgentCompaction.PhaseSummary,
                                BoundaryUuid = boundaryUuid,
                                Summary = summary
                            }));
                            return;
                        }
                    }
                }
                catch (Exception)
                {
                    // 摘要只是展开看的附加信息，读不到不影响对话
                }
            });
        }

        private void AbsorbProbeText(string text)
        {
            IReadOnlyList<UsageWindow> usage = UsageLimitsParser.Parse(text);

            if (usage.Count > 0)
            {
                _probedState.UsageWindows = usage;
                _probedState.UsageRawText = text;
            }

            ModelState state = ModelStateParser.ParseModelOutput(text);

            if (state.Model.Length > 0)
            {
                _probedState.Model = state.Model;
            }

            if (state.Effort.Length > 0)
            {
                _probedState.EffortLevel = state.Effort;
            }

            if (state.AvailableModels.Count > 0)
            {
                _probedState.AvailableModels = state.AvailableModels;
            }

            IReadOnlyList<string> levels = ModelStateParser.ParseEffortLevels(text);

            if (levels.Count > 0)
            {
                _probedState.EffortLevels = levels;
            }
        }

        private void PublishProbedState()
        {
            if (_probedState.EffortLevel.Length == 0)
            {
                _probedState.EffortLevel = _settingsEffortLevel;
            }

            if (!_probedState.HasAnyState)
            {
                return;
            }

            Publish(AgentEvent.Started(_probedState));
        }

        private void OnErrorLineReceived(object sender, string line)
        {
            if (string.IsNullOrWhiteSpace(line))
            {
                return;
            }

            lock (_logLock)
            {
                _errorTail.Enqueue(line);

                while (_errorTail.Count > ErrorTailLimit)
                {
                    _errorTail.Dequeue();
                }
            }
        }

        private string DescribeErrorTail()
        {
            string[] lines;

            lock (_logLock)
            {
                lines = _errorTail.ToArray();
            }

            if (lines.Length == 0)
            {
                return string.Empty;
            }

            string text = "\n\n代理进程的错误输出：\n" + string.Join("\n", lines);
            return text;
        }

        private void ApplyEvent(AgentEvent evt)
        {
            switch (evt.Kind)
            {
                case AgentEventKind.SessionStarted:
                    SawSessionStarted = true;

                    if (evt.SessionInfo != null)
                    {
                        // CLI 不汇报 effort，只能补上从 settings.json 读到的值，
                        if (evt.SessionInfo.EffortLevel.Length == 0)
                        {
                            evt.SessionInfo.EffortLevel = string.IsNullOrEmpty(_options.Effort)
                                ? _settingsEffortLevel
                                : _options.Effort;
                        }

                        // 控制回包根上没有 session_id，无条件赋值会把 id 抹成空串。
                        if (evt.SessionInfo.SessionId.Length > 0)
                        {
                            SessionId = evt.SessionInfo.SessionId;
                        }

                        Model = evt.SessionInfo.Model;

                        // 带型号清单的是握手回包：此后才读得到生效设置
                        if (evt.SessionInfo.Models.Count > 0)
                        {
                            RequestAppliedSettings();

                            // init 要等第一句话才来，MCP 状态在那之前得单独问
                            _ = RequestMcpStatusAsync();
                        }
                    }
                    break;

                case AgentEventKind.AppliedSettings:
                    if (evt.AppliedSettings != null)
                    {
                        _ultracodeAvailable = evt.AppliedSettings.UltracodeAvailable;
                    }
                    break;

                case AgentEventKind.TurnCompleted:
                    IsBusy = false;

                    if (!string.IsNullOrEmpty(SessionId))
                    {
                        ResumableSessionId = SessionId;
                    }

                    // /effort 等命令会改生效设置，每轮说完跟一次
                    RequestAppliedSettings();
                    break;
            }
        }

        private void OnExited(object sender, int exitCode)
        {
            FailPendingRequests($"代理进程已退出（退出码 {exitCode}）。");

            if (!IsBusy)
            {
                if (SawSessionStarted)
                {
                    return;
                }

                // 握手都没完成就退出：旧代码在这里直接 return，用户面对的是一个
                // 不响应的空面板，没有任何线索。
                Publish(AgentEvent.Failure(
                    $"代理进程在握手完成前就退出了（退出码 {exitCode}）。" + DescribeErrorTail()));

                StartupFailed?.Invoke(this, EventArgs.Empty);
                return;
            }

            AgentEvent failure = AgentEvent.Failure(
                $"代理进程意外退出（退出码 {exitCode}）。" + DescribeErrorTail());
            Publish(failure);

            IsBusy = false;

            var result = new AgentTurnResult { WasInterrupted = false };
            Publish(AgentEvent.Completed(result));
        }

        private void Publish(AgentEvent evt)
        {
            lock (_logLock)
            {
                _eventLog.Add(evt);
            }

            Received?.Invoke(this, evt);
        }

        #endregion

        #region 载荷构造

        private static readonly JsonWriterOptions RelaxedWriterOptions = new JsonWriterOptions
        {
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        };

        private static string BuildUserMessage(AgentPrompt prompt)
        {
            var buffer = new MemoryStream();

            using (var writer = new Utf8JsonWriter(buffer, RelaxedWriterOptions))
            {
                writer.WriteStartObject();
                writer.WriteString("type", "user");

                writer.WriteStartObject("message");
                writer.WriteString("role", "user");

                writer.WriteStartArray("content");

                foreach (AgentImage image in prompt.Images ?? Array.Empty<AgentImage>())
                {
                    if (image == null || !image.IsValid)
                    {
                        continue;
                    }

                    writer.WriteStartObject();
                    writer.WriteString("type", "image");

                    writer.WriteStartObject("source");
                    writer.WriteString("type", "base64");
                    writer.WriteString("media_type", image.MediaType);
                    writer.WriteString("data", image.Base64Data);
                    writer.WriteEndObject();

                    writer.WriteEndObject();
                }

                writer.WriteStartObject();
                writer.WriteString("type", "text");
                writer.WriteString("text", prompt.Text ?? string.Empty);
                writer.WriteEndObject();

                writer.WriteEndArray();

                writer.WriteEndObject();
                writer.WriteEndObject();
            }

            string json = Encoding.UTF8.GetString(buffer.ToArray());
            return json;
        }

        #endregion
    }
}
