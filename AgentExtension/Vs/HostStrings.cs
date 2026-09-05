// 宿主侧（WPF）文案的中英切换

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace AgentExtension.Vs
{
    /// <summary>宿主侧文案。</summary>
    public static class HostStrings
    {
        #region 语言判定

        /// <summary>当前是否用中文。</summary>
        public static bool IsChinese()
        {
            return IsChinese(CultureInfo.CurrentUICulture);
        }

        /// <summary>指定文化是否算中文。</summary>
        public static bool IsChinese(CultureInfo culture)
        {
            if (culture == null)
            {
                return false;
            }

            return culture.TwoLetterISOLanguageName == "zh";
        }

        #endregion

        #region 文案

        /// <summary>
        /// 找不到 claude 可执行文件。
        ///
        /// 必须把找过的位置列出来：只说一句「请先安装」，在「明明早就装了」的机器上
        /// 是句废话——用户既不知道该去看哪儿，也不知道下一步能做什么。
        /// </summary>
        public static string ClaudeNotFound(IReadOnlyList<string> searchedLocations, string overrideVariable)
        {
            bool chinese = IsChinese();
            var text = new StringBuilder();

            text.AppendLine(chinese
                ? "未找到 claude 可执行文件。"
                : "Could not find the claude executable.");
            text.AppendLine();
            text.AppendLine(chinese
                ? "已找过下面这些位置，以及 PATH 上每个目录下的 claude.exe / claude.cmd / claude.bat："
                : "Searched these locations, plus claude.exe / claude.cmd / claude.bat in every directory on PATH:");

            if (searchedLocations != null)
            {
                foreach (string location in searchedLocations)
                {
                    text.AppendLine("    " + location);
                }
            }

            text.AppendLine();
            text.AppendLine(chinese
                ? "在命令行里执行 where claude 看它到底装在哪；"
                : "Run `where claude` in a terminal to see where it actually is;");
            text.AppendLine(chinese
                ? $"若不在上面这些位置，把环境变量 {overrideVariable} 设成它的完整路径，再重开 Visual Studio。"
                : $"if it is not listed above, set {overrideVariable} to its full path and restart Visual Studio.");

            return text.ToString().TrimEnd();
        }

        /// <summary>找不到前端产物（多半是没构建 AgentExtension.Web）。</summary>
        public static string WebRootMissing(string webRoot)
        {
            return IsChinese()
                ? $"未找到前端产物：{webRoot}"
                : $"Front-end build output not found: {webRoot}";
        }

        /// <summary>出站通道断了：消息再也发不进前端。</summary>
        public static string OutboundBroken(string reason)
        {
            return IsChinese()
                ? "与界面的连接已断开，请关闭工具窗口后重新打开。" + Environment.NewLine + $"原因：{reason}"
                : "The connection to the UI was lost. Close the tool window and open it again."
                    + Environment.NewLine + $"Reason: {reason}";
        }

        /// <summary>
        /// 面板正在重建 WebView。
        ///
        /// 必须说一句「对话不会丢」：用户刚拖完窗口就看见界面整个消失，第一反应是聊天记录没了、
        /// 不敢再动。重建期间只有这行字，不说清楚就等于让人干等一片空白。
        /// </summary>
        public static string WebViewRebuilding()
        {
            return IsChinese()
                ? "窗口位置变了，正在重建界面…对话内容不会丢失。"
                : "The window moved; rebuilding the view… your conversation is preserved.";
        }

        /// <summary>
        /// 某个 tab 第一次被激活，正在把它的界面立起来。
        ///
        /// 与「重建」不是一回事，不能复用 <see cref="WebViewRebuilding"/> 那句：
        /// 新 tab 的窗口位置没变、也没有「对话内容」可保，用重建的文案等于说了一句假话。
        /// </summary>
        public static string TabStarting()
        {
            return IsChinese()
                ? "正在启动这个会话…"
                : "Starting this session…";
        }

        /// <summary>WebView2 起不来。</summary>
        public static string WebViewInitFailed(string reason)
        {
            return IsChinese()
                ? $"WebView2 初始化失败：{reason}"
                : $"WebView2 failed to initialise: {reason}";
        }

        #endregion
    }
}
