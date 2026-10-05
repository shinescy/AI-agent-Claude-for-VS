// 把错误列表送进代理输入框的右键命令

using System;
using System.Collections.Generic;
using System.ComponentModel.Design;
using System.Linq;
using System.Threading.Tasks;
using AgentExtension.ToolWindows;
using AgentExtension.Vs;
using Microsoft.VisualStudio;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;
using Task = System.Threading.Tasks.Task;

namespace AgentExtension.Commands
{
    /// <summary>代码编辑器右键 → 发送构建错误到 Claude Code Extend。</summary>
    internal sealed class SendBuildErrorsCommand
    {
        public const int CommandId = 0x0102;

        public static readonly Guid CommandSet = new Guid("9C1F5D74-2B8E-4A36-B0D7-6E3F1A9C2D48");

        private readonly AsyncPackage _package;

        private SendBuildErrorsCommand(AsyncPackage package, OleMenuCommandService commandService)
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

            _ = new SendBuildErrorsCommand(package, commandService);
        }

        #region 命令状态

        private void OnBeforeQueryStatus(object sender, EventArgs e)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            if (!(sender is OleMenuCommand command))
            {
                return;
            }

            IReadOnlyList<BuildIssue> issues = ErrorListReader.Read();

            bool hasContent = issues.Any(i =>
                i.Severity == BuildIssueSeverity.Error || i.Severity == BuildIssueSeverity.Warning);

            command.Visible = hasContent;
            command.Enabled = hasContent;
        }

        #endregion

        #region 执行

        private void Execute(object sender, EventArgs e)
        {
            _ = _package.JoinableTaskFactory.RunAsync(async () =>
            {
                await _package.JoinableTaskFactory.SwitchToMainThreadAsync();

                IReadOnlyList<BuildIssue> issues = ErrorListReader.Read();
                string text = BuildIssueFormatter.Format(issues);

                if (text.Length == 0)
                {
                    return;
                }

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
                    chatWindow.ChatControl.InsertContext("buildErrors", text);
                }
            });
        }

        #endregion
    }
}
