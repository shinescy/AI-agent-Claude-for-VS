// 「接回起不来该不该自愈」的判定与提示语

using AgentExtension.Agents;

namespace AgentExtension.ToolWindows
{
    /// <summary>
    /// 会话在握手前退出时，要不要退回一条不带 --resume 的新会话，以及退回时该说什么。
    /// 判据是「当前这条会话是不是带 --resume 建的」，不是「本次开机是不是接回起来的」——
    /// 手动接回（<see cref="ResumeOrigin.Manual"/>）、带上下文重启（<see cref="ResumeOrigin.Restart"/>）
    /// 这两条路子起不来时同样要兜住，不能只顾开机自动接回那一条。
    ///
    /// 拆成独立、不依赖 VS SDK / WebView2 的纯判定类，是因为 <c>AgentChatControl</c> 整个绑在
    /// WPF + WebView2 上，进不了测试宿主；判定逻辑单独拎出来才有测试立足点。
    /// </summary>
    public static class ResumeFallbackPolicy
    {
        /// <summary>
        /// 该不该触发自愈。<see cref="ResumeOrigin.None"/>（不带 --resume 建的会话）必须返回 false——
        /// 回退出来的新会话正是 None，它自己再起不来属于普通启动失败（claude.exe 本身坏了、参数错），
        /// 不能再当成「接回失败」去重启，否则会来回循环。
        /// </summary>
        public static bool ShouldFallback(ResumeOrigin origin)
        {
            return origin != ResumeOrigin.None;
        }

        /// <summary>
        /// 回退提示按入口说得准，不能一概而论——不同入口对「上面的记录是什么」结论不一样，
        /// 任何一条都不能暗示 CLI 还记得上下文。返回的是 <see cref="NoticeText"/> 里的模板。
        /// </summary>
        public static string DescribeNotice(ResumeOrigin origin)
        {
            switch (origin)
            {
                case ResumeOrigin.AutoStartup:
                    return NoticeText.FallbackAutoStartup;

                case ResumeOrigin.Reconcile:
                    return NoticeText.FallbackReconcile;

                case ResumeOrigin.Manual:
                    return NoticeText.FallbackManual;

                case ResumeOrigin.Restart:
                    return NoticeText.FallbackRestart;

                default:
                    return NoticeText.FallbackUnknown;
            }
        }
    }
}
