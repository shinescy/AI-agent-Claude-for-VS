// 承载聊天界面的 VS 工具窗口

using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Windows.Input;
using Microsoft.VisualStudio.Shell;

namespace AgentExtension.ToolWindows
{
    /// <summary>聊天工具窗口。</summary>
    [Guid(WindowGuidString)]
    public class AgentChatToolWindow : ToolWindowPane
    {
        public const string WindowGuidString = "7B4E9A21-3C6D-4F58-9E12-8A5D0C7B4E31";

        private readonly AgentChatControl _control;

        public AgentChatToolWindow() : base(null)
        {
            Caption = "Claude Code Extend";

            _control = new AgentChatControl();
            Content = _control;
        }

        public AgentChatControl ChatControl
        {
            get
            {
                return _control;
            }
        }

        /// <summary>窗口框架创建完成后再初始化 WebView2——过早初始化会拿不到有效的窗口句柄。</summary>
        protected override void OnCreate()
        {
            base.OnCreate();

            KeyDiagnostics.Install();

            _ = ThreadHelper.JoinableTaskFactory.RunAsync(async () =>
            {
                await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
                await _control.EnsureWebViewAsync();
            });
        }

        #region 按键

        /// <summary>在 VS 把按键当成自己的命令之前，把该归网页的那些键直接投给浏览器。</summary>
        protected override bool PreProcessMessage(ref Message m)
        {
            ModifierKeys modifiers = Keyboard.Modifiers;

            if (KeyDiagnostics.Enabled && (m.Msg == PanelKeyPolicy.WmKeyDown || m.Msg == PanelKeyPolicy.WmKeyUp))
            {
                KeyDiagnostics.Log($"窗格 PreProcessMessage msg=0x{m.Msg:X4} vk=0x{m.WParam.ToInt32():X2} 修饰={modifiers}");
            }

            bool shift = (modifiers & ModifierKeys.Shift) == ModifierKeys.Shift;
            bool control = (modifiers & ModifierKeys.Control) == ModifierKeys.Control;
            bool alt = (modifiers & ModifierKeys.Alt) == ModifierKeys.Alt;

            if (!PanelKeyPolicy.ShouldForward(m.Msg, m.WParam.ToInt32(), shift, control, alt))
            {
                return base.PreProcessMessage(ref m);
            }

            IntPtr focus = NativeMethods.GetFocus();

            if (focus == IntPtr.Zero || !_control.IsBrowserWindow(focus))
            {
                return base.PreProcessMessage(ref m);
            }

            var native = new NativeMethods.NativeMessage
            {
                Hwnd = m.HWnd,
                Message = (uint)m.Msg,
                WParam = m.WParam,
                LParam = m.LParam
            };

            NativeMethods.TranslateMessage(ref native);
            NativeMethods.DispatchMessage(ref native);
            return true;
        }

        #endregion

        /// <summary>面板关闭时终止代理会话，否则 claude 子进程会残留在后台。</summary>
        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _control.ShutdownSession();
            }

            base.Dispose(disposing);
        }
    }
}
