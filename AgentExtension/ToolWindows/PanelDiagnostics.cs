// 面板去哪了——可开关的 WebView 生命周期诊断

using System;
using System.Globalization;
using System.IO;
using System.Text;

namespace AgentExtension.ToolWindows
{
    /// <summary>
    /// 把面板与 WebView 的生死记到文件，用来回答「面板怎么就空了」。
    ///
    /// 为什么非有不可：WebView2 的控制器随浮动窗口一起被关掉这条路上**不抛异常、不触发任何失败事件**，
    /// 从外面看只是「一片空白」。没有这条日志，每查一轮都要重新构建、重装、复现一次。
    /// 用 <c>AGENTEXT_PANELLOG</c> 打开（<c>1</c> = 写进临时目录，或直接给一个完整路径）。
    /// </summary>
    internal static class PanelDiagnostics
    {
        #region 字段

        private const string EnvironmentVariable = "AGENTEXT_PANELLOG";

        private static readonly object Gate = new object();

        private static string _path = string.Empty;

        private static bool _resolved;

        #endregion

        #region 开关

        /// <summary>诊断是否开着。</summary>
        public static bool Enabled
        {
            get
            {
                Resolve();
                return _path.Length > 0;
            }
        }

        private static void Resolve()
        {
            if (_resolved)
            {
                return;
            }

            _resolved = true;

            string setting = (Environment.GetEnvironmentVariable(EnvironmentVariable) ?? string.Empty).Trim();

            if (setting.Length == 0 || setting == "0")
            {
                return;
            }

            _path = setting == "1"
                ? Path.Combine(Path.GetTempPath(), "agentext-panel.log")
                : setting;
        }

        #endregion

        #region 记录

        /// <summary>写一行。</summary>
        public static void Log(string line)
        {
            if (!Enabled)
            {
                return;
            }

            try
            {
                string stamped = string.Format(
                    CultureInfo.InvariantCulture,
                    "{0:HH:mm:ss.fff} {1}{2}",
                    DateTime.Now,
                    line,
                    Environment.NewLine);

                lock (Gate)
                {
                    File.AppendAllText(_path, stamped, Encoding.UTF8);
                }
            }
            catch (IOException)
            {
            }
            catch (UnauthorizedAccessException)
            {
            }
        }

        #endregion
    }
}
