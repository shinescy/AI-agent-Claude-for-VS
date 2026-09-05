// slash 命令名 → 面板 id 的截获表。

import { FALLBACK_COMMAND_NAMES } from './commandFallbacks';

/** 必须 Object.create(null) 起底：普通字面量会继承 Object.prototype，`/constructor` 之类会被误判成命中。 */
const PANEL_COMMANDS: Record<string, string> = Object.create(null);
PANEL_COMMANDS['plugin'] = 'plugin';
PANEL_COMMANDS['plugins'] = 'plugin';
PANEL_COMMANDS['mcp'] = 'mcp';
PANEL_COMMANDS['agents'] = 'agents';
PANEL_COMMANDS['doctor'] = 'doctor';
PANEL_COMMANDS['status'] = 'status';
// 以下三条是 2026-08-18 逐条实测后新接进来的：它们在 CLI 那边都回
PANEL_COMMANDS['resume'] = 'sessions';
PANEL_COMMANDS['sessions'] = 'sessions';
PANEL_COMMANDS['memory'] = 'memory';
PANEL_COMMANDS['help'] = 'commands';
PANEL_COMMANDS['commands'] = 'commands';
// /rewind 及其两个别名：CLI 声明 supportsNonInteractive: false，控制通道也没有对应 subtype，
PANEL_COMMANDS['rewind'] = 'fileHistory';
PANEL_COMMANDS['checkpoint'] = 'fileHistory';
PANEL_COMMANDS['undo'] = 'fileHistory';
// /permissions 与别名 /allowed-tools：CLI 两条都拒（实测 2026-08-19，CLI 2.1.235），
PANEL_COMMANDS['permissions'] = 'permissions';
PANEL_COMMANDS['allowed-tools'] = 'permissions';
// 这四条上一轮的处置表里写着「已集成」，但代码里其实没接——用户打了照样撞 CLI 的拒绝。
PANEL_COMMANDS['marketplace'] = 'plugin';
PANEL_COMMANDS['list-agents'] = 'agents';
PANEL_COMMANDS['peers'] = 'agents';
PANEL_COMMANDS['skills'] = 'status';
// /terminal 是本扩展自己加的入口（CLI 里没有这条命令）：开一个跑完整 TUI 的 claude。
PANEL_COMMANDS['terminal'] = 'terminal';

/** 不需要宿主取数的面板。 */
export const FRONTEND_ONLY_PANELS: string[] = ['status', 'commands', 'terminal'];

/** 该面板是否由前端自己渲染、不需要宿主取数。 */
export function isFrontendOnlyPanel(panelId: string): boolean {
  return FRONTEND_ONLY_PANELS.indexOf(panelId) >= 0;
}

/** 补全列表里要出现的规范名。 */
export const PANEL_COMMAND_NAMES: string[] = [
  'plugin', 'mcp', 'agents', 'doctor', 'status', 'resume', 'memory', 'help', 'rewind', 'permissions',
  // terminal 是本扩展自己加的命令，CLI 不会报它，不主动补进来补全里就永远没有。
  'terminal',
  'skills', 'list-agents',
];

/** 这个名字（不含前导斜杠）会不会被截获成面板。 */
export function isPanelCommand(name: string): boolean {
  return PANEL_COMMANDS[name] !== undefined;
}

/** 把面板命令并进 CLI 报来的补全清单。 */
export function withPanelCommands(commands: string[]): string[] {
  const merged = commands.filter((name) => !isPanelCommand(name));

  for (const name of PANEL_COMMAND_NAMES) {
    merged.push(name);
  }

  // 落点命令里**真能做事**的那几条也要出现在补全里（/copy /export /plan …）。
  for (const name of FALLBACK_COMMAND_NAMES) {
    if (merged.indexOf(name) < 0) {
      merged.push(name);
    }
  }

  return merged;
}

/** 该输入是否应截获成面板；不是则返回 null，照常发给 CLI。 */
export function panelIdForCommand(text: string): string | null {
  const trimmed = text.trim();

  if (!trimmed.startsWith('/')) {
    return null;
  }

  const name = trimmed.slice(1);

  if (!name || /\s/.test(name)) {
    return null;
  }

  return PANEL_COMMANDS[name] ?? null;
}
