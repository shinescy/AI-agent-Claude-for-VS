// 能转后台的工具调用：当前这一轮里还在跑的 Bash / PowerShell / Agent / Task（与 VS Code 版同一组）。

import { createContext } from 'react';
import type { Block } from './state';
import type { AgentToolCall } from './types';

/** 可以转到后台运行的工具。 */
const BACKGROUNDABLE_TOOLS = ['Bash', 'PowerShell', 'Agent', 'Task'];

/** 这一个调用本身能不能转后台：工具对、还没出结果、有 id。 */
export function canBackground(tool: AgentToolCall): boolean
{
  const ok = BACKGROUNDABLE_TOOLS.includes(tool.name) && tool.done !== true && tool.toolUseId !== '';
  return ok;
}

/**
 * 找出可以转后台的工具调用 id。只看最后一条用户消息之后的块：
 * 被中断的旧调用永远等不到结果，不能让它们在下一轮又冒出来。
 */
export function backgroundableToolIds(blocks: Block[]): string[]
{
  let start = 0;

  for (let i = blocks.length - 1; i >= 0; i--)
  {
    if (blocks[i].kind === 'user')
    {
      start = i + 1;
      break;
    }
  }

  const ids = blocks
    .slice(start)
    .filter((block) => block.tool !== undefined && canBackground(block.tool))
    .map((block) => block.tool!.toolUseId);

  return ids;
}

/** 工具卡片上的「转到后台」。 */
export interface BackgroundAction
{
  /** 此刻能转后台的调用 id（会话忙、当前这一轮、还没出结果）。 */
  ids: Set<string>;
  run: (toolUseId: string) => void;
  /** 最近一次转后台失败的调用；seq 递增，卡片据此恢复按钮。 */
  failed: { id: string; seq: number } | null;
}

export const BackgroundContext = createContext<BackgroundAction | null>(null);
