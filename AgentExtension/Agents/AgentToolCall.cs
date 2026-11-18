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

        /// <summary>发起它的子代理调用 id；主线调用为空串。</summary>
        public string ParentToolUseId { get; set; } = string.Empty;

        /// <summary>子代理跑了多久，毫秒；CLI 没给为 0。</summary>
        public long DurationMs { get; set; }

        /// <summary>子代理用掉的 token 数；CLI 没给为 0。</summary>
        public long TotalTokens { get; set; }
    }
}
