// 可从面板发起的 CLI 子命令

namespace AgentExtension.Agents
{
    /// <summary>一条 CLI 子命令。</summary>
    public class ClaudeSubcommand
    {
        /// <summary>前端用来点名的标识。</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>给用户看的名字。</summary>
        public string Label { get; set; } = string.Empty;

        /// <summary>传给 CLI 的固定参数字面量。</summary>
        public string Arguments { get; set; } = string.Empty;

        /// <summary>能否在面板内直接执行。</summary>
        public bool CanRunInPanel { get; set; }

        /// <summary>不可代跑时，告诉用户该怎么做。</summary>
        public string Guidance { get; set; } = string.Empty;
    }
}
