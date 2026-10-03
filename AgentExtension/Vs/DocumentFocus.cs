// 把焦点交回文档窗口——工具窗里 Esc 本来的行为

using System;
using EnvDTE;
using Microsoft.VisualStudio.Shell;

namespace AgentExtension.Vs
{
    /// <summary>焦点相关的 VS 动作。</summary>
    public static class DocumentFocus
    {
        #region 激活

        /// <summary>把焦点交回当前活动的文档窗口。</summary>
        public static void ActivateActiveDocument()
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            try
            {
                var dte = Package.GetGlobalService(typeof(DTE)) as DTE;
                dte?.ActiveDocument?.Activate();
            }
            catch (Exception)
            {
                // 活动文档正在关闭等情况下 DTE 会抛 COM 异常。
            }
        }

        #endregion
    }
}
