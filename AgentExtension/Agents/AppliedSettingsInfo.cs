// CLI 汇报的当前生效设置

namespace AgentExtension.Agents
{
    /// <summary><c>get_settings</c> 回包里 <c>applied</c> 的要点。</summary>
    public class AppliedSettingsInfo
    {
        /// <summary>Ultracode 能不能开；旧 CLI 不报时为 null。</summary>
        public bool? UltracodeAvailable { get; set; }

        /// <summary>开关是否已请求打开；不报时为 null。</summary>
        public bool? UltracodeRequested { get; set; }

        /// <summary>Ultracode 是否真正生效。</summary>
        public bool Ultracode { get; set; }

        /// <summary>真正生效的思考强度。</summary>
        public string Effort { get; set; } = string.Empty;

        /// <summary>真正生效的模型。</summary>
        public string Model { get; set; } = string.Empty;
    }
}
