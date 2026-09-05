// TUI 的命令目录：CLI 交互式界面里列出、而 --print 握手**不报**的那些命令。

import { isPanelCommand } from './panelCommands';
import { FALLBACK_COMMAND_NAMES } from './commandFallbacks';

/** TUI 菜单里列出、而 --print 握手不报的命令（不含前导斜杠）。 */
export const TUI_ONLY_COMMANDS: string[] = [
  'add-dir', 'advisor', 'artifact-capabilities', 'artifact-design', 'artifact-diagramming',
  'artifacts', 'autofix-pr', 'background', 'branch', 'btw', 'bug', 'cd', 'chrome',
  'claude-in-chrome', 'copy', 'design-login', 'diff', 'exit', 'export', 'feedback', 'focus',
  'fork', 'help', 'hooks', 'ide', 'install', 'install-github-app', 'install-slack-app',
  'keybindings', 'login', 'logout', 'memory', 'mobile', 'passes', 'permissions', 'plan',
  'plugin', 'powerup', 'privacy-settings', 'radio', 'release-notes', 'reload-plugins',
  'remote-control', 'remote-env', 'resume', 'rewind', 'skills', 'status', 'statusline',
  'stickers', 'subtask', 'tasks', 'teleport', 'terminal-setup', 'theme', 'tui', 'update',
  'upgrade', 'voice', 'web-setup', 'workflows',
];

/** 二进制里有声明、但 TUI 菜单**不列**的名字。 */
export const HIDDEN_FROM_MENU: string[] = [
  'brief', 'daemon', 'desktop', 'loops', 'mcp__', 'pause-memory', 'pro-trial-expired',
  'rate-limit-options', 'sandbox', 'scroll-speed', 'session', 'setup-bedrock', 'setup-vertex',
  'skill-doctor', 'stop', 'ultraplan', 'version', 'wellbeing',
];

/** 把 TUI 目录并进补全清单。 */
export function withTuiCommands(commands: string[]): string[] {
  const merged = [...commands];

  for (const name of TUI_ONLY_COMMANDS) {
    if (merged.indexOf(name) < 0) {
      merged.push(name);
    }
  }

  return merged;
}

/** 在**对话**那一路，这条命令要不要标「仅终端」。 */
export function isTerminalOnly(name: string): boolean {
  if (TUI_ONLY_COMMANDS.indexOf(name) < 0) {
    return false;
  }

  return shouldTagAsTerminalOnly(name);
}

/** 把已知的「仅终端」并进实测学来的不可用清单，供弹层打标。 */
export function withKnownTerminalOnly(learned: string[], reportedTerminalOnly: string[] = []): string[] {
  const merged = [...learned];

  for (const name of [...TUI_ONLY_COMMANDS, ...reportedTerminalOnly]) {
    if (shouldTagAsTerminalOnly(name) && merged.indexOf(name) < 0) {
      merged.push(name);
    }
  }

  return merged;
}

/** 这个名字该不该打「仅终端」——只看「在这里做不成它本来的事」，不看它是从哪知道的。 */
function shouldTagAsTerminalOnly(name: string): boolean {
  if (isPanelCommand(name)) {
    return false;
  }

  return FALLBACK_COMMAND_NAMES.indexOf(name) < 0;
}
