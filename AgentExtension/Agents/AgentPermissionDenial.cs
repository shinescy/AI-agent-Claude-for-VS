// 被拒绝执行的工具调用

namespace AgentExtension.Agents
{
    /// <summary>CLI 因缺少授权而拒绝的工具调用，出现在轮次结果里。</summary>
    public class AgentPermissionDenial
    {
        public string ToolName { get; set; } = string.Empty;

        public string ToolUseId { get; set; } = string.Empty;

        public string ToolInputJson { get; set; } = string.Empty;
    }
}
