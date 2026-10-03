// 一个轮次的 token 用量与成本

namespace AgentExtension.Agents
{
    /// <summary>token 用量与成本。</summary>
    public class AgentUsage
    {
        public int InputTokens { get; set; }

        public int OutputTokens { get; set; }

        public int CacheReadTokens { get; set; }

        public int CacheCreationTokens { get; set; }

        public double CostUsd { get; set; }

        public int DurationMs { get; set; }
    }
}
