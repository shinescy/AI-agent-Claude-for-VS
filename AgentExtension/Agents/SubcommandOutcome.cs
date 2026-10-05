// 一次子命令执行的原始结果

namespace AgentExtension.Agents
{
    /// <summary>一次执行的原始结果。</summary>
    public class SubcommandOutcome
    {
        public string StandardOutput { get; set; } = string.Empty;

        public string StandardError { get; set; } = string.Empty;

        public int ExitCode { get; set; }

        public bool TimedOut { get; set; }

        /// <summary>进程根本没起来时的原因；正常起来则为 null。</summary>
        public string? StartFailure { get; set; }
    }
}
