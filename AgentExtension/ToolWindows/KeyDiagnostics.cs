// 按键去哪了——可开关的按键路由诊断

using System;
using System.Globalization;
using System.IO;
using System.Text;
using System.Windows;
using System.Windows.Input;

namespace AgentExtension.ToolWindows
{
    /// <summary>把按键在 VS 里的走向记到文件，用来回答「这个键到底是谁吃掉的」。</summary>
    internal static class KeyDiagnostics
    {
        #region 字段

        private const string EnvironmentVariable = "AGENTEXT_KEYLOG";

        private static readonly object Gate = new object();

        private static string _path = string.Empty;
        private static bool _installed;

        #endregion

        #region 开关

        /// <summary>诊断是否开着。</summary>
        public static bool Enabled
        {
            get
            {
                return _path.Length > 0;
            }
        }

        /// <summary>按环境变量决定是否安装。</summary>
        public static void Install()
        {
            if (_installed)
            {
                return;
            }

            _installed = true;

            string setting = (Environment.GetEnvironmentVariable(EnvironmentVariable) ?? string.Empty).Trim();

            if (setting.Length == 0 || setting == "0")
            {
                return;
            }

            _path = setting == "1"
                ? Path.Combine(Path.GetTempPath(), "agentext-keys.log")
                : setting;

            EventManager.RegisterClassHandler(
                typeof(UIElement), Keyboard.PreviewKeyDownEvent, new KeyEventHandler(OnPreviewKeyDown), true);
            EventManager.RegisterClassHandler(
                typeof(UIElement), Keyboard.KeyDownEvent, new KeyEventHandler(OnKeyDown), true);

            Log("=== 按键诊断已开启 ===");
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
        }

        private static void OnPreviewKeyDown(object sender, KeyEventArgs e)
        {
            Log($"WPF Preview {e.Key} handled={e.Handled} 元素={Describe(sender)}");
        }

        private static void OnKeyDown(object sender, KeyEventArgs e)
        {
            Log($"WPF KeyDown {e.Key} handled={e.Handled} 元素={Describe(sender)}");
        }

        private static string Describe(object sender)
        {
            if (sender == null)
            {
                return "(null)";
            }

            var element = sender as FrameworkElement;
            string name = element == null || string.IsNullOrEmpty(element.Name) ? string.Empty : $"#{element.Name}";
            return sender.GetType().FullName + name;
        }

        #endregion
    }
}
