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

        Raw
    }
}
