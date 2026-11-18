// 前端请求切换 tab 时带的信息

namespace AgentExtension.ToolWindows
{
    /// <summary>前端请求切换 tab 时带的信息。</summary>
    public sealed class TabActivateRequest
    {
        /// <summary>要切到的 tab id。</summary>
        public string TabId { get; set; } = string.Empty;

        /// <summary>是不是键盘方向键触发的。</summary>
        public bool FromKeyboard { get; set; }
    }
}
