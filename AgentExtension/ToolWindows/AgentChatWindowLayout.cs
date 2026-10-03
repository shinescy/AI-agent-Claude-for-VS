// 聊天面板的初始停靠位置与宽度

using System;
using Microsoft.VisualStudio;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;
using Microsoft.Win32;

namespace AgentExtension.ToolWindows
{
    /// <summary>
    /// 把聊天面板停到主窗口右侧，并给一个够用的宽度。
    ///
    /// 只在「布局版本变了」的那一次摆位：VS 会把工具窗口的停靠位置与尺寸记进用户配置，
    /// 每次启动都强行摆一遍，等于把用户自己拖出来的尺寸每天抹掉一次。
    /// 需要让所有人重新摆一次时，把 <see cref="LayoutVersion"/> 加一即可。
    /// </summary>
    internal static class AgentChatWindowLayout
    {
        /// <summary>布局版本。加一 → 下次启动重摆一次（会覆盖用户手动调过的位置与尺寸）。</summary>
        private const int LayoutVersion = 1;

        private const string RegistrySubKey = "AgentExtension";

        private const string AppliedLayoutVersionValue = "AppliedLayoutVersion";

        /// <summary>面板宽度取主窗口宽度的这个比例。用比例而不是固定像素，是为了在高 DPI / 超宽屏上也合适。</summary>
        private const double WidthRatio = 0.32;

        /// <summary>宽度下限（96 DPI 下的逻辑像素）。VS 默认停靠宽度约 300，这里给到它的 2.5 倍以上。</summary>
        private const int MinLogicalWidth = 780;

        /// <summary>宽度上限占主窗口的比例，免得在窄屏上把编辑器挤没。</summary>
        private const double MaxWidthRatio = 0.55;

        /// <summary>没拿到主窗口尺寸时的兜底宽度（设备像素）。</summary>
        private const int FallbackWidth = 780;

        #region 对外

        /// <summary>按需摆一次窗口。已经摆过当前布局版本就什么都不做。</summary>
        internal static void EnsureInitialLayout(Package package, IVsUIShell? shell, IVsWindowFrame frame)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            if (frame == null)
            {
                return;
            }

            if (GetAppliedVersion(package) >= LayoutVersion)
            {
                return;
            }

            if (!Apply(shell, frame))
            {
                return;
            }

            SetAppliedVersion(package, LayoutVersion);
        }

        #endregion

        #region 摆位

        /// <summary>停到右侧并设定宽度。返回是否摆成功——没成功就不记版本号，下次启动再试。</summary>
        private static bool Apply(IVsUIShell? shell, IVsWindowFrame frame)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            int width;
            int height;
            GetTargetSize(shell, out width, out height);

            // 停靠目标传 Guid.Empty = 停到主窗口的右边缘、自成一组，
            // 而不是并进别的工具窗口的标签组——并进去就会跟着那一组跑到左边、且宽度归它管。
            Guid dockTarget = Guid.Empty;

            int hr = frame.SetFramePos(VSSETFRAMEPOS.SFP_fDockRight, ref dockTarget, 0, 0, width, height);
            return ErrorHandler.Succeeded(hr);
        }

        /// <summary>按主窗口尺寸算出面板该多宽。拿不到主窗口就用兜底值。</summary>
        private static void GetTargetSize(IVsUIShell? shell, out int width, out int height)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            width = FallbackWidth;
            height = 0;

            IntPtr main = GetMainWindow(shell);

            if (main == IntPtr.Zero)
            {
                return;
            }

            NativeMethods.Rect bounds;

            if (!NativeMethods.GetWindowRect(main, out bounds))
            {
                return;
            }

            int mainWidth = bounds.Right - bounds.Left;
            int mainHeight = bounds.Bottom - bounds.Top;

            if (mainWidth <= 0)
            {
                return;
            }

            height = mainHeight > 0 ? mainHeight : 0;

            // 下限要跟着 DPI 放大：SetFramePos 收的是设备像素，150% 缩放下 780 设备像素只有 520 逻辑像素。
            int dpi = NativeMethods.GetDpiForWindowOrDefault(main);
            int minWidth = (int)Math.Round(MinLogicalWidth * dpi / 96.0);
            int maxWidth = (int)Math.Round(mainWidth * MaxWidthRatio);

            int target = (int)Math.Round(mainWidth * WidthRatio);

            if (target < minWidth)
            {
                target = minWidth;
            }

            if (target > maxWidth)
            {
                target = maxWidth;
            }

            width = target;
        }

        private static IntPtr GetMainWindow(IVsUIShell? shell)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            if (shell == null)
            {
                return IntPtr.Zero;
            }

            IntPtr handle;

            if (ErrorHandler.Failed(shell.GetDialogOwnerHwnd(out handle)))
            {
                return IntPtr.Zero;
            }

            return handle;
        }

        #endregion

        #region 已摆过的版本号

        /// <summary>
        /// 读不出来就当成没摆过：宁可多摆一次，也不要「说好靠右却停在左边」。
        ///
        /// 注意 <see cref="Package.UserRegistryRoot"/> 拿到的是包自己持有、由包负责释放的那个 key，
        /// 这里只能借用，绝不能 using 掉。
        /// </summary>
        private static int GetAppliedVersion(Package package)
        {
            try
            {
                RegistryKey? root = package.UserRegistryRoot;

                if (root == null)
                {
                    return 0;
                }

                using (RegistryKey? key = root.OpenSubKey(RegistrySubKey, writable: false))
                {
                    object? value = key?.GetValue(AppliedLayoutVersionValue);

                    if (value == null)
                    {
                        return 0;
                    }

                    return Convert.ToInt32(value);
                }
            }
            catch (Exception)
            {
                return 0;
            }
        }

        /// <summary>写失败只意味着下次启动再摆一遍，不值得打断启动流程。</summary>
        private static void SetAppliedVersion(Package package, int version)
        {
            try
            {
                RegistryKey? root = package.UserRegistryRoot;

                if (root == null)
                {
                    return;
                }

                using (RegistryKey? key = root.CreateSubKey(RegistrySubKey))
                {
                    if (key == null)
                    {
                        return;
                    }

                    key.SetValue(AppliedLayoutVersionValue, version, RegistryValueKind.DWord);
                }
            }
            catch (Exception)
            {
            }
        }

        #endregion
    }
}
