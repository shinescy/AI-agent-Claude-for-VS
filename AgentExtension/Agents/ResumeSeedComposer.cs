// 接回成功时预置进桥的那几条事件

using System;
using System.Collections.Generic;
using System.Text;

namespace AgentExtension.Agents
{
    /// <summary>
    /// 把一次历史回放折成「开场说明 + 历史 + 收尾说明」。
    ///
    /// 只要走到这里就意味着接回已经成立，所以**返回的序列永不为空**：
    /// 上次那条会话可能只发过 <c>/model</c> <c>/effort</c> 之类的命令，
    /// 回放读出来一条都没有——那时如果一个字都不说，
    /// 界面上「接回成功」和「压根没接回」就长得一模一样，用户没法区分。
    /// 这是 2026-08-28 实测踩到的：记录文件当天才第一次生成，
    /// 首次打开本来就无从接回，但界面同样是一片空白，无从判断是哪一种。
    /// </summary>
    public static class ResumeSeedComposer
    {
        #region 组装

        /// <summary>组装预置事件。<paramref name="replay"/> 为 null 按「没读出历史」处理。</summary>
        public static IReadOnlyList<AgentEvent> Compose(
            TranscriptReplayResult? replay, string sessionId)
        {
            IReadOnlyList<AgentEvent> historyEvents =
                replay?.Events ?? (IReadOnlyList<AgentEvent>)Array.Empty<AgentEvent>();

            Dictionary<string, string> idArg = NoticeText.Args("id", IdSuffix(sessionId));

            if (historyEvents.Count == 0)
            {
                var onlyNotice = new List<AgentEvent>(1)
                {
                    AgentEvent.Notice(NoticeText.ResumedNoHistory, idArg)
                };

                return onlyNotice;
            }

            bool truncated = replay != null && replay.Truncated;
            int unknownRecords = replay != null ? replay.UnknownRecords : 0;

            string opening = truncated
                ? NoticeText.ResumedWithHistoryTruncated
                : NoticeText.ResumedWithHistory;

            var events = new List<AgentEvent>(historyEvents.Count + 2);
            events.Add(AgentEvent.Notice(opening, idArg));
            events.AddRange(historyEvents);
            events.Add(TranscriptReplayReader.ClosingNotice(unknownRecords));

            return events;
        }

        #endregion

        #region 说明文案

        /// <summary>
        /// 占位 <c>{id}</c> 的取值，**连前导空格一起**给。
        ///
        /// id 缺失时给空串，句子就自然合上了。若把空格留在模板里，缺 id 那次会写成
        /// 「已接回上次会话 。」——为这一种情况另立一条模板，中英两边都得多维护一句。
        /// </summary>
        internal static string IdSuffix(string sessionId)
        {
            string shortId = ShortId(sessionId);

            if (shortId.Length == 0)
            {
                return string.Empty;
            }

            string suffix = " " + shortId;
            return suffix;
        }

        /// <summary>取前 8 位：够用来跟终端里的 <c>claude --resume</c> 对账，又不占满一行。</summary>
        internal static string ShortId(string sessionId)
        {
            string id = (sessionId ?? string.Empty).Trim();

            if (id.Length <= 8)
            {
                return id;
            }

            string shortId = id.Substring(0, 8);
            return shortId;
        }

        #endregion
    }
}
