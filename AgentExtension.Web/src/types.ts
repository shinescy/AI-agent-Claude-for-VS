// C# 侧 `AgentEvent` 及相关类型的前端镜像。

/** 事件种类，对应 C# `AgentEventKind` 枚举。 */
export type AgentEventKind =
  | 'SessionStarted'
  | 'AssistantText'
  | 'Thinking'
  | 'ToolCallStarted'
  | 'ToolCallCompleted'
  | 'HookProgress'
  | 'InteractionRequested'
  | 'UsageUpdated'
  | 'RateLimitUpdated'
  | 'TurnCompleted'
  | 'Failed'
  | 'Notice'
  | 'UserPrompt'
  | 'AppliedSettings'
  | 'Compaction'
  | 'RemoteControlChanged'
  | 'Raw';

/** 上下文压缩的某个阶段，随 `Compaction` 事件下发；对应 C# `AgentCompaction`。 */
export interface AgentCompaction {
  phase: 'started' | 'completed' | 'failed' | 'summary';
  /** manual 或 auto。 */
  trigger: string;
  preTokens: number;
  /** 0 表示 CLI 没报。 */
  postTokens: number;
  durationMs: number;
  /** 分界记录的 uuid，摘要靠它认领。 */
  boundaryUuid: string;
  summary: string;
  error: string;
}

/** 远程控制状态，随 `RemoteControlChanged` 下发；以 CLI 回话为准。 */
export interface AgentRemoteControl {
  /** connected / off / failed / policy_disabled，或 CLI 报的其它状态。 */
  state: string;
  /** 说明或失败原因，CLI 的原话。 */
  detail: string;
  /** 在网页上继续这条会话的地址。 */
  sessionUrl: string;
  /** 这是对用户点按开关的回话；CLI 自己推的状态变化没有或为 false。 */
  requested?: boolean;
}

/** CLI 汇报的当前生效设置，随 `AppliedSettings` 事件下发。 */
export interface AppliedSettingsInfo {
  /** Ultracode 能不能开；旧 CLI 不报时为 null。 */
  ultracodeAvailable: boolean | null;
  /** 开关是否已请求打开；不报时为 null。 */
  ultracodeRequested: boolean | null;
  /** Ultracode 是否真正生效。 */
  ultracode: boolean;
  effort: string;
  model: string;
}

/** CLI 汇报的可用模型，来自 initialize 握手。 */
export interface AgentModelInfo {
  /** 传给 --model 的取值，如 default / opus。 */
  value: string;
  displayName: string;
  /** 该取值实际解析成的模型，如 claude-opus-5[1m]。 */
  resolvedModel: string;
  description: string;
  supportsEffort: boolean;
  /** 该模型支持的 effort 档位；不支持时为空数组。 */
  supportedEffortLevels: string[];
}

/** 一条 slash 命令连带 CLI 给的说明。 */
export interface SlashCommandInfo {
  name: string;
  description: string;
  /** 参数提示，形如 `[review-aspects]`；不需要参数时为空串。 */
  argumentHint: string;
}

/** MCP 服务器状态。 */
export interface McpServerInfo {
  name: string;
  status: string;
}

/** 会话信息，随 `SessionStarted` 事件下发；每个轮次都会重发，不只是每会话一次。 */
export interface AgentSessionInfo {
  sessionId: string;
  model: string;
  cwd: string;
  permissionMode: string;
  cliVersion: string;
  /** CLI 是否会在上下文满时自动压缩；null 是宿主没读到，从没读到过才按开。 */
  autoCompactEnabled?: boolean | null;
  tools: string[];
  slashCommands: string[];
  /** 同一批命令连带说明与参数提示，用于补全提示与「命令」面板（取代被 CLI 拒绝的 /help）。 */
  slashCommandInfos: SlashCommandInfo[];
  /** 仅终端可用的命令（如 doctor、color），补全列表中必须排除。 */
  terminalSlashCommands: string[];
  skills: string[];
  subAgents: string[];
  mcpServers: McpServerInfo[];
  capabilities: string[];
  /** CLI 汇报的可用模型；空数组表示这一版没给，界面退回内置静态清单。 */
  models: AgentModelInfo[];
  /** 订阅类型，如 Claude Max。 */
  subscriptionType: string;
  /** 登录账号的邮箱；CLI 没给就是空串。 */
  accountEmail?: string;
  /** 登录账号所属的组织；CLI 没给就是空串。 */
  accountOrganization?: string;
  /** 当前思考强度。 */
  effortLevel: string;
  /** `/model` 的 Available 清单；比握手的 models 更全。 */
  availableModels: string[];
  /** `/effort` 用法串里的全部档位；比握手的 supportedEffortLevels 更全。 */
  effortLevels: string[];
  /** 额度窗口，来自 `/usage`。 */
  usageWindows: UsageWindow[];
  /** `/usage` 的完整原文，供 status 面板原样展示那段行为画像。 */
  usageRawText: string;
  /** 最近一次现探到额度的时刻（Unix 毫秒）；0 或缺省是还没探过。 */
  usageCheckedAtUnixMs?: number;
}

/** 工具调用信息，随 `ToolCallStarted` / `ToolCallCompleted` 事件下发。 */
export interface AgentToolCall {
  toolUseId: string;
  name: string;
  inputJson: string;
  resultText: string;
  isError: boolean;
  /** 发起它的子代理调用 id；主线调用为空串。 */
  parentToolUseId?: string;
  /** 子代理跑了多久，毫秒。 */
  durationMs?: number;
  /** 子代理用掉的 token 数。 */
  totalTokens?: number;
  /** 结果是否已经回来（前端自己记的）。 */
  done?: boolean;
}

/** 用量信息，随 `UsageUpdated` 事件下发。 */
export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  durationMs: number;
  /** 这次写入缓存的有效期：1h、5m，没写入为空串。 */
  cacheTtl?: string;
  /** 这条回复的时刻，Unix 毫秒；不知道为 0。 */
  atUnixMs?: number;
}

/** 配额状态，随 `RateLimitUpdated` 事件下发。 */
export interface AgentRateLimit {
  /** CLI 给的状态字面量，如 allowed / allowed_warning。 */
  status: string;
  /** 限流窗口类型，如 seven_day。 */
  limitType: string;
  /** 已用比例，0 到 1。 */
  utilization: number;
  /** 额度重置时刻，Unix 秒；0 表示 CLI 没给。 */
  resetsAt: number;
  /** 是否已进入超额用量。 */
  isUsingOverage: boolean;
}

/** 一个额度窗口，来自 `/usage`（对应 C# 侧 UsageWindow）。 */
export interface UsageWindow {
  /** CLI 给的原始标签，如 `Current session` / `Current week (Fable)`。 */
  label: string;
  /** 已用百分比，CLI 只给整数。 */
  percentUsed: number;
  /** 重置时刻原文，如 `Aug 21, 10:59am (Asia/Taipei)`。 */
  resetsAtText: string;
  /** 重置时刻的 Unix 秒；0 表示宿主没解析出绝对时刻。 */
  resetsAtUnix: number;
  /** 只统计某个模型时是模型名（如 `Fable`），否则空串。 */
  model: string;
}

/** 权限拒绝记录。 */
export interface AgentPermissionDenial {
  toolName: string;
  toolUseId: string;
  toolInputJson: string;
}

/** 轮次结果，随 `TurnCompleted` 事件下发。 */
export interface AgentTurnResult {
  usage: AgentUsage | null;
  wasInterrupted: boolean;
  /** 模型上下文窗口 token 数；0 或缺省表示没读到。 */
  contextWindow?: number;
  permissionDenials: AgentPermissionDenial[];
}

/** 单条代理事件。 */
export interface AgentEvent {
  kind: AgentEventKind;
  content: string;
  sessionInfo: AgentSessionInfo | null;
  toolCall: AgentToolCall | null;
  usageData: AgentUsage | null;
  turnResult: AgentTurnResult | null;
  rateLimitData: AgentRateLimit | null;
  /** 只有 AppliedSettings 事件带。 */
  appliedSettings?: AppliedSettingsInfo | null;
  /** 只有 Compaction 事件带。 */
  compactionData?: AgentCompaction | null;
  /** 只有 RemoteControlChanged 事件带。 */
  remoteControlData?: AgentRemoteControl | null;
  hookName: string;
  hookPhase: string;

  /** 系统提示的中文模板，同时也是 i18n 表的键；缺省表示 content 就是最终文本。 */
  textKey?: string;

  /** 模板里 {name} 占位的取值。 */
  textArgs?: Record<string, string>;

  /** 事件时刻，Unix 毫秒；宿主不知道时不带。 */
  atUnixMs?: number;
}

/** 桥消息信封，`type` 取值来自 `protocol.ts` 的 OUTBOUND / INBOUND。 */
export interface Envelope<T> {
  type: string;
  payload: T;
}

/** tab 条上的一个 tab。id 是 tab 自己的 id，不是会话 id。 */
export interface TabView {
  id: string;
  title: string;
  /** 正在跑一轮。 */
  busy: boolean;
  /** 未被激活期间有过输出。 */
  unread: boolean;
  /** 这个 tab 崩了（会话起不来 / 运行中失败），需要过去看一眼原因。跟 unread 不是一回事。 */
  failed: boolean;
}

/** 出站 tabs 消息的载荷。 */
export interface TabListPayload {
  tabs: TabView[];
  activeId: string;
  /** 键盘切换触发时为真，要求把焦点放到 tab 条上。 */
  focusStrip?: boolean;
}
