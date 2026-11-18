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
  /** 标题里那个文件的完整路径，点它在 IDE 里打开；没有为空。 */
  filePath: string;
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

/** 工具卡片 IN 那一格要显示什么。 */
export interface ToolInputView {
  /** 跟在工具名后面的一句话（Agent 的任务名、Bash 的说明、Glob 的模式）；没有为空。 */
  headline: string;
  /** IN 框里的正文；为空就不画 IN 框。 */
  input: string;
  /** 查找类工具只占一行，结果点开才看。 */
  compact: boolean;
}

/** 只占一行的查找类工具。 */
const COMPACT_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'WebSearch', 'WebFetch', 'NotebookRead']);

/** 查找类工具那一行：`键: "值"`，只挑要紧的几个参数。 */
function inlineFields(input: Record<string, unknown>, keys: string[]): string {
  const parts = keys
    .map((key) => [key, input[key]] as const)
    .filter(([, value]) => typeof value === 'string' && value !== '')
    .map(([key, value]) => `${key}: "${value as string}"`);
  return clampDetail(parts.join(' '));
}

/** 输入参数逐项写成「键: 值」；嵌套的写成 JSON。 */
function describeFields(input: Record<string, unknown>): string {
  const lines = Object.entries(input)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
  return lines.join('\n');
}

/** 按工具类型挑出 IN 框的内容；Edit/Write 看 diff，Read 看标题里的文件名，都不画 IN。 */
export function toolInput(call: AgentToolCall): ToolInputView {
  const input = parseInput(call.inputJson);

  if (COMPACT_TOOLS.has(call.name))
  {
    // Read 的路径已经在标题的文件链接里
    const headline = call.name === 'Read' || call.name === 'NotebookRead'
      ? ''
      : call.name === 'WebFetch'
        ? clampDetail(asString(input.url))
        : inlineFields(input, ['pattern', 'query', 'path', 'glob']);
    return { headline, input: '', compact: true };
  }

  switch (call.name)
  {
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
    {
      return { headline: '', input: '', compact: false };
    }

    case 'Bash':
    {
      return { headline: clampDetail(asString(input.description)), input: asString(input.command), compact: false };
    }

    case 'Agent':
    case 'Task':
    {
      return { headline: clampDetail(asString(input.description)), input: asString(input.prompt), compact: false };
    }

    default:
    {
      return { headline: '', input: describeFields(input), compact: false };
    }
  }
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
        filePath,
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
        filePath,
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
        filePath,
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
        filePath: '',
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
        filePath: '',
        diff: null,
      };
    }

    default:
    {
      return {
        icon: '⚙',
        title: call.name,
        detail: '',
        filePath: '',
        diff: null,
      };
    }
  }
}
