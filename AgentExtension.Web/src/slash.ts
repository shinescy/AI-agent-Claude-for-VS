// slash 命令补全的纯逻辑部分：触发检测与候选过滤。

/** 检测光标处是否处于一个 slash 命令的输入中。 */
export function detectSlashQuery(text: string, caret: number): string | null {
  const beforeCaret = text.slice(0, caret);
  const lineStart = beforeCaret.lastIndexOf('\n') + 1;
  const line = beforeCaret.slice(lineStart);

  if (!line.startsWith('/'))
  {
    return null;
  }

  const query = line.slice(1);
  if (/\s/.test(query))
  {
    return null;
  }

  return query;
}

/** 按查询串过滤命令列表。 */
export function filterCommands(commands: string[], query: string): string[] {
  if (query === '')
  {
    return commands;
  }

  const q = query.toLowerCase();

  const prefixMatches: string[] = [];
  const otherMatches: string[] = [];

  for (const cmd of commands)
  {
    const lower = cmd.toLowerCase();
    const colonIndex = lower.indexOf(':');
    const afterColon = colonIndex >= 0 ? lower.slice(colonIndex + 1) : null;

    if (lower.startsWith(q) || (afterColon !== null && afterColon.startsWith(q)))
    {
      prefixMatches.push(cmd);
    }
    else if (lower.includes(q) || (afterColon !== null && afterColon.includes(q)))
    {
      otherMatches.push(cmd);
    }
  }

  return [...prefixMatches, ...otherMatches];
}
