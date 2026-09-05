// 在编辑器中打开文件并定位到行

using System;
using EnvDTE;
using Microsoft.VisualStudio.Shell;

namespace AgentExtension.Vs
{
    /// <summary>在 Visual Studio 中打开文件。</summary>
    public static class FileOpener
    {
        #region 打开

        /// <summary>打开文件并把光标移到指定行。</summary>
        public static void Open(string absolutePath, int line)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            if (string.IsNullOrWhiteSpace(absolutePath))
            {
                return;
            }

            try
            {
                var dte = Package.GetGlobalService(typeof(DTE)) as DTE;

                if (dte == null)
                {
                    return;
                }

                Window window = dte.ItemOperations.OpenFile(absolutePath, Constants.vsViewKindCode);
                window?.Activate();

                if (line < 1)
                {
                    return;
                }

                if (dte.ActiveDocument?.Selection is TextSelection selection)
                {
                    selection.GotoLine(line, false);
                }
            }
            catch (Exception)
            {
                // 文件被独占、类型没有代码视图等情况都会抛 COM 异常。
            }
        }

        #endregion
    }
}
