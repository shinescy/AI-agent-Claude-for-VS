// 终端那一路 claude 的启动参数

namespace AgentExtension.Agents
{
    /// <summary>终端标签起 claude 时用的启动参数。</summary>
    public class TerminalLaunchOptions
    {
        /// <summary><c>--model</c> 的取值，如 <c>opus</c>。</summary>
        public string Model { get; set; } = string.Empty;

        /// <summary><c>--effort</c> 的取值，如 <c>high</c>。</summary>
        public string Effort { get; set; } = string.Empty;

        /// <summary><c>--permission-mode</c> 的取值，或哨兵值 <c>dangerously</c>。</summary>
        public string PermissionMode { get; set; } = string.Empty;

        /// <summary>终端要接回的会话 id；空串表示开一条新会话。</summary>
        public string ResumeSessionId { get; set; } = string.Empty;

        /// <summary>逐字段比较。</summary>
        public bool SameAs(TerminalLaunchOptions? other)
        {
            if (other == null)
            {
                return false;
            }

            bool same = string.Equals(Model, other.Model, System.StringComparison.Ordinal)
                && string.Equals(Effort, other.Effort, System.StringComparison.Ordinal)
                && string.Equals(PermissionMode, other.PermissionMode, System.StringComparison.Ordinal);

            return same;
        }
    }
}
