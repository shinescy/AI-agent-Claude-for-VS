// 把扁平的转录块按「轮次」分组：一条用户消息，加上它之后到下一条用户消息之前的所有块。

import type { Block } from './state';

export interface TurnGroup
{
  /** React key。 */
  key: string;

  /** 领头的那条用户消息。 */
  head: Block | null;

  /** 这一轮里除领头消息之外的块，顺序不变。 */
  body: Block[];
}

/** 开头那段（还没有任何用户消息）的固定 key。 */
export const LEAD_KEY = 'turn-lead';

export function groupTurns(blocks: Block[]): TurnGroup[]
{
  const groups: TurnGroup[] = [];

  for (const block of blocks)
  {
    if (block.kind === 'user')
    {
      groups.push({ key: String(block.id), head: block, body: [] });
      continue;
    }

    if (groups.length === 0)
    {
      groups.push({ key: LEAD_KEY, head: null, body: [] });
    }

    groups[groups.length - 1].body.push(block);
  }

  return groups;
}

/** 钉在顶部时显示的那一行。 */
export function pinnedLabel(text: string, prompt = ''): string
{
  const collapsed = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join(' ');

  return stripLeading(collapsed, prompt);
}

/** 剥掉开头那段提示词，**比对时忽略一切空白**。 */
function stripLeading(text: string, prompt: string): string
{
  const target = prompt.replace(/\s+/g, '');

  if (target === '')
  {
    return text;
  }

  let seen = 0;
  let i = 0;

  for (; i < text.length && seen < target.length; i++)
  {
    const ch = text[i];

    if (/\s/.test(ch))
    {
      continue;
    }

    if (ch !== target[seen])
    {
      return text;
    }

    seen += 1;
  }

  if (seen < target.length)
  {
    return text;
  }

  const rest = text.slice(i).trim();

  return rest === '' ? text : rest;
}
