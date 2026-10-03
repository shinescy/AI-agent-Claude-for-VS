// 当前会话是从哪个入口带着 --resume 建起来的

namespace AgentExtension.ToolWindows
{
    /// <summary>
    /// 当前这条会话是从哪个入口带着 <c>--resume</c> 建起来的。
    /// 握手前退出要不要自愈、提示语该怎么说，都看这个值，不再只看「本次开机是不是接回起来的」——
    /// 手动接回、带上下文重启这两条路子起不来时同样会静默死掉，得一并兜住（2026-08-25 修复轮次 1）。
    /// </summary>
    public enum ResumeOrigin
    {
        /// <summary>没有带 --resume，是全新会话。</summary>
        None,

        /// <summary>开机打开面板时自动接回，历史已经回放进转录。</summary>
        AutoStartup,

        /// <summary>面板打开期间解决方案变了，按新目录重新判定接回；转录已经清空重记，没有回放。</summary>
        Reconcile,

        /// <summary>用户在面板里手动点「接回」某条历史会话。</summary>
        Manual,

        /// <summary>权限模式等切换时，带着当前会话的可恢复 id 重启进程。</summary>
        Restart
    }
}
