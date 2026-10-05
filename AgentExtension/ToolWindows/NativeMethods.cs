// 按键转投与窗口摆位用到的少量 Win32 互操作

using System;
using System.Runtime.InteropServices;

namespace AgentExtension.ToolWindows
{
    /// <summary>按键转投（见 <see cref="AgentChatToolWindow"/> 的按键区）与窗口摆位（见 <see cref="AgentChatWindowLayout"/>）用到的 Win32 调用。</summary>
    internal static class NativeMethods
    {
        /// <summary>Win32 的 MSG。</summary>
        [StructLayout(LayoutKind.Sequential)]
        internal struct NativeMessage
        {
            public IntPtr Hwnd;
            public uint Message;
            public IntPtr WParam;
            public IntPtr LParam;
            public uint Time;
            public int X;
            public int Y;
        }

        [DllImport("user32.dll")]
        internal static extern IntPtr GetFocus();

        [DllImport("user32.dll")]
        internal static extern bool IsChild(IntPtr parent, IntPtr child);

        [DllImport("user32.dll")]
        internal static extern bool TranslateMessage(ref NativeMessage message);

        [DllImport("user32.dll")]
        internal static extern IntPtr DispatchMessage(ref NativeMessage message);

        [DllImport("user32.dll")]
        internal static extern IntPtr SendMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);

        /// <summary>虚拟键 → 扫描码（MAPVK_VK_TO_VSC = 0）。</summary>
        [DllImport("user32.dll")]
        internal static extern uint MapVirtualKey(uint code, uint mapType);

        #region 窗口摆位

        /// <summary>Win32 的 RECT。</summary>
        [StructLayout(LayoutKind.Sequential)]
        internal struct Rect
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool GetWindowRect(IntPtr hWnd, out Rect rect);

        [DllImport("user32.dll")]
        private static extern uint GetDpiForWindow(IntPtr hWnd);

        /// <summary>
        /// 取窗口所在显示器的 DPI，失败回落 96。
        ///
        /// GetDpiForWindow 是 Windows 10 1607 才有的导出；在更早的系统上 P/Invoke 会抛
        /// EntryPointNotFoundException，所以必须兜住——为了摆个窗口把包加载搞崩不值当。
        /// </summary>
        internal static int GetDpiForWindowOrDefault(IntPtr hWnd)
        {
            try
            {
                uint dpi = GetDpiForWindow(hWnd);

                if (dpi >= 48 && dpi <= 960)
                {
                    return (int)dpi;
                }
            }
            catch (Exception)
            {
            }

            return 96;
        }

        #endregion
    }
}
