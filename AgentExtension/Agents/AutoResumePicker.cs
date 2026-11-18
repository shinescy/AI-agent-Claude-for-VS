// 记录里那条接不回来时，替 tab 挑一条可接的会话

using System;
using System.Collections.Generic;

namespace AgentExtension.Agents
{
    /// <summary>从本目录历史会话里挑最近一条有真对话、且没人占着的。</summary>
    public static class AutoResumePicker
    {
        #region 挑选

        /// <summary>
        /// <paramref name="entries"/> 须按最后活动时间倒序；挑不到返回空串。
        /// </summary>
        /// <remarks>占着的会话不能接：两个进程 --resume 同一份转录会互相覆盖。</remarks>
        public static string PickLatest(IEnumerable<SessionHistoryEntry> entries, ICollection<string> excluded)
        {
            foreach (SessionHistoryEntry entry in entries ?? Array.Empty<SessionHistoryEntry>())
            {
                if (entry == null || entry.ProbeOnly || string.IsNullOrEmpty(entry.SessionId))
                {
                    continue;
                }

                if (excluded != null && Contains(excluded, entry.SessionId))
                {
                    continue;
                }

                string picked = entry.SessionId;
                return picked;
            }

            return string.Empty;
        }

        #endregion

        #region 内部

        /// <summary>不分大小写地查 id。</summary>
        private static bool Contains(ICollection<string> set, string id)
        {
            foreach (string item in set)
            {
                if (string.Equals(item, id, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }

        #endregion
    }
}
