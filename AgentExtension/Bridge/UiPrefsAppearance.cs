// 跨 tab 广播的外观设置

namespace AgentExtension.Bridge
{
    /// <summary>
    /// 外观设置，形状与前端 <c>appearance.ts</c> 的 <c>Appearance</c> 接口一一对应。
    /// 宿主只负责原样转发，不解释其中任何字段。
    /// </summary>
    public sealed class UiPrefsAppearance
    {
        public string FontFamily { get; set; } = string.Empty;

        public int FontSize { get; set; }

        public string TextColor { get; set; } = string.Empty;
    }
}
