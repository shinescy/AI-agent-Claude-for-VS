// tab 条的纯判定：命名、上限、关闭后激活谁、未读

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using AgentExtension.Agents;

namespace AgentExtension.ToolWindows
{
    /// <summary>
    /// tab 条的判定逻辑。按本项目惯例（<see cref="PanelKeyPolicy"/> /
    /// <see cref="WebViewRebuildPolicy"/> / <see cref="ResumeFallbackPolicy"/>），
    /// 不依赖 VS SDK，链进 <c>AgentExtension.Tests</c> 单测。
    /// </summary>
    public static class ChatTabPolicy
    {
        #region 常量

        /// <summary>同时开着的 tab 上限。每个 tab 一个渲染进程，无限开等于让 VS 陪葬。</summary>
        public const int MaxTabs = 8;

        /// <summary>默认标题的前缀。</summary>
        private const string TitlePrefix = "会话 ";

        private static readonly Regex DefaultTitle = new Regex(
            @"^会话\s*(?<n>\d+)$", RegexOptions.Compiled);

        #endregion

        #region 上限

        public static bool CanCreate(int currentCount)
        {
            bool can = currentCount < MaxTabs;
            return can;
        }

        /// <summary>到上限时说给用户听的话。**不能静默忽略**——用户是点了 + 才走到这里的。</summary>
        public static string LimitNotice()
        {
            string notice = NoticeText.Fill(NoticeText.TabLimit, LimitArgs());
            return notice;
        }

        /// <summary>上限提示的占位取值。</summary>
        public static Dictionary<string, string> LimitArgs()
        {
            var args = NoticeText.Args("max", MaxTabs.ToString(CultureInfo.InvariantCulture));
            return args;
        }

        #endregion

        #region 兜底目录重来

        /// <summary>
        /// 按兜底目录恢复出来的 tab 条，能不能推倒重来（真目录到手时）。
        ///
        /// 只有「一个还没有会话的 tab」才安全：它身上没有任何用户看得见的东西，换掉不丢上下文。
        /// 已经拿到会话 id、或已经开出第二个 tab，都说明这条 tab 条有人用过了，
        /// 这时重来会把正在跑的会话从界面上抹掉。
        /// </summary>
        public static bool CanReRestore(bool provisional, int tabCount, string activeSessionId)
        {
            bool can = provisional
                && tabCount == 1
                && (activeSessionId ?? string.Empty).Trim().Length == 0;

            return can;
        }

        #endregion

        #region 命名

        /// <summary>取一个不重名的默认标题。中间空出来的号会被补上，不会一路涨。</summary>
        public static string NextTitle(IReadOnlyList<string> existingTitles)
        {
            var used = new HashSet<int>();

            if (existingTitles != null)
            {
                foreach (string title in existingTitles)
                {
                    Match match = DefaultTitle.Match((title ?? string.Empty).Trim());

                    if (!match.Success)
                    {
                        continue;
                    }

                    int parsed;

                    if (int.TryParse(match.Groups["n"].Value, out parsed))
                    {
                        used.Add(parsed);
                    }
                }
            }

            int candidate = 1;

            while (used.Contains(candidate))
            {
                candidate++;
            }

            string next = TitlePrefix + candidate.ToString(CultureInfo.InvariantCulture);
            return next;
        }

        #endregion

        #region 关闭后激活谁

        /// <summary>
        /// 关掉 <paramref name="closingId"/> 之后该激活谁。
        ///
        /// 返回空串表示**一个都不剩**，调用方必须立刻补一个新 tab：
        /// tab 条是画在网页里的，零 tab 就是零 WebView，那时界面变成一块灰板，
        /// 再也点不出新 tab。这是硬约束，不是体验优化。
        /// </summary>
        public static string NextActiveAfterClose(
            IReadOnlyList<string> orderedIds, string activeId, string closingId)
        {
            if (orderedIds == null || orderedIds.Count == 0)
            {
                return string.Empty;
            }

            int index = -1;

            for (int i = 0; i < orderedIds.Count; i++)
            {
                if (string.Equals(orderedIds[i], closingId, StringComparison.Ordinal))
                {
                    index = i;
                    break;
                }
            }

            if (index < 0)
            {
                // 要关的根本不在列表里，什么都不用变。
                return activeId ?? string.Empty;
            }

            if (!string.Equals(activeId, closingId, StringComparison.Ordinal))
            {
                // 关的是别人，界面不该跳走。
                return activeId ?? string.Empty;
            }

            if (index + 1 < orderedIds.Count)
            {
                return orderedIds[index + 1];
            }

            if (index - 1 >= 0)
            {
                return orderedIds[index - 1];
            }

            return string.Empty;
        }

        #endregion

        #region 未读

        /// <summary>
        /// 这条事件要不要把该 tab 标成未读。
        ///
        /// 判定必须在宿主：后台 tab 的前端虽然活着，但它不知道自己有没有被看着——
        /// 可见性是宿主侧的 <c>Visibility</c>，网页里读不到。
        /// </summary>
        public static bool ShouldMarkUnread(bool isActiveTab, AgentEventKind kind)
        {
            if (isActiveTab)
            {
                return false;
            }

            switch (kind)
            {
                case AgentEventKind.AssistantText:
                case AgentEventKind.Thinking:
                case AgentEventKind.ToolCallStarted:
                case AgentEventKind.ToolCallCompleted:
                case AgentEventKind.InteractionRequested:
                case AgentEventKind.Failed:
                case AgentEventKind.Notice:
                    return true;

                default:
                    // SessionStarted / UsageUpdated / RateLimitUpdated / TurnCompleted /
                    // HookProgress / UserPrompt / Raw 都是簿记，每轮都刷；
                    // 算未读的话所有后台 tab 会永远亮着，这个标记立刻失去意义。
                    return false;
            }
        }

        #endregion

        #region 变了才推

        /// <summary>
        /// 整条 tab 条的内容签名，用来判断「这次要不要真的推给前端」。
        /// 会话事件每轮来几十条，每条都推等于让 N 个前端一直重渲染。
        /// </summary>
        public static string Signature(ChatTabListPayload payload)
        {
            if (payload == null)
            {
                return string.Empty;
            }

            var builder = new StringBuilder();
            builder.Append(payload.ActiveId ?? string.Empty).Append('|');

            if (payload.Tabs != null)
            {
                foreach (ChatTabSnapshot tab in payload.Tabs)
                {
                    builder.Append(tab.Id).Append(':')
                        .Append(tab.Title).Append(':')
                        .Append(tab.Busy ? '1' : '0')
                        .Append(tab.Unread ? '1' : '0')
                        .Append(tab.Failed ? '1' : '0')
                        .Append(';');
                }
            }

            string signature = builder.ToString();
            return signature;
        }

        #endregion
    }
}
