// 补全清单的两处修正：CLI 漏报但能用的（补进来），以及 CLI 报了但恒为死路的（去掉）。

/** 实测能用但 CLI 不报的命令名（不含前导斜杠）。 */
export const EXTRA_COMMANDS: string[] = ['cost', 'review'];

/** 把这些命令并进补全清单。 */
export function withExtraCommands(commands: string[]): string[] {
  const merged = [...commands];

  for (const name of EXTRA_COMMANDS) {
    if (merged.indexOf(name) < 0) {
      merged.push(name);
    }
  }

  return merged;
}

// 二、CLI 报进了补全、但在本管线下**答案恒为死路**的命令。
const DEAD_COMMANDS: string[] = ['fast', '__remote-workflow', 'auto-mode-setup', 'workflow-launch-exec'];

/** 从补全清单里去掉那些答案恒为死路的命令。 */
export function withoutDeadCommands(commands: string[]): string[] {
  return commands.filter((name) => DEAD_COMMANDS.indexOf(name) < 0);
}

/** 这个名字是否属于「CLI 接受但答案恒为死路」。 */
export function isDeadCommand(name: string): boolean {
  return DEAD_COMMANDS.indexOf(name) >= 0;
}
