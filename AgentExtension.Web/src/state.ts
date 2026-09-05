// 转录状态管理：把宿主下发的事件流折叠成可渲染的块列表。

import type {
  AgentEvent,
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

/** 块类型。 */
export type BlockKind =
  | 'user' | 'assistant' | 'thinking' | 'tool'
  | 'error' | 'notice' | 'hook' | 'raw' | 'turnEnd';

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
  /** 是否仍在接收增量；只有流式块需要重渲染，已冻结的块可以跳过。 */
  streaming: boolean;
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
  nextId: number;
}

export const initialState: TranscriptState = {
  blocks: [],
  busy: false,
  session: null,
  slashCommands: [],
  terminalCommands: [],
  unavailableCommands: [],
  lastUnavailable: null,
  rateLimits: {},
  nextId: 1,
};

export type Action =
  | { type: 'userSent'; text: string }
  | { type: 'agentEvent'; event: AgentEvent }
  | { type: 'replay'; events: AgentEvent[] }
  // 别的 tab 广播来的额度快照；session 为 null（这个 tab 还没起会话）时忽略。
  | { type: 'usage'; usageWindows: UsageWindow[]; usageRawText: string };

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
    subscriptionType: pick(incoming.subscriptionType, previous.subscriptionType, emptyStr),
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
  };
}

/** 把所有流式块冻结（streaming = false），其余保持不变。 */
function freezeStreaming(blocks: Block[]): Block[] {
  return blocks.map((b) => (b.streaming ? { ...b, streaming: false } : b));
}

/** 把某个 kind 对应的事件 kind 映射成块 kind（仅处理会产生文本块的两种事件）。 */
function textBlockKind(eventKind: AgentEvent['kind']): BlockKind {
  return eventKind === 'Thinking' ? 'thinking' : 'assistant';
}

/** 追加/合并一条文本增量：末尾块同类型且仍在流式中就追加，否则新建一块。 */
function appendText(state: TranscriptState, kind: BlockKind, text: string): TranscriptState {
  const last = state.blocks[state.blocks.length - 1];

  if (last && last.kind === kind && last.streaming)
  {
    const updatedBlock: Block = { ...last, text: last.text + text };
    const blocks = [...state.blocks.slice(0, -1), updatedBlock];
    return { ...state, blocks };
  }

  const newBlock: Block = { id: state.nextId, kind, text, streaming: true };
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

      return { ...state, session: merged, slashCommands, terminalCommands };
    }

    case 'AssistantText':
    case 'Thinking':
    {
      const next = appendText(state, textBlockKind(event.kind), event.content);

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
            },
          };
        }
        return b;
      });
      return { ...state, blocks };
    }

    case 'TurnCompleted':
    {
      const frozen = freezeStreaming(state.blocks);
      const turn = event.turnResult ?? undefined;
      const turnBlock: Block = {
        id: state.nextId,
        kind: 'turnEnd',
        text: '',
        turn,
        streaming: false,
      };
      return { ...state, blocks: [...frozen, turnBlock], nextId: state.nextId + 1, busy: false };
    }

    case 'Failed':
    {
      const frozen = freezeStreaming(state.blocks);
      const errorBlock: Block = {
        id: state.nextId,
        kind: 'error',
        text: event.content,
        streaming: false,
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

    case 'HookProgress':
    {
      const frozen = freezeStreaming(state.blocks);
      const label = event.hookName
        ? `${event.hookName} · ${event.hookPhase}`
        : event.hookPhase;

      return {
        ...state,
        blocks: [...frozen, { id: state.nextId, kind: 'hook', text: label, streaming: false }],
        nextId: state.nextId + 1,
      };
    }

    case 'Raw':
    {
      const frozen = freezeStreaming(state.blocks);
      return {
        ...state,
        blocks: [...frozen, { id: state.nextId, kind: 'raw', text: event.content, streaming: false }],
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
    case 'userSent':
    {
      const userBlock: Block = {
        id: state.nextId,
        kind: 'user',
        text: action.text,
        streaming: false,
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
        },
      };
    }

    default:
    {
      return state;
    }
  }
}
