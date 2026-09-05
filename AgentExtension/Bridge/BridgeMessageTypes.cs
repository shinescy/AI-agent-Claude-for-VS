// 消息桥的类型名常量，与前端 protocol.ts 必须逐字一致

using System.Collections.Generic;

namespace AgentExtension.Bridge
{
    /// <summary>桥协议的 type 字段取值，与 <c>AgentExtension.Web/src/protocol.ts</c> 一一对应，由契约测试 比对。</summary>
    public static class BridgeMessageTypes
    {
        #region 出站（C# → 前端）

        public const string Replay = "replay";
        public const string Event = "event";
        public const string Theme = "theme";
        public const string Context = "context";

        /// <summary>面板数据：列表、错误与重启提示。</summary>
        public const string PanelData = "panelData";

        /// <summary>终端标签的输出：伪控制台吐出的原始字节，base64 编码。</summary>
        public const string TerminalOutput = "terminalOutput";

        /// <summary>终端里的子进程退出了，带退出码。</summary>
        public const string TerminalExited = "terminalExited";

        /// <summary>整条 tab 条：<c>{ tabs: [ { id, title, busy, unread } ], activeId }</c>。推给**所有**活着的桥，不只是激活那个。</summary>
        public const string Tabs = "tabs";

        /// <summary>广播语言/外观偏好：<c>{ lang, appearance }</c>。由宿主转发给发起 tab 以外的**其余**桥。</summary>
        public const string UiPrefs = "uiPrefs";

        /// <summary>广播额度快照，供后台 tab 显示新鲜数据。</summary>
        public const string Usage = "usage";

        #endregion

        #region 入站（前端 → C#）

        /// <summary>前端挂载完成，请求回灌转录。</summary>
        public const string Ready = "ready";

        public const string Send = "send";
        public const string Interrupt = "interrupt";
        public const string SetOption = "setOption";
        public const string Query = "query";
        public const string VsAction = "vsAction";

        /// <summary>执行一条 CLI 子命令（doctor / mcp / plugin 等）。</summary>
        public const string RunCommand = "runCommand";

        /// <summary>打开面板。</summary>
        public const string PanelOpen = "panelOpen";

        /// <summary>执行面板动作。</summary>
        public const string PanelAction = "panelAction";

        /// <summary>重新探一次额度用量。</summary>
        public const string RefreshUsage = "refreshUsage";

        /// <summary>接回一条历史会话（重启 CLI 并带上 <c>--resume</c>，可选 <c>--fork-session</c>）。</summary>
        public const string ResumeSession = "resumeSession";

        /// <summary>把某个文件还原成 CLI 留下的某一版快照。</summary>
        public const string RestoreFile = "restoreFile";

        /// <summary>网页没用上刚按下的 Esc，请宿主按 VS 的老规矩把焦点交回文档窗口。</summary>
        public const string EscapeUnhandled = "escapeUnhandled";

        /// <summary>把整段转录写成本机文件（<c>/export</c> 的落盘实现）。</summary>
        public const string ExportTranscript = "exportTranscript";

        /// <summary>打开终端标签：起一个跑在伪控制台里的交互式 CLI。</summary>
        public const string TerminalStart = "terminalStart";

        /// <summary>终端进程已按某套启动参数起来了，携带**实际用上的** model / effort / permissionMode。</summary>
        public const string TerminalStarted = "terminalStarted";

        /// <summary>终端按键：base64 编码的字节，原样写进伪控制台的标准输入。</summary>
        public const string TerminalInput = "terminalInput";

        /// <summary>终端尺寸变化，携带行列数。</summary>
        public const string TerminalResize = "terminalResize";

        /// <summary>关掉终端标签里的子进程。</summary>
        public const string TerminalStop = "terminalStop";

        /// <summary>丢掉当前会话，开一条干净的（自动接回之后的逃生口）。</summary>
        public const string NewSession = "newSession";

        /// <summary>点了 +：新开一个 tab，起一条不带 --resume 的干净会话。</summary>
        public const string TabCreate = "tabCreate";

        /// <summary>切到某个 tab，id 放在 <c>value</c> 里。</summary>
        public const string TabActivate = "tabActivate";

        /// <summary>关掉某个 tab，id 放在 <c>value</c> 里。</summary>
        public const string TabClose = "tabClose";

        /// <summary>前端改了语言或外观，请宿主转发给其余 tab：<c>{ lang, appearance }</c>。</summary>
        public const string UiPrefsChanged = "uiPrefsChanged";

        #endregion

        #region 汇总

        public static IReadOnlyList<string> AllOutbound { get; } = new[]
        {
            Replay, Event, Theme, Context, PanelData, TerminalOutput, TerminalExited, TerminalStarted, Tabs, UiPrefs, Usage
        };

        public static IReadOnlyList<string> AllInbound { get; } = new[]
        {
            Ready, Send, Interrupt, SetOption, Query, VsAction, RunCommand, PanelOpen, PanelAction,
            RefreshUsage, ResumeSession, RestoreFile, EscapeUnhandled, ExportTranscript,
            TerminalStart, TerminalInput, TerminalResize, TerminalStop, NewSession,
            TabCreate, TabActivate, TabClose, UiPrefsChanged
        };

        #endregion
    }
}
