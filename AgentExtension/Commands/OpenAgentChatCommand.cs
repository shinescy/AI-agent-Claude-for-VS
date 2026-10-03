// 打开聊天工具窗口的菜单命令

using System;
using System.ComponentModel.Design;
using System.Threading.Tasks;
using AgentExtension.ToolWindows;
using Microsoft.VisualStudio;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;
using Task = System.Threading.Tasks.Task;

namespace AgentExtension.Commands
{
    /// <summary>视图 → 其他窗口 → Claude Code Extend。</summary>
    internal sealed class OpenAgentChatCommand
    {
        public const int CommandId = 0x0100;

        public static readonly Guid CommandSet = new Guid("9C1F5D74-2B8E-4A36-B0D7-6E3F1A9C2D48");

        private readonly AsyncPackage _package;

        private OpenAgentChatCommand(AsyncPackage package, OleMenuCommandService commandService)
        {
            _package = package ?? throw new ArgumentNullException(nameof(package));

            var commandId = new CommandID(CommandSet, CommandId);
            var menuItem = new MenuCommand(Execute, commandId);
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

            _ = new OpenAgentChatCommand(package, commandService);
        }

        private void Execute(object sender, EventArgs e)
        {
            _ = _package.JoinableTaskFactory.RunAsync(async () =>
            {
                await _package.JoinableTaskFactory.SwitchToMainThreadAsync();

                ToolWindowPane window = await _package.ShowToolWindowAsync(
                    typeof(AgentChatToolWindow), 0, create: true, cancellationToken: _package.DisposalToken);

                if (window?.Frame == null)
                {
                    throw new NotSupportedException("无法创建工具窗口。");
                }

                var frame = (IVsWindowFrame)window.Frame;
                ErrorHandler.ThrowOnFailure(frame.Show());
            });
        }
    }
}
