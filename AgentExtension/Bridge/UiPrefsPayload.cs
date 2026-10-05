// uiPrefs 消息的载荷：语言与外观偏好

namespace AgentExtension.Bridge
{
    /// <summary>
    /// 语言/外观偏好。前端改了语言或外观时以入站 <c>uiPrefsChanged</c> 发给宿主，
    /// 宿主转发给发起 tab 以外的其余桥时用同一形状的出站 <c>uiPrefs</c>。
    /// </summary>
    public sealed class UiPrefsPayload
    {
        public string Lang { get; set; } = string.Empty;

        public UiPrefsAppearance Appearance { get; set; } = new UiPrefsAppearance();
    }
}
