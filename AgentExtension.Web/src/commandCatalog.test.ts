import { describe, it, expect } from 'vitest';
import {
  HIDDEN_FROM_MENU,
  TUI_ONLY_COMMANDS,
  isTerminalOnly,
  withKnownTerminalOnly,
  withTuiCommands,
} from './commandCatalog';
import { hasFallback, rejectionNoteFor } from './commandFallbacks';
import { isPanelCommand } from './panelCommands';
import { initialState, reducer } from './state';
import type { AgentEvent, AgentSessionInfo } from './types';

function sessionInfo(partial: Partial<AgentSessionInfo>): AgentSessionInfo {
  return {
    sessionId: 's1', model: '', cwd: '', permissionMode: '', cliVersion: '',
    tools: [], slashCommands: [], terminalSlashCommands: [],
    mcpServers: [], models: [], effortLevels: [], effort: '',
    subscriptionType: '', apiKeySource: '', outputStyle: '',
    agents: [], skills: [], plugins: [], memoryPaths: [],
    ...partial,
  } as AgentSessionInfo;
}

function startedEvent(info: AgentSessionInfo): AgentEvent {
  return {
    kind: 'SessionStarted', content: '', sessionInfo: info, toolCall: null,
    usageData: null, turnResult: null, rateLimitData: null,
    hookName: '', hookPhase: '',
  } as AgentEvent;
}

/**
 * TUI 命令目录。
 * <p>
 * 守的是「补全比 TUI 少一大截」这件事：补全的唯一来源是 --print 握手，而握手报的是
 * **这条管线的**命令空间（2.1.238 报 84 条），比 TUI 菜单少 61 条。表现是终端输入框
 * 下面白纸黑字写着「终端里能用的全部命令」，实际少了一多半，且没有任何迹象。
 * </p>
 */
describe('TUI 命令目录', () => {
  // #region 清单本身

  it('目录里没有重复项', () => {
    expect(new Set(TUI_ONLY_COMMANDS).size).toBe(TUI_ONLY_COMMANDS.length);
  });

  it('藏起来的名字一条都不进目录', () => {
    // 「二进制里有声明」≠「TUI 菜单里有」。菜单不推荐的，补全也别推荐——
    // 否则用户点中一条 CLI 自己都藏起来的命令，最好的结果也只是一句解释。
    for (const name of HIDDEN_FROM_MENU) {
      expect(TUI_ONLY_COMMANDS).not.toContain(name);
    }
  });

  it('目录里不放别名', () => {
    // 照抄 TUI 自己的做法：实测输入 /break 得到「No commands match」，
    // /cost /version 同样不在菜单里，尽管三者都是能执行的别名。
    for (const alias of ['cost', 'stats', 'settings', 'continue', 'undo', 'plugins', 'breaks', 'bg']) {
      expect(TUI_ONLY_COMMANDS).not.toContain(alias);
    }
  });

  // #endregion

  // #region 并进补全

  it('终端补全拿到握手不报的那批', () => {
    const merged = withTuiCommands(['compact', 'model']);

    for (const name of ['theme', 'hooks', 'resume', 'export', 'workflows', 'login']) {
      expect(merged).toContain(name);
    }
  });

  it('握手已经报了的不再重复追加', () => {
    // CLI 哪天把某条报进握手清单时，补全里不该并排出现两个同名项。
    const merged = withTuiCommands(['theme', 'compact']);

    expect(merged.filter((name) => name === 'theme')).toHaveLength(1);
  });

  it('终端那一路的补全把目录并了进去', () => {
    // 这条是真正的回归：此前终端补全 = 握手那 84 条，而终端里能用的远不止。
    const next = reducer(initialState, {
      type: 'agentEvent',
      event: startedEvent(sessionInfo({
        slashCommands: ['compact', 'model'],
        terminalSlashCommands: ['doctor', 'color'],
      })),
    });

    for (const name of ['theme', 'permissions', 'workflows', 'exit']) {
      expect(next.terminalCommands).toContain(name);
    }
  });

  it('接到别人面板上的命令不会被吃掉', () => {
    // 真机上数出来的：withPanelCommands 先滤掉所有被截获的名字，再补回一张**规范名表**，
    // 而 /skills（→状态面板）与 /list-agents（→后台代理面板）当时不在那张表里，
    // 于是两条完全可用的命令从补全里整个消失，且界面上毫无迹象。
    const next = reducer(initialState, {
      type: 'agentEvent',
      event: startedEvent(sessionInfo({
        slashCommands: ['compact', 'list-agents'], terminalSlashCommands: [],
      })),
    });

    expect(next.slashCommands).toContain('skills');
    expect(next.slashCommands).toContain('list-agents');
  });

  it('CLI 说的仅终端命令留在补全里而不是被删掉', () => {
    // 删了名字就从补全里消失，用户看到的是一份残缺的清单；标了则既找得到、又知道该去哪用。
    const next = reducer(initialState, {
      type: 'agentEvent',
      event: startedEvent(sessionInfo({
        slashCommands: ['compact', 'color'], terminalSlashCommands: ['color'],
      })),
    });

    expect(next.slashCommands).toContain('color');
    expect(withKnownTerminalOnly([], ['color'])).toContain('color');
  });

  it('对话那一路也拿得到名字', () => {
    // 在这儿多半做不成本来的事，但补全里有名字才找得到，弹层会给它们打「仅终端」。
    const next = reducer(initialState, {
      type: 'agentEvent',
      event: startedEvent(sessionInfo({ slashCommands: ['compact'], terminalSlashCommands: [] })),
    });

    expect(next.slashCommands).toContain('theme');
    expect(next.slashCommands).toContain('workflows');
  });

  // #endregion

  // #region 打标

  it('只有说明的那些标成仅终端', () => {
    expect(isTerminalOnly('theme')).toBe(true);
    expect(isTerminalOnly('teleport')).toBe(true);
    expect(isTerminalOnly('login')).toBe(true);
  });

  it('被面板接管的不标', () => {
    // 它们在这里功能是全的，标出去会让人以为面板没生效。
    for (const name of ['help', 'resume', 'memory', 'permissions', 'rewind', 'plugin', 'status']) {
      expect(isTerminalOnly(name)).toBe(false);
    }
  });

  it('有真动作落点的不标', () => {
    for (const name of ['copy', 'export', 'plan', 'add-dir', 'hooks', 'branch']) {
      expect(isTerminalOnly(name)).toBe(false);
    }
  });

  it('目录之外的名字一律不标', () => {
    expect(isTerminalOnly('compact')).toBe(false);
    expect(isTerminalOnly('model')).toBe(false);
  });

  it('与实测学来的那份合并且去重', () => {
    const merged = withKnownTerminalOnly(['theme', 'somethingelse']);

    expect(merged).toContain('somethingelse');
    expect(merged.filter((name) => name === 'theme')).toHaveLength(1);
  });

  // #endregion

  // #region 落点

  it('目录里每一条都有落点或专门的拒绝说明', () => {
    // 补全里推荐一条命令，就得为「点了之后」负责：要么这里能做（面板/动作），
    // 要么有一句具体说明，要么 CLI 拒了之后能补上专门说明。
    // 三样都没有＝把用户送去撞 CLI 那句没有下文的干话。
    const naked = TUI_ONLY_COMMANDS.filter(
      (name) => !hasFallback(name) && !isPanelCommand(name)
        && rejectionNoteFor(name) === rejectionNoteFor('这个名字肯定不在表里'));

    expect(naked).toEqual([]);
  });

  // #endregion
});
