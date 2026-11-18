using System;
using Microsoft.VisualStudio;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;

namespace AgentExtension.Vs
{
    /// <summary>盯着 VS 的活动文档，变了就报全路径。</summary>
    /// <remarks>
    /// 只看 SEID_DocumentFrame：焦点切到工具窗口时它不变，
    /// 所以点进聊天面板不会把活动文件清掉。
    /// </remarks>
    public sealed class ActiveDocumentWatcher : IVsSelectionEvents, IDisposable
    {
        #region 字段与构造

        /// <summary>选择监视服务。</summary>
        private readonly IVsMonitorSelection _monitor;

        /// <summary>订阅凭据，0 表示未订阅。</summary>
        private uint _cookie;

        /// <summary>当前活动文档全路径，没有为空串。</summary>
        public string Current { get; private set; } = string.Empty;

        /// <summary>活动文档变了，参数为全路径或空串。</summary>
        public event EventHandler<string>? Changed;

        /// <summary>订阅选择事件并读一次初值。</summary>
        public ActiveDocumentWatcher(IVsMonitorSelection monitor)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            _monitor = monitor ?? throw new ArgumentNullException(nameof(monitor));

            if (ErrorHandler.Succeeded(_monitor.GetCurrentElementValue(
                    (uint)VSConstants.VSSELELEMID.SEID_DocumentFrame, out object value)))
            {
                Current = PathOf(value);
            }

            ErrorHandler.ThrowOnFailure(_monitor.AdviseSelectionEvents(this, out _cookie));
        }

        #endregion

        #region 选择事件

        /// <summary>只认文档帧的变化。</summary>
        public int OnElementValueChanged(uint elementid, object varValueOld, object varValueNew)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            if (elementid != (uint)VSConstants.VSSELELEMID.SEID_DocumentFrame)
            {
                return VSConstants.S_OK;
            }

            string next = PathOf(varValueNew);

            if (!string.Equals(next, Current, StringComparison.OrdinalIgnoreCase))
            {
                Current = next;
                Changed?.Invoke(this, next);
            }

            return VSConstants.S_OK;
        }

        /// <summary>选择变化，不关心。</summary>
        public int OnSelectionChanged(IVsHierarchy pHierOld, uint itemidOld, IVsMultiItemSelect pMISOld,
            ISelectionContainer pSCOld, IVsHierarchy pHierNew, uint itemidNew, IVsMultiItemSelect pMISNew,
            ISelectionContainer pSCNew)
        {
            return VSConstants.S_OK;
        }

        /// <summary>UI 上下文变化，不关心。</summary>
        public int OnCmdUIContextChanged(uint dwCmdUICookie, int fActive)
        {
            return VSConstants.S_OK;
        }

        #endregion

        #region 辅助与释放

        /// <summary>从文档帧取规整后的全路径。</summary>
        private static string PathOf(object? frameValue)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            string result = string.Empty;

            // 帧为 null＝所有文档都关了
            if (!(frameValue is IVsWindowFrame frame))
            {
                return result;
            }

            if (ErrorHandler.Succeeded(frame.GetProperty((int)__VSFPROPID.VSFPROPID_pszMkDocument, out object moniker)))
            {
                result = ActiveFileRules.Normalize(moniker as string);
            }

            return result;
        }

        /// <summary>退订选择事件。</summary>
        public void Dispose()
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            if (_cookie == 0)
            {
                return;
            }

            _monitor.UnadviseSelectionEvents(_cookie);
            _cookie = 0;
            Changed = null;
        }

        #endregion
    }
}
