// 桥协议的 type 字段取值。

export const OUTBOUND = {
  Replay: 'replay',
  Event: 'event',
  Theme: 'theme',
  Context: 'context',
  PanelData: 'panelData',
  TerminalOutput: 'terminalOutput',
  TerminalExited: 'terminalExited',
  // 终端进程已按某套启动参数起来了，带**实际用上的** model / effort / permissionMode。
  TerminalStarted: 'terminalStarted',
  // 整条 tab 条。推给所有活着的前端，不只是当前可见那个。
  Tabs: 'tabs',
  // 广播语言/外观偏好（lang、appearance）。宿主转发给发起 tab 以外的其余前端。
  UiPrefs: 'uiPrefs',
  // 广播额度快照给其余前端。
  Usage: 'usage',
} as const;

export const INBOUND = {
  Ready: 'ready',
  Send: 'send',
  Interrupt: 'interrupt',
  SetOption: 'setOption',
  Query: 'query',
  VsAction: 'vsAction',
  RunCommand: 'runCommand',
  PanelOpen: 'panelOpen',
  // 执行面板动作：按 id 点名，只能填槽位值，传不了标志位。
  PanelAction: 'panelAction',
  // 重新探一次额度用量。
  RefreshUsage: 'refreshUsage',
  ResumeSession: 'resumeSession',
  // 把某个文件还原成 CLI 留下的某一版快照（取代被拒绝的 /rewind）。
  RestoreFile: 'restoreFile',
  EscapeUnhandled: 'escapeUnhandled',
  ExportTranscript: 'exportTranscript',
  TerminalStart: 'terminalStart',
  TerminalInput: 'terminalInput',
  TerminalResize: 'terminalResize',
  TerminalStop: 'terminalStop',
  // 丢掉当前会话，开一条干净的（自动接回之后的逃生口）。
  NewSession: 'newSession',
  // 点了 +：新开一个 tab。
  TabCreate: 'tabCreate',
  // 切到某个 tab，id 在 value 里。
  TabActivate: 'tabActivate',
  // 关掉某个 tab，id 在 value 里。
  TabClose: 'tabClose',
  // 本 tab 的语言或外观变了，请宿主转发给其余 tab（lang、appearance）。
  UiPrefsChanged: 'uiPrefsChanged',
} as const;
