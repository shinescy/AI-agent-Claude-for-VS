// 转录状态管理：把宿主下发的事件流折叠成可渲染的块列表。

import type {
  AgentCompaction,
  AgentEvent,
  AgentRemoteControl,
  AgentRateLimit,
  AgentSessionInfo,
  AgentToolCall,
  AgentTurnResult,
  UsageWindow,
} from './types';
export type { AgentSessionInfo };
import { detectUnavailableCommand } from './unavailableCommands';
import { isPanelCommand, withPanelCommands } from './panelCommands';
import { withExtraCommands, withoutDeadCommands } from './extraCommands';
import { withTuiCommands } from './commandCatalog';
import { ULTRACODE_UNKNOWN, ultracodeFromApplied } from './ultracode';
import type { UltracodeState } from './ultracode';
import { nextCacheRecord } from './promptCache';
import type { PromptCacheRecord } from './promptCache';
import { EMPTY_METER, meterAfterCompaction, meterAfterTurn, meterAfterUsage } from './contextMeter';
import type { ContextMeter } from './contextMeter';

/** 块类型。 */
export type BlockKind =
  | 'user' | 'assistant' | 'thinking' | 'tool'
  | 'error' | 'notice' | 'raw' | 'turnEnd' | 'compaction';

/** 压缩块：进行中、完成（可展开看摘要）或失败。 */
export interface CompactionInfo {
  phase: 'running' | 'done' | 'failed';
  /** manual 或 auto；不知道为空。 */
  trigger: string;
  preTokens: number;
  /** 0 表示 CLI 没报。 */
  postTokens: number;
  boundaryUuid: string;
  /** 摘要正文；还没拿到为空。 */
  summary: string;
  error: string;
}

/** 转录里的一个块。 */
export interface Block {
  /** 递增 id，用作 React key。 */
  id: number;
  kind: BlockKind;
  text: string;
  tool?: AgentToolCall;
  turn?: AgentTurnResult;

  /** 系统提示的中文模板与取值；带上它渲染时才翻得动，text 只作退路。 */
  textKey?: string;
  textArgs?: Record<string, string>;
  /** 用户消息附带的图片（data URL），用于点开预览。 */
  images?: string[];
  /** 是否仍在接收增量；只有流式块需要重渲染，已冻结的块可以跳过。 */
  streaming: boolean;
  /** 这块开始的时刻，Unix 毫秒；不知道就不带。 */
  at?: number;
  /** 只有压缩块带。 */
  compaction?: CompactionInfo;
}

/** 转录整体状态。 */
export interface TranscriptState {
  blocks: Block[];
  busy: boolean;
  session: AgentSessionInfo | null;
  /** **对话**那个输入框的补全列表。 */
  slashCommands: string[];

  /** 终端输入框的补全列表：CLI 报的全量命令，一条都不滤，再补上 TUI 目录。 */
  terminalCommands: string[];
  /** 实测在本环境不可用的命令（如 /plugins）。 */
  unavailableCommands: string[];

  /** 最近一次被 CLI 拒掉的命令，供界面补一条具体说明。 */
  lastUnavailable: { command: string; blockId: number; seq: number } | null;
  /** 各限流窗口的最新配额，按 limitType 分别保存。 */
  rateLimits: Record<string, AgentRateLimit>;
  /** Ultracode 开关：会话级，回放（新会话 / 重启）时复位。 */
  ultracode: UltracodeState;
  /** 最近一条回复留下的缓存记录，用来推算缓存还剩多久。 */
  promptCache: PromptCacheRecord | null;
  /** 上下文占用计量：换会话清空。 */
  contextMeter: ContextMeter;
  /** 远程控制：CLI 说了算；seq 每收到一次状态加一。pending：点了开关、还没等到对这次点按的回话。 */
  remoteControl: AgentRemoteControl & { seq: number; pending: boolean };
  nextId: number;
}

/** 远程控制没开起来的几种状态。 */
const REMOTE_FAILED = new Set(['failed', 'policy_disabled']);

/** 会话没起时先垫着的内置命令；CLI 报了清单就整份换掉。 */
const BASELINE_COMMANDS: string[] = ['clear', 'compact', 'context', 'effort', 'init', 'model', 'usage'];

export const initialState: TranscriptState = {
  blocks: [],
  busy: false,
  session: null,
  // 聊天进程要等解决方案目录到手才起，这之前命令菜单不能是空的。
  slashCommands: withPanelCommands(withTuiCommands(withExtraCommands(BASELINE_COMMANDS))),
  terminalCommands: withTuiCommands(BASELINE_COMMANDS),
  unavailableCommands: [],
  lastUnavailable: null,
  rateLimits: {},
  ultracode: ULTRACODE_UNKNOWN,
  promptCache: null,
  contextMeter: EMPTY_METER,
  remoteControl: { state: 'off', detail: '', sessionUrl: '', seq: 0, pending: false },
  nextId: 1,
};

export type Action =
  | { type: 'userSent'; text: string; images?: string[]; at?: number }
  | { type: 'agentEvent'; event: AgentEvent }
  | { type: 'replay'; events: AgentEvent[] }
  // 别的 tab 广播来的额度快照；session 为 null（这个 tab 还没起会话）时忽略。
  | { type: 'usage'; usageWindows: UsageWindow[]; usageRawText: string; usageCheckedAtUnixMs?: number }
  // 退出登录后清掉账号三项：合并逻辑不认空串，只能显式清。
  | { type: 'accountCleared' }
  // 点了远程开关 / 等回话超时：只动「等着」这一位，状态仍以 CLI 为准。
  | { type: 'remoteRequested' }
  | { type: 'remoteRequestExpired' }
  // 点了压缩：先放一块「正在压缩」，不等 CLI 报开始
  | { type: 'compactRequested'; at?: number };

/** 合并会话信息：新值非空就用新值，为空则保留旧值。 */
export function mergeSessionInfo(
  previous: AgentSessionInfo | null,
  incoming: AgentSessionInfo): AgentSessionInfo {
  if (!previous)
  {
    return incoming;
  }

  const pick = <T,>(next: T, prev: T, empty: (v: T) => boolean): T => (empty(next) ? prev : next);
  const emptyStr = (v: string) => !v;
  const emptyArr = (v: unknown[]) => v.length === 0;

  return {
    sessionId: pick(incoming.sessionId, previous.sessionId, emptyStr),
    model: pick(incoming.model, previous.model, emptyStr),
    cwd: pick(incoming.cwd, previous.cwd, emptyStr),
    permissionMode: pick(incoming.permissionMode, previous.permissionMode, emptyStr),
    cliVersion: pick(incoming.cliVersion, previous.cliVersion, emptyStr),
    // 宿主读配置失败时报 null，不能拿它盖掉之前读到的值
    autoCompactEnabled: incoming.autoCompactEnabled ?? previous.autoCompactEnabled,
    subscriptionType: pick(incoming.subscriptionType, previous.subscriptionType, emptyStr),
    accountEmail: pick(incoming.accountEmail ?? '', previous.accountEmail ?? '', emptyStr),
    accountOrganization: pick(
      incoming.accountOrganization ?? '', previous.accountOrganization ?? '', emptyStr),
    effortLevel: pick(incoming.effortLevel, previous.effortLevel, emptyStr),
    tools: pick(incoming.tools, previous.tools, emptyArr),
    slashCommands: pick(incoming.slashCommands, previous.slashCommands, emptyArr),
    slashCommandInfos: pick(incoming.slashCommandInfos, previous.slashCommandInfos, emptyArr),
    terminalSlashCommands: pick(incoming.terminalSlashCommands, previous.terminalSlashCommands, emptyArr),
    skills: pick(incoming.skills, previous.skills, emptyArr),
    subAgents: pick(incoming.subAgents, previous.subAgents, emptyArr),
    mcpServers: pick(incoming.mcpServers, previous.mcpServers, emptyArr),
    capabilities: pick(incoming.capabilities, previous.capabilities, emptyArr),
    models: pick(incoming.models, previous.models, emptyArr),
    availableModels: pick(incoming.availableModels, previous.availableModels, emptyArr),
    effortLevels: pick(incoming.effortLevels, previous.effortLevels, emptyArr),
    // 额度窗口按整组替换而非逐项合并：/usage 每次给的是完整快照，
    usageWindows: pick(incoming.usageWindows, previous.usageWindows, emptyArr),
    usageRawText: pick(incoming.usageRawText, previous.usageRawText, emptyStr),
    // 取较新的：各 tab 与缓存回放来的时刻有先有后
    usageCheckedAtUnixMs: Math.max(incoming.usageCheckedAtUnixMs ?? 0, previous.usageCheckedAtUnixMs ?? 0),
  };
}

/** 把所有流式块冻结（streaming = false），其余保持不变。 */
function freezeStreaming(blocks: Block[]): Block[] {
  return blocks.map((b) => (b.streaming ? { ...b, streaming: false } : b));
}

/** 事件带的时刻；0 或没带当作不知道。 */
function eventTime(event: AgentEvent): number | undefined {
  const at = event.atUnixMs ?? 0;
  return at > 0 ? at : undefined;
}

/** 把某个 kind 对应的事件 kind 映射成块 kind（仅处理会产生文本块的两种事件）。 */
function textBlockKind(eventKind: AgentEvent['kind']): BlockKind {
  return eventKind === 'Thinking' ? 'thinking' : 'assistant';
}

/** 追加/合并一条文本增量：末尾块同类型且仍在流式中就追加，否则新建一块。 */
function appendText(state: TranscriptState, kind: BlockKind, text: string, at?: number): TranscriptState {
  const last = state.blocks[state.blocks.length - 1];

  if (last && last.kind === kind && last.streaming)
  {
    const updatedBlock: Block = { ...last, text: last.text + text };
    const blocks = [...state.blocks.slice(0, -1), updatedBlock];
    return { ...state, blocks };
  }

  const newBlock: Block = { id: state.nextId, kind, text, streaming: true, at };
  return { ...state, blocks: [...state.blocks, newBlock], nextId: state.nextId + 1 };
}

/** 合并两份清单并去重，保持先来后到的顺序。 */
function mergeUnique(first: string[], second: string[]): string[]
{
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const item of [...first, ...second])
  {
    if (!seen.has(item))
    {
      seen.add(item);
      merged.push(item);
    }
  }

  return merged;
}

/** 最后一个压缩块的下标；没有给 -1。 */
function lastCompactionIndex(blocks: Block[]): number {
  for (let i = blocks.length - 1; i >= 0; i--)
  {
    if (blocks[i].kind === 'compaction')
    {
      return i;
    }
  }

  return -1;
}

/** 换掉某个下标上的块。 */
function replaceBlock(state: TranscriptState, index: number, block: Block): TranscriptState {
  const blocks = [...state.blocks.slice(0, index), block, ...state.blocks.slice(index + 1)];
  return { ...state, blocks };
}

/** 末尾追加一个压缩块。 */
function appendCompaction(state: TranscriptState, info: CompactionInfo, at?: number): TranscriptState {
  const block: Block = { id: state.nextId, kind: 'compaction', text: '', streaming: false, at, compaction: info };
  return { ...state, blocks: [...freezeStreaming(state.blocks), block], nextId: state.nextId + 1 };
}

const EMPTY_COMPACTION: CompactionInfo = {
  phase: 'running', trigger: '', preTokens: 0, postTokens: 0, boundaryUuid: '', summary: '', error: '',
};

/** 压缩的各阶段合进同一块：开始建块，完成/失败改它，摘要按分界 uuid 认领。 */
function applyCompaction(state: TranscriptState, data: AgentCompaction, at?: number): TranscriptState {
  const index = lastCompactionIndex(state.blocks);
  const last = index >= 0 ? state.blocks[index] : undefined;
  const lastInfo = last?.compaction;

  // 只有进行中的块才是同一次压缩，已完成的那块不能把旧摘要带给新的一次
  const running = last !== undefined && lastInfo?.phase === 'running';
  const base = running ? lastInfo! : EMPTY_COMPACTION;

  switch (data.phase)
  {
    case 'started':
    {
      // 压缩中 CLI 每 30 秒重报一次，已有进行中的块就不再加
      return lastInfo?.phase === 'running' ? state : appendCompaction(state, EMPTY_COMPACTION, at);
    }

    case 'completed':
    {
      const done: CompactionInfo = {
        ...base,
        phase: 'done',
        trigger: data.trigger,
        preTokens: data.preTokens,
        postTokens: data.postTokens,
        boundaryUuid: data.boundaryUuid,
        error: '',
      };

      if (data.boundaryUuid !== '' && state.blocks.some((b) => b.compaction?.boundaryUuid === data.boundaryUuid))
      {
        return state;
      }

      // 压缩前的读数已作废，不等下一轮回复
      const compacted = { ...state, contextMeter: meterAfterCompaction(state.contextMeter, data.postTokens) };

      return running
        ? replaceBlock(compacted, index, { ...last!, compaction: done })
        : appendCompaction(compacted, done, at);
    }

    case 'failed':
    {
      const failed: CompactionInfo = { ...base, phase: 'failed', error: data.error };
      return running
        ? replaceBlock(state, index, { ...last!, compaction: failed })
        : appendCompaction(state, failed, at);
    }

    case 'summary':
    {
      const byUuid = data.boundaryUuid === ''
        ? -1
        : state.blocks.findIndex((b) => b.compaction?.boundaryUuid === data.boundaryUuid);
      const target = byUuid >= 0 ? byUuid : (lastInfo?.phase === 'done' ? index : -1);

      if (target < 0)
      {
        // 分界那条没回放到（被预算截掉），只剩摘要：照样给一块
        return appendCompaction(state, { ...EMPTY_COMPACTION, phase: 'done', summary: data.summary }, at);
      }

      const block = state.blocks[target];
      return replaceBlock(state, target, { ...block, compaction: { ...block.compaction!, summary: data.summary } });
    }

    default:
    {
      return state;
    }
  }
}

/**
 * 远程控制状态变了：记下来，并决定要不要在聊天区说一句。
 *
 * 用户点了开关：对这次点按的回话（requested）**每次都说**，结果是什么就说什么；
 * 等回话期间 CLI 自己推的中间状态只改颜色不说话——不然它先推一个「断开」，
 * 回话的「已关闭」就因为「前一个已经不是开着」被吞掉，点几次只看到一条。
 * 没人点时 CLI 推的变化（断线、策略变了）照旧：状态真变了才说。
 */
function applyRemoteControl(state: TranscriptState, data: AgentRemoteControl, at?: number): TranscriptState {
  const previous = state.remoteControl;
  const requested = data.requested === true;
  const remoteControl = {
    state: data.state,
    detail: data.detail,
    sessionUrl: data.sessionUrl !== '' ? data.sessionUrl : (data.state === 'connected' ? previous.sessionUrl : ''),
    seq: previous.seq + 1,
    pending: requested ? false : previous.pending,
  };
  const next = { ...state, remoteControl };

  if (!requested && previous.pending)
  {
    return next;
  }

  let textKey = '';
  let textArgs: Record<string, string> = {};

  if (data.state === 'connected' && (requested || previous.state !== 'connected'))
  {
    textKey = remoteControl.sessionUrl !== '' ? '远程控制已开启，可在手机或网页继续：{url}' : '远程控制已开启。';
    textArgs = { url: remoteControl.sessionUrl };
  }
  else if (REMOTE_FAILED.has(data.state)
    && (requested || !(REMOTE_FAILED.has(previous.state) && previous.detail === data.detail)))
  {
    textKey = '远程控制没开起来：{detail}';
    textArgs = { detail: data.detail !== '' ? data.detail : data.state };
  }
  else if (data.state === 'off' && (requested || previous.state === 'connected'))
  {
    textKey = '远程控制已关闭。';
  }

  if (textKey === '')
  {
    return next;
  }

  const notice: Block = {
    id: next.nextId,
    kind: 'notice',
    text: textKey.replace(/\{(\w+)\}/g, (_, name: string) => textArgs[name] ?? ''),
    textKey,
    textArgs,
    streaming: false,
    at,
  };
  return { ...next, blocks: [...freezeStreaming(next.blocks), notice], nextId: next.nextId + 1 };
}

/** 一轮结束时还在「压缩中」的块：说明没压完。 */
function settleCompaction(blocks: Block[]): Block[] {
  return blocks.map((b) => (b.compaction?.phase === 'running'
    ? { ...b, compaction: { ...b.compaction, phase: 'failed' as const } }
    : b));
}

/** 把单条 AgentEvent 应用到状态上（不含 userSent / replay 的外层动作）。 */
function applyAgentEvent(state: TranscriptState, event: AgentEvent): TranscriptState {
  switch (event.kind)
  {
    case 'SessionStarted':
    {
      // 每轮次都会重发，只刷新 session 和补全列表，绝不碰 blocks。
      const info = event.sessionInfo;
      if (!info)
      {
        return state;
      }

      // **按字段合并，不整体替换**：这个事件有多个来源、各自只带一部分内容，整体替换会把前一份清空。
      const merged = mergeSessionInfo(state.session, info);

      const slashCommands = withPanelCommands(withTuiCommands(withExtraCommands(
        withoutDeadCommands(merged.slashCommands))));

      const terminalCommands = withTuiCommands(
        mergeUnique(merged.slashCommands, merged.terminalSlashCommands));

      // 只有带非空且不同的 id 才算换会话；空 id 的来源不带身份，不能清计量。
      const switched = info.sessionId !== '' && info.sessionId !== state.session?.sessionId;
      const contextMeter = switched ? EMPTY_METER : state.contextMeter;

      return { ...state, session: merged, slashCommands, terminalCommands, contextMeter };
    }

    case 'AssistantText':
    case 'Thinking':
    {
      const next = appendText(state, textBlockKind(event.kind), event.content, eventTime(event));

      // 在**累积后的整块文本**上识别，而不是单条增量：
      const last = next.blocks[next.blocks.length - 1];
      const unavailable = last ? detectUnavailableCommand(last.text) : null;

      // 面板命令永远不记进不可用清单：CLI 说它不可用是对的——**在 CLI 那条管线里**确实不可用，
      if (!unavailable || !last)
      {
        return next;
      }

      // 同一块文本的后续增量会反复命中同一句拒绝，只有换了块或换了命令才算新的一次。
      const seen = next.lastUnavailable;
      const repeat = seen !== null && seen.blockId === last.id && seen.command === unavailable;

      const withNotice = repeat
        ? next
        : {
          ...next,
          lastUnavailable: {
            command: unavailable,
            blockId: last.id,
            seq: (seen?.seq ?? 0) + 1,
          },
        };

      // 面板命令**不**进补全的划掉清单：CLI 说它不可用是对的（在 CLI 那条管线里确实不可用），
      if (isPanelCommand(unavailable) || withNotice.unavailableCommands.includes(unavailable))
      {
        return withNotice;
      }

      return { ...withNotice, unavailableCommands: [...withNotice.unavailableCommands, unavailable] };
    }

    case 'ToolCallStarted':
    {
      const frozen = freezeStreaming(state.blocks);
      if (!event.toolCall)
      {
        return { ...state, blocks: frozen };
      }
      const toolBlock: Block = {
        id: state.nextId,
        kind: 'tool',
        text: '',
        tool: event.toolCall,
        streaming: true,
        at: eventTime(event),
      };
      return { ...state, blocks: [...frozen, toolBlock], nextId: state.nextId + 1 };
    }

    case 'ToolCallCompleted':
    {
      if (!event.toolCall)
      {
        return state;
      }
      // 存成局部常量：闭包里读 event.toolCall 会丢掉上面那次判空的收窄。
      const completed = event.toolCall;
      const toolUseId = completed.toolUseId;
      const blocks = state.blocks.map((b) =>
      {
        if (b.kind === 'tool' && b.tool && b.tool.toolUseId === toolUseId)
        {
          return {
            ...b,
            streaming: false,
            tool: {
              ...b.tool,
              resultText: completed.resultText,
              isError: completed.isError,
              durationMs: completed.durationMs,
              totalTokens: completed.totalTokens,
              done: true,
            },
          };
        }
        return b;
      });
      return { ...state, blocks };
    }

    case 'TurnCompleted':
    {
      const frozen = settleCompaction(freezeStreaming(state.blocks));
      const turn = event.turnResult ?? undefined;
      const turnBlock: Block = {
        id: state.nextId,
        kind: 'turnEnd',
        text: '',
        turn,
        streaming: false,
        at: eventTime(event),
      };
      const contextMeter = meterAfterTurn(state.contextMeter, event.turnResult ?? null);
      return { ...state, blocks: [...frozen, turnBlock], nextId: state.nextId + 1, busy: false, contextMeter };
    }

    case 'Failed':
    {
      // 出错也是一轮的终点：还在转圈的压缩块要收掉
      const frozen = settleCompaction(freezeStreaming(state.blocks));
      const errorBlock: Block = {
        id: state.nextId,
        kind: 'error',
        text: event.content,
        streaming: false,
        at: eventTime(event),
      };
      return { ...state, blocks: [...frozen, errorBlock], nextId: state.nextId + 1, busy: false };
    }

    case 'Notice':
    {
      const frozen = freezeStreaming(state.blocks);
      const noticeBlock: Block = {
        id: state.nextId,
        kind: 'notice',
        text: event.content,
        textKey: event.textKey,
        textArgs: event.textArgs,
        streaming: false,
        at: eventTime(event),
      };
      return { ...state, blocks: [...frozen, noticeBlock], nextId: state.nextId + 1 };
    }

    case 'UserPrompt':
    {
      // 不改 busy：回放历史时会连着来一串，置忙会让回放完的输入框是禁用的。
      const frozen = freezeStreaming(state.blocks);
      const userBlock: Block = {
        id: state.nextId,
        kind: 'user',
        text: event.content,
        streaming: false,
        at: eventTime(event),
      };

      return { ...state, blocks: [...frozen, userBlock], nextId: state.nextId + 1 };
    }

    case 'RateLimitUpdated':
    {
      const incoming = event.rateLimitData;
      if (!incoming)
      {
        return state;
      }

      const key = incoming.limitType || 'unknown';
      return { ...state, rateLimits: { ...state.rateLimits, [key]: incoming } };
    }

    case 'UsageUpdated':
    {
      // 不进转录，只更新缓存记录与上下文计量。
      const usage = event.usageData;
      if (!usage)
      {
        return state;
      }

      return {
        ...state,
        promptCache: nextCacheRecord(state.promptCache, usage),
        contextMeter: meterAfterUsage(state.contextMeter, usage),
      };
    }

    case 'AppliedSettings':
    {
      // 不进转录，只刷新开关状态。
      const applied = event.appliedSettings;
      return applied ? { ...state, ultracode: ultracodeFromApplied(applied) } : state;
    }

    case 'RemoteControlChanged':
    {
      return event.remoteControlData ? applyRemoteControl(state, event.remoteControlData, eventTime(event)) : state;
    }

    case 'Compaction':
    {
      return event.compactionData ? applyCompaction(state, event.compactionData, eventTime(event)) : state;
    }

    case 'HookProgress':
    {
      // hook 执行过程（如 SessionStart:startup · hook_started）是噪音，不进转录。
      return state;
    }

    case 'Raw':
    {
      const frozen = freezeStreaming(state.blocks);
      return {
        ...state,
        blocks: [...frozen, { id: state.nextId, kind: 'raw', text: event.content, streaming: false, at: eventTime(event) }],
        nextId: state.nextId + 1,
      };
    }

    default:
    {
      return state;
    }
  }
}

export function reducer(state: TranscriptState, action: Action): TranscriptState
{
  switch (action.type)
  {
    case 'remoteRequested':
    {
      return { ...state, remoteControl: { ...state.remoteControl, pending: true } };
    }

    case 'compactRequested':
    {
      const started: AgentCompaction = {
        phase: 'started', trigger: 'manual', preTokens: 0, postTokens: 0, durationMs: 0,
        boundaryUuid: '', summary: '', error: '',
      };
      return applyCompaction(state, started, action.at ?? Date.now());
    }

    case 'remoteRequestExpired':
    {
      return state.remoteControl.pending
        ? { ...state, remoteControl: { ...state.remoteControl, pending: false } }
        : state;
    }

    case 'accountCleared':
    {
      if (state.session === null)
      {
        return state;
      }

      const session = { ...state.session, accountEmail: '', accountOrganization: '', subscriptionType: '' };
      return { ...state, session };
    }

    case 'userSent':
    {
      const userBlock: Block = {
        id: state.nextId,
        kind: 'user',
        text: action.text,
        images: action.images,
        streaming: false,
        at: action.at ?? Date.now(),
      };
      const frozen = freezeStreaming(state.blocks);
      return { ...state, blocks: [...frozen, userBlock], nextId: state.nextId + 1, busy: true };
    }

    case 'agentEvent':
    {
      return applyAgentEvent(state, action.event);
    }

    case 'replay':
    {
      const replayed = action.events.reduce(applyAgentEvent, initialState);

      return { ...replayed, lastUnavailable: null };
    }

    case 'usage':
    {
      if (!state.session)
      {
        return state;
      }

      return {
        ...state,
        session: {
          ...state.session,
          usageWindows: action.usageWindows,
          usageRawText: action.usageRawText,
          usageCheckedAtUnixMs: Math.max(
            action.usageCheckedAtUnixMs ?? 0, state.session.usageCheckedAtUnixMs ?? 0),
        },
      };
    }

    default:
    {
      return state;
    }
  }
}
