using Microsoft.VisualStudio;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;

using AgentExtension.ToolWindows;

using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Threading;

// 绑定重定向：ProvideBindingRedirectionAttribute 只允许标注在程序集上（AttributeUsage 限制），
[assembly: ProvideBindingRedirection(AssemblyName = "System.Text.Json",
	OldVersionLowerBound = "0.0.0.0", OldVersionUpperBound = "10.0.0.8", NewVersion = "10.0.0.8")]
[assembly: ProvideBindingRedirection(AssemblyName = "System.Text.Encodings.Web",
	OldVersionLowerBound = "0.0.0.0", OldVersionUpperBound = "10.0.0.8", NewVersion = "10.0.0.8")]
[assembly: ProvideBindingRedirection(AssemblyName = "System.IO.Pipelines",
	OldVersionLowerBound = "0.0.0.0", OldVersionUpperBound = "10.0.0.8", NewVersion = "10.0.0.8")]
[assembly: ProvideBindingRedirection(AssemblyName = "System.Memory",
	OldVersionLowerBound = "0.0.0.0", OldVersionUpperBound = "4.0.5.0", NewVersion = "4.0.5.0")]
[assembly: ProvideBindingRedirection(AssemblyName = "System.Buffers",
	OldVersionLowerBound = "0.0.0.0", OldVersionUpperBound = "4.0.5.0", NewVersion = "4.0.5.0")]
[assembly: ProvideBindingRedirection(AssemblyName = "System.Runtime.CompilerServices.Unsafe",
	OldVersionLowerBound = "0.0.0.0", OldVersionUpperBound = "6.0.3.0", NewVersion = "6.0.3.0")]
[assembly: ProvideBindingRedirection(AssemblyName = "System.Numerics.Vectors",
	OldVersionLowerBound = "0.0.0.0", OldVersionUpperBound = "4.1.5.0", NewVersion = "4.1.5.0")]
[assembly: ProvideBindingRedirection(AssemblyName = "System.Threading.Tasks.Extensions",
	OldVersionLowerBound = "0.0.0.0", OldVersionUpperBound = "4.2.4.0", NewVersion = "4.2.4.0")]

namespace AgentExtension
{
	[PackageRegistration(UseManagedResourcesOnly = true, AllowsBackgroundLoading = true)]
	[ProvideMenuResource("Menus.ctmenu", 1)]
	// 随 VS 启动加载：面板要在启动时自动打开，包就得先被加载起来。
	// 用 ShellInitialized 而不是 SolutionExists——空 VS 里也要出现这个面板。
	// 注意没有解决方案时 VS 会先停在「起始窗口」，外壳启动并没走完，
	// 面板要等那个窗口关掉才出现；这不是坏了。
	[ProvideAutoLoad(VSConstants.UICONTEXT.ShellInitialized_string, PackageAutoLoadFlags.BackgroundLoad)]
	// 这里的 Style/Orientation 只决定「用户配置里还没有这个窗口时」的落点，
	// 真正的停靠与宽度由 AgentChatWindowLayout 在启动时摆（见那里的说明）。
	// 特意不再写 Window=解决方案资源管理器：并进它的标签组会跟着它跑到左边，宽度也归它管。
	[ProvideToolWindow(typeof(AgentExtension.ToolWindows.AgentChatToolWindow),
		Style = VsDockStyle.Tabbed,
		Orientation = ToolWindowOrientation.Right)]
	[Guid(AgentExtensionPackage.PackageGuidString)]
	public sealed class AgentExtensionPackage : AsyncPackage
	{
		/// <summary>AgentExtensionPackage GUID string.</summary>
		public const string PackageGuidString = "2fd97008-51e8-4776-bf26-e4505425dd11";

		#region Package Members

		/// <summary>Initialization of the package; this method is called right after the package is sited, so this is the place wh</summary>
		protected override async Task InitializeAsync(CancellationToken cancellationToken, IProgress<ServiceProgressData> progress)
		{
			await this.JoinableTaskFactory.SwitchToMainThreadAsync(cancellationToken);

			await AgentExtension.Commands.OpenAgentChatCommand.InitializeAsync(this);
			await AgentExtension.Commands.SendSelectionCommand.InitializeAsync(this);
			await AgentExtension.Commands.SendBuildErrorsCommand.InitializeAsync(this);

			ScheduleChatWindowOpen();
		}

		#endregion

		#region 启动时自动打开面板

		/// <summary>
		/// 排一个「等外壳忙完再开面板」的活儿。
		///
		/// **绝不能在 InitializeAsync 里直接建工具窗口**：建窗口会回头向外壳要「这个包」，
		/// 而此刻包正挂在初始化里没返回——外壳等包初始化完、包等外壳把窗口造出来，
		/// VS 主线程当场死锁。表现是启动到一半彻底无响应：主窗口标题在、没有任何弹窗、
		/// 也不写日志（ActivityLog 要退出才落盘，而它退不出去），从外面只看得到
		/// Responding=False。2026-08-24 实测踩到。
		///
		/// ApplicationIdle 是主线程调度队列里最低的一档：外壳启动那批活儿全部跑完、
		/// 界面闲下来了才轮到它，那时 InitializeAsync 早已返回，建窗口才是安全的。
		/// </summary>
		private void ScheduleChatWindowOpen()
		{
			// VSTHRD001 建议改用 SwitchToMainThreadAsync——但这里要的恰恰是它给不了的「最低优先级」，
			// 排到主线程闲下来之后才跑正是本方法存在的理由，故就地压掉。
#pragma warning disable VSTHRD001
			ThreadHelper.Generic.BeginInvoke(
				DispatcherPriority.ApplicationIdle,
				() => _ = this.JoinableTaskFactory.RunAsync(() => OpenChatWindowOnStartupAsync(this.DisposalToken)));
#pragma warning restore VSTHRD001
		}

		/// <summary>把聊天面板打开并摆好。摆不动不该拖垮 VS 启动，所以整段吞异常。</summary>
		private async Task OpenChatWindowOnStartupAsync(CancellationToken cancellationToken)
		{
			try
			{
				// 先取到对象、切回主线程再转接口：IVsUIShell 是 STA 的 COM 接口，
				// 在后台线程上做 QueryInterface 会被 vs-threading 分析器判为跨线程访问。
				object? shellService = await this.GetServiceAsync(typeof(SVsUIShell));

				ToolWindowPane window = await this.FindToolWindowAsync(
					typeof(AgentChatToolWindow), 0, create: true, cancellationToken);

				await this.JoinableTaskFactory.SwitchToMainThreadAsync(cancellationToken);

				var shell = shellService as IVsUIShell;
				var frame = window?.Frame as IVsWindowFrame;

				if (frame == null)
				{
					return;
				}

				// 用 ShowNoActivate 而不是 Show：启动时抢焦点会把光标从编辑器里拽走。
				// 先显示再摆位——没进过停靠布局的窗框，SetFramePos 无处可摆。
				frame.ShowNoActivate();

				AgentChatWindowLayout.EnsureInitialLayout(this, shell, frame);
			}
			catch (OperationCanceledException)
			{
			}
			catch (Exception)
			{
			}
		}

		#endregion
	}
}
