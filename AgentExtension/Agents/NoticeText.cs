// 系统提示的中文模板：模板本身就是前端 i18n 表的键

using System;
using System.Collections.Generic;
using System.Text;

namespace AgentExtension.Agents
{
    /// <summary>
    /// 系统提示的中文模板与占位取值。
    ///
    /// 宿主只发中文模板 + 取值，英文由前端按当前语言查表——语言是面板上的开关，
    /// 宿主在预置接回提示那一刻还不知道用户选的是哪一种。
    /// 模板与 i18n 表对不上时英文界面静默退回中文，因此由契约测试逐条比对。
    /// </summary>
    public static class NoticeText
    {
        #region 会话与接回

        /// <summary>接回成功，且有历史可回放。</summary>
        public const string ResumedWithHistory = "已接回上次会话{id}。以下是上次会话的本地回放。";

        /// <summary>接回成功，历史太长只回放了一段。</summary>
        public const string ResumedWithHistoryTruncated =
            "已接回上次会话{id}。以下是上次会话的本地回放。上次的记录较长，只回放最近的一段。";

        /// <summary>接回成功，但本地一条历史都没读出来。</summary>
        public const string ResumedNoHistory =
            "已接回上次会话{id}，但本地没读到可回放的历史（上次可能只发过命令）。"
            + "上下文在 CLI 那边，接着聊就是；下面从这一刻开始记录。";

        /// <summary>回放结束。</summary>
        public const string ReplayClosing =
            "以上是上次会话的本地回放（工具结果已截断，用量与耗时不回放）。下面是这一次。";

        /// <summary>回放结束，还有认不出的记录没画。</summary>
        public const string ReplayClosingWithUnknown =
            "以上是上次会话的本地回放（工具结果已截断，用量与耗时不回放）。下面是这一次。"
            + "另有 {n} 条记录未回放。";

        /// <summary>接回成立但转录读不出来。</summary>
        public const string ReplayUnreadable =
            "上次会话的上下文已接回，但历史消息没读出来（{reason}）。下面从这一刻重新记录。";

        /// <summary>记录里有 id，本地却已经找不到那份转录。</summary>
        public const string ResumeTranscriptGone =
            "上次这个 tab 里那条会话（{id}）已经找不到本地记录，可能被清理或过了保留期。"
            + "已为这个 tab 开一条新的空会话，之前的上下文接不回来了。";

        /// <summary>手动接回。</summary>
        public const string SessionResumed =
            "已接回会话 {id}。上下文已交给 CLI，但历史消息不会回填到这里——"
            + "CLI 在本管线下只喂上下文、不回放消息，因此下面从这一刻重新开始记录。";

        /// <summary>手动开分支接回。</summary>
        public const string SessionForked =
            "已按分支接回会话 {id}。上下文已交给 CLI，但历史消息不会回填到这里——"
            + "CLI 在本管线下只喂上下文、不回放消息，因此下面从这一刻重新开始记录。";

        /// <summary>要接的会话已经开在别的 tab 里。</summary>
        public const string SessionAlreadyOpen = "这条会话已经开在「{title}」里，已切过去。";

        /// <summary>丢掉上下文重开一条。</summary>
        public const string NewSession = "已开一条新会话，上下文清空。";

        /// <summary>前端送来的会话 id 形状不对。</summary>
        public const string ResumeIdMalformed = "接回会话失败：会话 id 形状不对。";

        /// <summary>前端点的会话不在最近一次列出的那批里。</summary>
        public const string ResumeNotListed =
            "接回会话失败：这个会话不在最近一次列出的会话里，请重新打开会话历史面板。";

        #endregion

        #region 接回失败后的自愈

        /// <summary>开机自动接回起不来。</summary>
        public const string FallbackAutoStartup =
            "上次那条会话 CLI 已经不认了，已改开新会话。上面那些记录只是本地转录的回放，它现在并不记得。";

        /// <summary>切解决方案后按新目录接回起不来。</summary>
        public const string FallbackReconcile =
            "解决方案切换后按新目录接回的那条会话 CLI 已经不认了，已改开新会话。上下文没有保留。";

        /// <summary>手动点的那条接不回来。</summary>
        public const string FallbackManual = "你点的那条会话 CLI 已经不认了，已改开新会话。上下文没有保留。";

        /// <summary>重启时想保留的上下文没接住。</summary>
        public const string FallbackRestart =
            "重启后想保留的上下文 CLI 已经不认了，已改开新会话。上面的对话记录还留着，但 CLI 已经不再记得它们。";

        /// <summary>兜底：说不清是哪条路进来的。</summary>
        public const string FallbackUnknown = "已改开新会话。";

        #endregion

        #region 工作目录与 tab 条

        /// <summary>解决方案没加载完就开了面板，只能用兜底目录。</summary>
        public const string WorkspaceFallback =
            "未能识别当前解决方案目录，代理将工作在：{path}。"
            + "若这不是你要的目录，请打开解决方案后重新打开本面板。";

        /// <summary>面板开着的时候解决方案换了。</summary>
        public const string WorkspaceChanged =
            "解决方案在打开面板期间变了（{from} → {to}），上次那条会话不属于当前目录，已按当前目录重新判定。";

        /// <summary>兜底目录与真目录对不上，这一轮不落盘。</summary>
        public const string PersistDisabled =
            "本次打开期间的 tab 条不会被记住：面板启动时解决方案还没加载完，"
            + "恢复用的是临时目录（{restored}），与当前目录（{current}）对不上，"
            + "继续写会覆盖掉你为这个解决方案存的 tab 条。关掉本面板再打开一次即可恢复正常。";

        /// <summary>恢复 tab 条时丢了几个。</summary>
        public const string TabsDropped =
            "恢复上次的 tab 条时丢弃了 {n} 个：超过同时打开上限（{max} 个），"
            + "或与另一个 tab 记录了同一条会话。记录文件可能被手改过，或在多台机器间同步过。";

        /// <summary>同时开的 tab 到上限了。</summary>
        public const string TabLimit = "最多同时开 {max} 个会话 tab。先关掉一个再开新的。";

        #endregion

        #region 切档与探测

        /// <summary>切权限模式重启，上下文接住了。</summary>
        public const string PermissionRestartKept = "权限模式已切换为 {mode}，已保留上下文。";

        /// <summary>切权限模式重启，上下文没接住。</summary>
        public const string PermissionRestartFresh =
            "权限模式已切换为 {mode}，新会话——上面那些记录 CLI 已经不认了，它不记得其中任何一句。";

        /// <summary>启动探测有一轮没回来。</summary>
        public const string ProbeNoAnswer =
            "启动探测有一轮没有回应，已不再抑制输出。状态栏里的模型与强度可能不全。";

        #endregion

        #region 权限模式的说法

        /// <summary><c>acceptEdits</c> 的说法。</summary>
        public const string ModeAcceptEdits = "接受编辑（acceptEdits）";

        /// <summary><c>auto</c> 的说法。</summary>
        public const string ModeAuto = "自动（auto）";

        /// <summary><c>bypassPermissions</c> 的说法。</summary>
        public const string ModeBypassPermissions = "绕过权限（bypassPermissions）";

        /// <summary><c>manual</c> 的说法。</summary>
        public const string ModeManual = "手动（manual）";

        /// <summary><c>dontAsk</c> 的说法。</summary>
        public const string ModeDontAsk = "不询问（dontAsk）";

        /// <summary><c>plan</c> 的说法。</summary>
        public const string ModePlan = "计划模式（plan）";

        /// <summary>危险模式的说法。</summary>
        public const string ModeDangerously = "危险模式（--dangerously-skip-permissions）";

        #endregion

        #region 文件与导出

        /// <summary>代理给的路径在工作目录下找不到。</summary>
        public const string OpenFileMissing = "打不开 {path}：在工作目录下找不到这个文件。";

        /// <summary>转录导出成功。</summary>
        public const string ExportDone = "转录已导出到 {path}";

        /// <summary>转录导出失败。</summary>
        public const string ExportFailed = "导出失败：{reason}";

        /// <summary>前端没给要还原的条目。</summary>
        public const string RestoreNoId = "还原失败：没有指定要还原的条目。";

        /// <summary>要还原的那一版不在最近一次列出的快照里。</summary>
        public const string RestoreNotListed =
            "还原失败：这一版不在最近一次列出的快照里，请重新打开文件回滚面板。";

        /// <summary>快照已经被 CLI 清掉了。</summary>
        public const string RestoreGone = "还原失败：这一版已经查不到了（快照可能已被 CLI 清理）。";

        /// <summary>还原成功，覆盖前的内容另存了一份。</summary>
        public const string RestoreDoneSaved =
            "已把 {path} 还原到第 {version} 版（{backup}）；覆盖前的内容已另存到 {saved}。";

        /// <summary>还原成功，该文件此前不存在。</summary>
        public const string RestoreDoneNew =
            "已把 {path} 还原到第 {version} 版（{backup}）；该文件此前不存在，因此没有需要另存的内容。";

        /// <summary>还原失败。</summary>
        public const string RestoreFailed = "还原失败：{reason}";

        /// <summary>处理前端消息时抛了异常。</summary>
        public const string BridgeMessageFailed = "处理前端消息时出错：{reason}";

        #endregion

        #region 填充

        /// <summary>把模板里的 <c>{name}</c> 换成取值；没给的占位原样留着，不吞成空白。</summary>
        public static string Fill(string template, IReadOnlyDictionary<string, string>? args)
        {
            string text = template ?? string.Empty;

            if (args == null || args.Count == 0)
            {
                return text;
            }

            var builder = new StringBuilder(text);

            foreach (KeyValuePair<string, string> pair in args)
            {
                builder.Replace("{" + pair.Key + "}", pair.Value ?? string.Empty);
            }

            string filled = builder.ToString();
            return filled;
        }

        /// <summary>拼一份占位取值表：参数按「键, 值, 键, 值」交替给。</summary>
        public static Dictionary<string, string> Args(params string[] pairs)
        {
            if (pairs == null)
            {
                return new Dictionary<string, string>(StringComparer.Ordinal);
            }

            if (pairs.Length % 2 != 0)
            {
                throw new ArgumentException("键值必须成对。", nameof(pairs));
            }

            var args = new Dictionary<string, string>(pairs.Length / 2, StringComparer.Ordinal);

            for (int i = 0; i < pairs.Length; i += 2)
            {
                args[pairs[i]] = pairs[i + 1] ?? string.Empty;
            }

            return args;
        }

        #endregion
    }
}
