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

        /// <summary>还没收完的轮次，按**发出顺序**排队。</summary>
        private readonly Queue<PendingTurn> _pendingTurns = new Queue<PendingTurn>();

        /// <summary>一轮探测最多抑制这么久。</summary>
        public TimeSpan ProbeTimeout { get; set; } = TimeSpan.FromSeconds(60);

        /// <summary>额度短进程等多久。实测一次不到一秒。</summary>
        public TimeSpan UsageProbeTimeout { get; set; } = TimeSpan.FromSeconds(30);

        /// <summary>怎么跑额度探测。单测把它换掉，免得真去起进程。</summary>
        internal Func<string, IDictionary<string, string>, int, string> UsageProbe { get; set; }
            = UsageProbeProcess.Run;

        /// <summary>额度探测在跑没有，0 表示空闲。</summary>
        private int _usageProbeRunning;

        /// <summary>护住 <see cref="_probedState"/>：读取线程与探测线程都会改它。</summary>
        private readonly object _probedStateLock = new object();

        private bool _probeTimeoutReported;

        private struct PendingTurn
        {
            public PendingTurn(bool isProbe, DateTime atUtc)
            {
                IsProbe = isProbe;
                AtUtc = atUtc;
            }

            public bool IsProbe { get; }

            /// <summary>入队时刻，用于判断这一轮是不是卡住了。</summary>
            public DateTime AtUtc { get; }
        }

        private readonly System.Text.StringBuilder _probeBuffer = new System.Text.StringBuilder();

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
        }

        #endregion

        #region 属性

        public string SessionId { get; private set; } = string.Empty;

        public string ResumableSessionId { get; private set; } = string.Empty;

        public string Model { get; private set; } = string.Empty;

        public bool IsBusy { get; private set; }

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
            SendStateProbes();
            StartUsageProbe();
        }

        private void SendStateProbes()
        {
            _probeBuffer.Clear();

            // 清单在 AgentProbeCommands 里，回放过滤读的是同一份：
            // 在那边加一条就同时管住「发出去」和「别回放回来」，不会走散。
            foreach (string command in AgentProbeCommands.Startup)
            {
                SendProbe(command);
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

        private void SendProbe(string command)
        {
            var prompt = new AgentPrompt { Text = command };

            // 入队与写出必须成对，且顺序一致：队列表达的就是「stdin 里第几条消息」。
            lock (_pendingTurns)
            {
                _pendingTurns.Enqueue(new PendingTurn(true, DateTime.UtcNow));
            }

            _host?.WriteLine(BuildUserMessage(prompt));
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

            lock (_pendingTurns)
            {
                _pendingTurns.Enqueue(new PendingTurn(false, DateTime.UtcNow));
            }

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

                if (SwallowedByProbe(evt))
                {
                    continue;
                }

                Publish(evt);
            }
        }

        private bool SwallowedByProbe(AgentEvent evt)
        {
            if (!CurrentTurnIsProbe())
            {
                return false;
            }

            switch (evt.Kind)
            {
                case AgentEventKind.AssistantText:
                    _probeBuffer.AppendLine(evt.Content);
                    return true;

                case AgentEventKind.TurnCompleted:
                    DequeueTurn();

                    lock (_probedStateLock)
                    {
                        AbsorbProbeText(_probeBuffer.ToString());

                        // **每收完一轮就发一次**，不等几轮都齐。
                        PublishProbedState();
                    }

                    _probeBuffer.Clear();

                    return true;

                case AgentEventKind.UsageUpdated:
                case AgentEventKind.RateLimitUpdated:
                case AgentEventKind.SessionStarted:
                    return false;

                default:
                    // 思考、工具调用等不该出现在这两条本地命令里
                    return false;
            }
        }

        private bool CurrentTurnIsProbe()
        {
            bool timedOut = false;

            lock (_pendingTurns)
            {
                // 卡住的探测轮次逐个丢掉：它的结束事件不会来了，再等下去就是把后面所有输出都吞掉。
                while (_pendingTurns.Count > 0
                    && _pendingTurns.Peek().IsProbe
                    && DateTime.UtcNow - _pendingTurns.Peek().AtUtc > ProbeTimeout)
                {
                    _pendingTurns.Dequeue();
                    timedOut = true;
                }

                if (!timedOut)
                {
                    return _pendingTurns.Count > 0 && _pendingTurns.Peek().IsProbe;
                }
            }

            if (!_probeTimeoutReported)
            {
                _probeTimeoutReported = true;
                Publish(AgentEvent.Notice(NoticeText.ProbeNoAnswer));
            }

            lock (_pendingTurns)
            {
                return _pendingTurns.Count > 0 && _pendingTurns.Peek().IsProbe;
            }
        }

        private void DequeueTurn()
        {
            lock (_pendingTurns)
            {
                if (_pendingTurns.Count > 0)
                {
                    _pendingTurns.Dequeue();
                }
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

                        SessionId = evt.SessionInfo.SessionId;
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
