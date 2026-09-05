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
  | 'Raw';

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
}

/** 工具调用信息，随 `ToolCallStarted` / `ToolCallCompleted` 事件下发。 */
export interface AgentToolCall {
  toolUseId: string;
  name: string;
  inputJson: string;
  resultText: string;
  isError: boolean;
}

/** 用量信息，随 `UsageUpdated` 事件下发。 */
export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  durationMs: number;
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
  hookName: string;
  hookPhase: string;

  /** 系统提示的中文模板，同时也是 i18n 表的键；缺省表示 content 就是最终文本。 */
  textKey?: string;

  /** 模板里 {name} 占位的取值。 */
  textArgs?: Record<string, string>;
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
