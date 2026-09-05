// 工具调用摘要提取：把原始 inputJson 折叠成一行可读摘要，供工具卡片折叠态展示。

import type { AgentToolCall } from './types';

/** 折叠/展开态都要用到的新旧文本对，用于渲染 diff。 */
export interface DiffPair {
  filePath: string;
  oldText: string;
  newText: string;
}

/** 工具摘要：折叠态头部要展示的全部信息。 */
export interface ToolSummary {
  icon: string;
  title: string;
  detail: string;
  diff: DiffPair | null;
}

/** detail 字段上限，超出截断并加省略号。 */
const DETAIL_MAX_LEN = 80;

/** 把连续空白压成单空格，再截断到上限长度。 */
function clampDetail(raw: string): string {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= DETAIL_MAX_LEN)
  {
    return collapsed;
  }
  return collapsed.slice(0, DETAIL_MAX_LEN - 1) + '…';
}

/** 取路径里的文件名部分（同时兼容正斜杠与反斜杠）。 */
function fileName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

/** 解析 inputJson，失败时返回空对象——CLI 偶尔给出截断的输入，不能让整个转录崩掉。 */
function parseInput(inputJson: string): Record<string, unknown> {
  try
  {
    const parsed = JSON.parse(inputJson);
    if (parsed && typeof parsed === 'object')
    {
      return parsed as Record<string, unknown>;
    }
    return {};
  }
  catch
  {
    return {};
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** 根据工具名提取摘要信息。 */
export function summarizeTool(call: AgentToolCall): ToolSummary {
  const input = parseInput(call.inputJson);

  switch (call.name)
  {
    case 'Edit':
    {
      const filePath = asString(input.file_path);
      const oldText = asString(input.old_string);
      const newText = asString(input.new_string);
      return {
        icon: '✎',
        title: 'Edit',
        detail: clampDetail(fileName(filePath)),
        diff: { filePath, oldText, newText },
      };
    }

    case 'Write':
    {
      const filePath = asString(input.file_path);
      const content = asString(input.content);
      return {
        icon: '✚',
        title: 'Write',
        detail: clampDetail(fileName(filePath)),
        diff: { filePath, oldText: '', newText: content },
      };
    }

    case 'Read':
    {
      const filePath = asString(input.file_path);
      return {
        icon: '👁',
        title: 'Read',
        detail: clampDetail(fileName(filePath)),
        diff: null,
      };
    }

    case 'Bash':
    {
      const command = asString(input.command);
      return {
        icon: '▶',
        title: 'Bash',
        detail: clampDetail(command),
        diff: null,
      };
    }

    case 'Glob':
    case 'Grep':
    {
      const pattern = asString(input.pattern);
      return {
        icon: '🔍',
        title: call.name,
        detail: clampDetail(pattern),
        diff: null,
      };
    }

    default:
    {
      return {
        icon: '⚙',
        title: call.name,
        detail: '',
        diff: null,
      };
    }
  }
}
