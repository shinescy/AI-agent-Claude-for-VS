// 一个额度窗口的用量

namespace AgentExtension.Agents
{
    /// <summary>一个额度窗口的用量，对应 <c>/usage</c> 输出里 "Current session" / "Current week (…)" 那样的一行。</summary>
    public class UsageWindow
    {
        /// <summary>CLI 给的原始标签，如 <c>Current session</c> / <c>Current week (Fable)</c>。</summary>
        public string Label { get; set; } = string.Empty;

        /// <summary>已用百分比（0–100 的整数部分，CLI 只给整数）。</summary>
        public int PercentUsed { get; set; }

        /// <summary>重置时刻的原文，如 <c>Aug 21, 10:59am (Asia/Taipei)</c>。</summary>
        public string ResetsAtText { get; set; } = string.Empty;

        /// <summary>重置时刻的 Unix 秒；解析不出来时为 0，界面据此改为只显示 <see cref="ResetsAtText"/>、不显示倒计时。</summary>
        public long ResetsAtUnix { get; set; }

        /// <summary>该窗口是否只统计某个特定模型，是则为模型名（如 <c>Fable</c>），否则空串。</summary>
        public string Model { get; set; } = string.Empty;
    }
}
