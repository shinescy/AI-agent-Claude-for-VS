// 把「用法串」识别成可点的选项框。

/** 一个可渲染成选项框的用法串。 */
export interface CommandPicker {
  /** 命令名，不含前导斜杠。 */
  command: string;
  /** 可选值。 */
  options: string[];
}

// 命令名用 [^\s<]+ 而不是 [\w-]+：`\w` 只认 ASCII，那等于把「认形状不认名字」

/** `Usage: /effort <low|medium|high>` —— 竖线分隔的枚举 */
const PIPE_FORM = /Usage:\s*\/(?<cmd>[^\s<]+)\s*<(?<list>[^>]*\|[^>]*)>/;

/** `Usage: /model <name> */
const AVAILABLE_FORM = /Usage:\s*\/(?<cmd>[^\s<]+)[^\n]*?Available:\s*(?<list>[^\n]+)/;

/** 拆分清单。 */
function splitOptions(raw: string, separator: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const part of raw.split(separator))
  {
    const item = part.trim().replace(/[.。]$/, '');

    if (!item || item.includes(' ') || seen.has(item))
    {
      continue;
    }

    seen.add(item);
    result.push(item);
  }

  return result;
}

/** 从一段回复里识别用法串。 */
export function detectCommandPicker(text: string): CommandPicker | null {
  if (!text)
  {
    return null;
  }

  const pipe = PIPE_FORM.exec(text);
  if (pipe?.groups)
  {
    const options = splitOptions(pipe.groups.list, '|');
    if (options.length > 1)
    {
      return { command: pipe.groups.cmd, options };
    }
  }

  const available = AVAILABLE_FORM.exec(text);
  if (available?.groups)
  {
    const options = splitOptions(available.groups.list, ',');
    if (options.length > 1)
    {
      return { command: available.groups.cmd, options };
    }
  }

  return null;
}

/** 从 `/model` 的回复里取出当前值，用来在选项框里标出「当前」。 */
export function detectCurrentValue(text: string): string {
  const match = /Current\s+\w+:\s*(?<value>.+?)\s*(?:\(effort:[^)]*\))?\s*$/m.exec(text);
  return match?.groups?.value?.trim() ?? '';
}
