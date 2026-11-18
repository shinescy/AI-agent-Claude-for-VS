// 从转录里的工具调用推出「代理图」：主对话派出了哪些子代理、起了哪些后台任务。

import type { Block } from './state';

export type AgentStatus = 'running' | 'done' | 'failed' | 'stopped' | 'background';

/** 一个子代理。 */
export interface AgentNode {
  id: string;
  title: string;
  /** 子代理类型，如 Explore；没写是空串。 */
  agentType: string;
  status: AgentStatus;
  /** 派给它的任务原文。 */
  prompt: string;
  /** 它交回来的结果。 */
  result: string;
  durationMs: number;
  totalTokens: number;
  /** 它自己发起了多少次工具调用。 */
  toolUses: number;
}

/** 一个后台任务（放到后台跑的命令）。 */
export interface BackgroundTask {
  id: string;
  title: string;
  command: string;
  /** 启动时 CLI 的回话。 */
  result: string;
}

export interface AgentMap {
  agents: AgentNode[];
  tasks: BackgroundTask[];
  /** 还在跑的子代理数。 */
  running: number;
}

const AGENT_TOOLS = new Set(['Agent', 'Task']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

/** 解析工具输入；坏 JSON 当成空对象。 */
function parseInput(inputJson: string): Record<string, unknown> {
  try
  {
    const parsed: unknown = JSON.parse(inputJson);
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
  }
  catch
  {
    return {};
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** busy 为假时没交回结果的子代理算「已中断」。 */
export function buildAgentMap(blocks: readonly Block[], busy: boolean): AgentMap {
  const agents: AgentNode[] = [];
  const tasks: BackgroundTask[] = [];
  const childCounts = new Map<string, number>();

  for (const block of blocks)
  {
    const parent = block.tool?.parentToolUseId ?? '';

    if (block.kind === 'tool' && parent !== '')
    {
      childCounts.set(parent, (childCounts.get(parent) ?? 0) + 1);
    }
  }

  for (const block of blocks)
  {
    const tool = block.tool;

    if (block.kind !== 'tool' || !tool)
    {
      continue;
    }

    const input = parseInput(tool.inputJson);
    const background = input['run_in_background'] === true;

    if (AGENT_TOOLS.has(tool.name))
    {
      const agentType = text(input['subagent_type']);
      let status: AgentStatus = 'running';

      if (tool.isError)
      {
        status = 'failed';
      }
      else if (background)
      {
        status = 'background';
      }
      else if (tool.done)
      {
        status = 'done';
      }
      else if (!busy)
      {
        status = 'stopped';
      }

      agents.push({
        id: tool.toolUseId,
        title: text(input['description']) || agentType || tool.name,
        agentType,
        status,
        prompt: text(input['prompt']),
        result: tool.resultText,
        durationMs: tool.durationMs ?? 0,
        totalTokens: tool.totalTokens ?? 0,
        toolUses: childCounts.get(tool.toolUseId) ?? 0,
      });

      continue;
    }

    if (SHELL_TOOLS.has(tool.name) && background)
    {
      const command = text(input['command']);

      tasks.push({
        id: tool.toolUseId,
        title: text(input['description']) || command,
        command,
        result: tool.resultText,
      });
    }
  }

  return {
    agents,
    tasks,
    running: agents.filter((agent) => agent.status === 'running').length,
  };
}

/** 把毫秒写成 22s、3m 5s、1h 2m。 */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));

  if (seconds < 60)
  {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60)
  {
    return `${minutes}m ${seconds % 60}s`;
  }

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
