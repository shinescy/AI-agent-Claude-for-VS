import { describe, it, expect } from 'vitest';
import { EXTRA_COMMANDS, withExtraCommands, withoutDeadCommands, isDeadCommand } from './extraCommands';
import { fallbackFor } from './commandFallbacks';
import { panelIdForCommand } from './panelCommands';
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

describe('CLI 漏报但实测能用的命令', () => {
  it('补进补全清单', () => {
    // 2026-08-18 实测（CLI 2.1.234）：这两条不在 CLI 报来的 82 条里，但都能正常执行。
    // 不补的话它们永远不出现在补全里，用户只能凭记忆手打。
    const merged = withExtraCommands(['usage', 'context']);

    expect(merged).toContain('cost');
    expect(merged).toContain('review');
  });

  it('CLI 已经报了的不再重复追加', () => {
    // CLI 哪天开始报这些命令时，补全里不该并排出现两个同名项。
    const merged = withExtraCommands(['cost', 'usage']);

    expect(merged.filter((c) => c === 'cost')).toHaveLength(1);
  });

  it('原有命令的顺序不被打乱', () => {
    const merged = withExtraCommands(['usage', 'context']);

    expect(merged.slice(0, 2)).toEqual(['usage', 'context']);
  });

  it('经 SessionStarted 走到状态里的补全清单', () => {
    // 端到端一遍：只测 withExtraCommands 的话，state.ts 里忘了接上仍会静默失效——
    // 表现是补全里照旧没有这两条，而没有任何报错。
    const s = reducer(initialState, {
      type: 'agentEvent',
      event: startedEvent(sessionInfo({ slashCommands: ['usage'] })),
    });

    for (const name of EXTRA_COMMANDS) {
      expect(s.slashCommands).toContain(name);
    }
  });
});

describe('CLI 报了但答案恒为死路的命令要从补全里去掉', () => {
  it('给机器调用的内部命令也不出现在补全里', () => {
    // 这三条是服务端/CLI 自己带标志位调用的，人手打只会拿到 error 或一坨 JSON。
    // 它们**确实**在补全里：打 /mo 时候选里就有 /__remote-workflow 与 /auto-mode-setup，
    // 所以「用户不会打」的假设不成立。
    for (const name of ['__remote-workflow', 'auto-mode-setup', 'workflow-launch-exec']) {
      expect(isDeadCommand(name), name).toBe(true);
      expect(withoutDeadCommands(['model', name])).toEqual(['model']);
    }
  });

  it('不带参数时给出用法提示的命令不算死路', () => {
    // /config /goal /name 打印的是人能看懂的用法，那是帮助。
    // 判据是「回答对人有没有用」，不是「文本里有没有 usage」。
    for (const name of ['config', 'goal', 'name', 'settings', 'context', 'usage', 'cost']) {
      expect(isDeadCommand(name), name).toBe(false);
    }
  });

  it('/fast 不出现在补全里', () => {
    // 实测（2026-08-18 CLI 2.1.234，2026-08-20 复核 2.1.235）：/fast 恒回
    // 「Fast mode unavailable: Fast mode is not available in the Agent SDK」。
    // 它不属于「被拒」那一类（CLI 确实接受了），所以 unavailableCommands 学不到，
    // 补全里就一直是个点了白跑一轮的入口。
    expect(withoutDeadCommands(['model', 'fast', 'usage'])).toEqual(['model', 'usage']);
    expect(isDeadCommand('fast')).toBe(true);
  });

  it('别的命令一个都不动', () => {
    const input = ['model', 'effort', 'usage', 'context', 'compact', 'review', 'cost'];

    expect(withoutDeadCommands(input)).toEqual(input);
    expect(isDeadCommand('usage')).toBe(false);
  });

  it('不截获：/fast 手打照样发给 CLI', () => {
    // 只从补全里去掉，不做截获——CLI 那句回答权威且自解释，
    // 将来 SDK 支持了 fast mode，截获会把它永久挡死。
    expect(fallbackFor('/fast')).toBeNull();
    expect(panelIdForCommand('/fast')).toBeNull();
  });
});
