// 配额/限流状态

namespace AgentExtension.Agents
{
    /// <summary>一次配额状态汇报。</summary>
    public class AgentRateLimit
    {
        /// <summary>CLI 给的状态字面量，如 allowed / allowed_warning。</summary>
        public string Status { get; set; } = string.Empty;

        /// <summary>限流窗口类型，如 seven_day。</summary>
        public string LimitType { get; set; } = string.Empty;

        /// <summary>已用比例，0 到 1。</summary>
        public double Utilization { get; set; }

        /// <summary>额度重置时刻，Unix 秒。</summary>
        public long ResetsAt { get; set; }

        /// <summary>是否已进入超额用量。</summary>
        public bool IsUsingOverage { get; set; }
    }
}
