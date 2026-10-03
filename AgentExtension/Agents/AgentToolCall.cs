// 一次工具调用的输入与结果

namespace AgentExtension.Agents
{
    /// <summary>一次工具调用。</summary>
    public class AgentToolCall
    {
        public string ToolUseId { get; set; } = string.Empty;

        public string Name { get; set; } = string.Empty;

        /// <summary>工具输入的原始 JSON，供 UI 渲染。</summary>
        public string InputJson { get; set; } = string.Empty;

        public string ResultText { get; set; } = string.Empty;

        public bool IsError { get; set; }
    }
}
