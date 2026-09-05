// WebView 死了要不要重建

namespace AgentExtension.ToolWindows
{
    /// <summary>
    /// 「面板空了，要不要把 WebView 重新立起来」的判定与预算。
    ///
    /// 为什么需要它：WebView2 的控制器绑在**创建它时所在的那个顶层窗口**上。面板在浮动窗口里被创建、
    /// 用户再把它拖回去停靠时，VS 会销毁那个浮动窗口，控制器随之关闭、浏览器进程退出。
    /// 而 WPF 的 <c>HwndHost</c> 子窗口完好无损（还被正确重排到了停靠位置），
    /// 它的 <c>BuildOrReparentWindow</c> 只在 <c>_hwnd == 0</c> 时才重建，于是永远只走 <c>SetParent</c>——
    /// 没有任何一方会把浏览器再立起来。整个过程不抛异常、不报错，用户看到的就是一片空白。
    /// </summary>
    internal sealed class WebViewRebuildPolicy
    {
        #region 常量

        /// <summary>连续重建的次数上限。建起来又立刻死说明原因不是拖动，再建就是死循环。</summary>
        public const int MaxConsecutiveRebuilds = 5;

        #endregion

        #region 字段

        private int _consecutiveRebuilds;

        private bool _rebuildInFlight;

        #endregion

        #region 判定

        /// <summary>能不能开始一次重建。返回 true 时已经把「重建中」记上了，调用方必须配对调用 <see cref="EndRebuild"/>。</summary>
        public bool TryBeginRebuild(bool shutDown, bool webViewAlive)
        {
            // 面板已经关了：此时 WebView 本来就该是死的，重建等于在坟头上再起一个浏览器进程。
            if (shutDown)
            {
                return false;
            }

            if (webViewAlive)
            {
                return false;
            }

            // 重建是异步的，期间还会再收到几次源变更通知；不挡住就会同时起好几个 WebView 抢同一个消息桥。
            if (_rebuildInFlight)
            {
                return false;
            }

            if (_consecutiveRebuilds >= MaxConsecutiveRebuilds)
            {
                return false;
            }

            _consecutiveRebuilds++;
            _rebuildInFlight = true;
            return true;
        }

        /// <summary>一次重建流程结束（成没成都算）。</summary>
        public void EndRebuild()
        {
            _rebuildInFlight = false;
        }

        /// <summary>前端确实挂载起来了。预算归零——用户一天里能拖很多次面板，每次都该救得回来。</summary>
        public void NoteWebViewLive()
        {
            _consecutiveRebuilds = 0;
        }

        #endregion
    }
}
