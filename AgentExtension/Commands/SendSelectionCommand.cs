// 把编辑器选中的代码送进代理输入框的右键命令

using System;
using System.ComponentModel.Design;
using System.Threading.Tasks;
using AgentExtension.ToolWindows;
using AgentExtension.Vs;
using Microsoft.VisualStudio;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;
using Task = System.Threading.Tasks.Task;

namespace AgentExtension.Commands
{
    /// <summary>代码编辑器右键 → 发送选中代码到 Claude Code Extend。</summary>
    internal sealed class SendSelectionCommand
    {
        public const int CommandId = 0x0101;

        public static readonly Guid CommandSet = new Guid("9C1F5D74-2B8E-4A36-B0D7-6E3F1A9C2D48");

        private readonly AsyncPackage _package;

        private SendSelectionCommand(AsyncPackage package, OleMenuCommandService commandService)
        {
            _package = package ?? throw new ArgumentNullException(nameof(package));

            var commandId = new CommandID(CommandSet, CommandId);
            var menuItem = new OleMenuCommand(Execute, commandId);

            menuItem.BeforeQueryStatus += OnBeforeQueryStatus;

            commandService.AddCommand(menuItem);
        }

        public static async Task InitializeAsync(AsyncPackage package)
        {
            await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync(package.DisposalToken);

            var commandService = await package.GetServiceAsync(typeof(IMenuCommandService)) as OleMenuCommandService;

            if (commandService == null)
            {
                return;
            }

            _ = new SendSelectionCommand(package, commandService);
        }

        #region 命令状态

        private void OnBeforeQueryStatus(object sender, EventArgs e)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            if (!(sender is OleMenuCommand command))
            {
                return;
            }

            EditorSelection selection = EditorSelectionReader.Read();

            command.Visible = selection.HasSelection;
            command.Enabled = selection.HasSelection;
        }

        #endregion

        #region 执行

        private void Execute(object sender, EventArgs e)
        {
            _ = _package.JoinableTaskFactory.RunAsync(async () =>
            {
                await _package.JoinableTaskFactory.SwitchToMainThreadAsync();

                EditorSelection selection = EditorSelectionReader.Read();

                if (!selection.HasSelection)
                {
                    return;
                }

                string snippet = SelectionFormatter.Format(
                    selection.FilePath, selection.StartLine, selection.EndLine, selection.Text);

                ToolWindowPane window = await _package.ShowToolWindowAsync(
                    typeof(AgentChatToolWindow), 0, create: true, cancellationToken: _package.DisposalToken);

                if (window?.Frame == null)
                {
                    return;
                }

                var frame = (IVsWindowFrame)window.Frame;
                ErrorHandler.ThrowOnFailure(frame.Show());

                if (window is AgentChatToolWindow chatWindow)
                {
                    chatWindow.ChatControl.InsertContext("selection", snippet);
                }
            });
        }

        #endregion
    }
}
