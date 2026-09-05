// 决定哪些按键要抢回网页——VS 会把导航键当自己的命令吃掉

namespace AgentExtension.ToolWindows
{
    /// <summary>「这个按键该归网页还是归 VS」的判定。</summary>
    internal static class PanelKeyPolicy
    {
        #region 常量

        public const int WmKeyDown = 0x0100;
        public const int WmKeyUp = 0x0101;

        private const int VkTab = 0x09;
        private const int VkReturn = 0x0D;
        private const int VkEscape = 0x1B;
        private const int VkPageUp = 0x21;
        private const int VkPageDown = 0x22;
        private const int VkEnd = 0x23;
        private const int VkHome = 0x24;
        private const int VkLeft = 0x25;
        private const int VkUp = 0x26;
        private const int VkRight = 0x27;
        private const int VkDown = 0x28;

        #endregion

        #region 判定

        /// <summary>判断这条按键消息是否要抢下来直接投给浏览器。</summary>
        public static bool ShouldForward(int message, int virtualKey, bool shift, bool control, bool alt)
        {
            if (message != WmKeyDown && message != WmKeyUp)
            {
                return false;
            }

            if (alt)
            {
                return false;
            }

            switch (virtualKey)
            {
                case VkTab:
                case VkReturn:
                case VkPageUp:
                case VkPageDown:
                    return !control;

                case VkEscape:
                    return !control && !shift;

                case VkLeft:
                case VkUp:
                case VkRight:
                case VkDown:
                case VkHome:
                case VkEnd:
                    return true;

                // 剪贴板/编辑类组合键（Ctrl+C/V/X/A/Z/Y 等）刻意不放进这张白名单：
                // 2026-08-19 实测（见 docs/superpowers/specs/2026-08-15-agent-extension-design.md
                // 约 1000-1016 行）用 CDP 向有焦点的窗口直接投递按键消息、从页面读 keydown 记录，
                // 确认 Ctrl+A/C/V/X/Z 在完全不改这张白名单的情况下就已经到得了网页——焦点在本
                // 面板时没有命令目标处理 Edit.Copy 等命令，VS 于是不消耗这个键，交给 default 分支
                // 落回 VS 之后其实等于什么也没拦。2026-08-25 曾经因为「Ctrl+C 用不了」的表面现象
                // 在这里加过白名单分支，但复测后确认那不是真正的根因（用户反馈的是终端本身没有
                // 复制语义，Ctrl+C 该发的是中断信号），已撤销。后来者若又遇到「面板里某个 Ctrl+
                // 字母组合好像不好使」，先按同样的方法实测一遍，不要凭推断改这里。

                default:
                    return false;
            }
        }


        /// <summary>这个键会不会在 WPF 按键路由里被工具窗外层的选项卡组抢走。</summary>
        public static bool IsStolenByWpfRoute(int virtualKey, bool alt)
        {
            if (alt)
            {
                return false;
            }

            return virtualKey == VkHome || virtualKey == VkEnd;
        }

        #endregion
    }
}
