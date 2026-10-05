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

        /// <summary>探测短进程等多久。实测一次不到一秒。</summary>
        public TimeSpan UsageProbeTimeout { get; set; } = TimeSpan.FromSeconds(30);

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

            _host?.WriteLine(payload);
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
            _host.WriteLine(payload);

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

            _host.WriteLine(payload);
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

        #region 事件处理

        private void OnLineReceived(object sender, string line)
        {
            IReadOnlyList<AgentEvent> events = _parser.ParseLine(line);

            if (events.Count > 0)
            {
                _sawEventSinceSend = true;
            }

            foreach (AgentEvent evt in events)
            {
                ApplyEvent(evt);
                Publish(evt);
            }
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
                    }
                    break;

                case AgentEventKind.TurnCompleted:
                    IsBusy = false;

                    if (!string.IsNullOrEmpty(SessionId))
                    {
                        ResumableSessionId = SessionId;
                    }
                    break;
            }
        }

        private void OnExited(object sender, int exitCode)
        {
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
