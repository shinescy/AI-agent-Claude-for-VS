// 归一化事件的种类

namespace AgentExtension.Agents
{
    /// <summary>归一化事件种类。</summary>
    public enum AgentEventKind
    {
        SessionStarted,

        AssistantText,

        Thinking,

        ToolCallStarted,

        ToolCallCompleted,

        HookProgress,

        InteractionRequested,

        UsageUpdated,

        RateLimitUpdated,

        TurnCompleted,

        Failed,

        Notice,

        /// <summary>用户发出的一句话。只用于日志与回放，实时那一路由前端本地加块。</summary>
        UserPrompt,

        /// <summary>CLI 汇报的当前生效设置，不进转录。</summary>
        AppliedSettings,

        /// <summary>上下文压缩的开始、完成、失败与摘要。</summary>
        Compaction,

        /// <summary>远程控制的连接状态变了（以 CLI 回话为准）。</summary>
        RemoteControlChanged,

        Raw
    }
}
