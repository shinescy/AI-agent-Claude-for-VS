// 一个 tab：一块 WebView、一条桥、一条 CLI 会话

using System;
using System.Collections.Generic;
using AgentExtension.Agents;
using AgentExtension.Bridge;
using Microsoft.Web.WebView2.Wpf;

namespace AgentExtension.ToolWindows
{
    /// <summary>
    /// 一个 tab 的全部运行时状态。
    ///
    /// 这些字段原来是 <see cref="AgentChatControl"/> 上的一组单数字段，
    /// 「一块 WebView ↔ 一条桥 ↔ 一条会话」的 1:1 关系原封不动，只是搬进来按 tab 各存一份。
    ///
    /// <see cref="Id"/> 与 <see cref="SessionId"/> **必须分开**：tab 是界面上的槽位，
    /// 会话 id 由 CLI 说了算。懒启动的 tab 还没有会话进程；开新会话会让同一个 tab 换会话 id；
    /// 接回一条历史会话同样是换 id 不换 tab。混用会导致「tab 还在但认不出来了」。
    /// </summary>
    internal sealed class AgentChatTab
    {
        public AgentChatTab(string id, string title)
        {
            Id = id ?? string.Empty;
            Title = title ?? string.Empty;
        }

        #region 身份

        /// <summary>tab 自己的 id，进程内唯一，重启后重新生成。</summary>
        public string Id { get; }

        public string Title { get; set; } = string.Empty;

        /// <summary>这个 tab 当前那条会话的 id。懒启动的 tab 只有它，没有下面那些运行时对象。</summary>
        public string SessionId { get; set; } = string.Empty;

        #endregion

        #region 运行时

        /// <summary>未激活过时为 null——懒启动的 tab 连 WebView 都还没建，成本是零。</summary>
        public WebView2? WebView { get; set; }

        public WebViewBridge? Bridge { get; set; }

        public ClaudeStreamJsonSession? Session { get; set; }

        /// <summary>每个 tab 各有一份重建预算。共用一份的话，一个 tab 拖坏了会把别人的预算也吃掉。</summary>
        public WebViewRebuildPolicy RebuildPolicy { get; } = new WebViewRebuildPolicy();

        /// <summary>这块 WebView 至少成功初始化过一次。见 <c>IsWebViewAlive</c> 里为什么这个判断必须在 null 检查之前。</summary>
        public bool WebViewReady { get; set; }

        /// <summary>
        /// 这个 tab 当前该显示的状态文字。空串表示没有状态、该显示 WebView 本身。
        ///
        /// 界面上只有一份 <c>StatusText</c>，后台 tab 的状态不能因为没显示就被 <c>ShowStatus</c>
        /// 直接扔掉——那样用户切过去看到的是上一条属于别的 tab 的旧文字，或者什么都没有。
        /// 记在这里，切换激活时由 <c>ApplyTabVisibility</c> 按当前激活的 tab 回填。
        /// </summary>
        public string StatusMessage { get; set; } = string.Empty;

        public bool ClientReady { get; set; }

        public bool AgentStarted { get; set; }

        public ResumeOrigin ResumeOrigin { get; set; } = ResumeOrigin.None;

        /// <summary>已经为它自动切走过一次。</summary>
        /// <remarks>防连锁推导见 docs/memory/multi-session-tabs.md。</remarks>
        public bool AutoSwitchedAway { get; set; }

        public List<(string Kind, string Text)> PendingContext { get; } =
            new List<(string Kind, string Text)>();

        #endregion

        #region 启动参数（按 tab 分片）

        public string PermissionMode { get; set; } = "acceptEdits";

        public string Model { get; set; } = string.Empty;

        public string Effort { get; set; } = string.Empty;

        #endregion

        #region 界面标记

        public bool Busy { get; set; }

        public bool Unread { get; set; }

        /// <summary>这个 tab 崩了（会话起不来 / 运行中失败）。跟 <see cref="Unread"/> 是两码事：
        /// 未读只是「有新东西没看」，崩了是「过去看也可能白搭，得先弄明白怎么回事」。</summary>
        public bool Failed { get; set; }

        public ChatTabSnapshot ToSnapshot()
        {
            var snapshot = new ChatTabSnapshot
            {
                Id = Id,
                Title = Title,
                Busy = Busy,
                Unread = Unread,
                Failed = Failed
            };

            return snapshot;
        }

        #endregion
    }
}
