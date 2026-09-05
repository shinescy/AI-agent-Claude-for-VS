// 扩展自己发给 CLI 的探测命令，用户没敲过

using System;
using System.Collections.Generic;

namespace AgentExtension.Agents
{
    /// <summary>
    /// 面板背着用户发出去的那几条斜杠命令：起会话时探模型/强度/额度，之后还会定时刷额度。
    ///
    /// 它们的**输出**早就不进转录了（见 <see cref="ClaudeStreamJsonSession"/> 的探测通道），
    /// 但 CLI 自己的 .jsonl 照记不误，接回时按命令记录回放出来，
    /// 面板里就会出现一长串用户从没敲过的 <c>/usage</c>。
    /// 2026-08-28 实测一条只跑过启动探测的会话，回放出来 39 条全是这个；
    /// 更糟的是它们照样占尾部读取的条数上限，会把真正说过的话挤出回放窗口。
    ///
    /// 所以新增探测必须加进 <see cref="All"/>，否则噪音会无声地回到回放里。
    /// </summary>
    public static class AgentProbeCommands
    {
        #region 清单

        /// <summary>刷额度用的那条。</summary>
        public const string Usage = "/usage";

        /// <summary>
        /// 起会话时按顺序**发进会话**的探测。发送方直接遍历它。
        ///
        /// <see cref="Usage"/> 不在其中：额度是账号级的，改走 <see cref="UsageProbeProcess"/>
        /// 那个独立短进程，一条都不写进用户会话。
        /// </summary>
        public static readonly IReadOnlyList<string> Startup = new[]
        {
            "/model",
            "/effort"
        };

        /// <summary>
        /// 回放要滤掉的探测。**由 <see cref="Startup"/> 推导**，两份清单不可能走散——
        /// 发得出去却滤不掉，表现就是噪音无声地回到回放里。
        ///
        /// 额外含 <see cref="Usage"/>：它已不再发进会话，但老转录里还躺着两千多条。
        /// </summary>
        public static readonly IReadOnlyList<string> All =
            new List<string>(Startup) { Usage }.AsReadOnly();

        #endregion

        #region 判定

        /// <summary>是不是探测命令。带不带前导斜杠都认，大小写不敏感。</summary>
        public static bool IsProbe(string? commandName)
        {
            string name = Normalize(commandName);

            if (name.Length == 0)
            {
                return false;
            }

            foreach (string probe in All)
            {
                if (string.Equals(Normalize(probe), name, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }

        private static string Normalize(string? commandName)
        {
            string name = (commandName ?? string.Empty).Trim();
            string normalized = name.TrimStart('/');
            return normalized;
        }

        #endregion
    }
}
