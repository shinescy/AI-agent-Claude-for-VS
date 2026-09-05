// 读取当前代码编辑器里的选中内容

using System;
using EnvDTE;
using Microsoft.VisualStudio.Shell;

namespace AgentExtension.Vs
{
    /// <summary>当前编辑器选区。</summary>
    public class EditorSelection
    {
        public string FilePath { get; set; } = string.Empty;

        public int StartLine { get; set; }

        public int EndLine { get; set; }

        public string Text { get; set; } = string.Empty;

        public bool HasSelection
        {
            get
            {
                bool has = !string.IsNullOrWhiteSpace(Text);
                return has;
            }
        }
    }

    /// <summary>从活动文档读取选区。</summary>
    public static class EditorSelectionReader
    {
        #region 读取

        /// <summary>读取当前活动文档的选区。</summary>
        public static EditorSelection Read()
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            var empty = new EditorSelection();

            try
            {
                var dte = Package.GetGlobalService(typeof(DTE)) as DTE;

                Document? document = dte?.ActiveDocument;

                if (document == null)
                {
                    return empty;
                }

                if (!(document.Selection is TextSelection selection))
                {
                    return empty;
                }

                string text = selection.Text ?? string.Empty;

                if (string.IsNullOrWhiteSpace(text))
                {
                    return empty;
                }

                var result = new EditorSelection
                {
                    FilePath = document.FullName ?? string.Empty,
                    StartLine = selection.TopPoint.Line,
                    EndLine = selection.BottomPoint.Line,
                    Text = text
                };

                return result;
            }
            catch (Exception)
            {
                // 活动文档在读取途中被关闭等情况下 DTE 会抛 COM 异常
                return empty;
            }
        }

        #endregion
    }
}
