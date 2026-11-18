import { describe, it, expect } from 'vitest';
import { EMPTY_METER, meterAfterTurn, meterAfterUsage, remainingRatio } from './contextMeter';
import { initialState, reducer } from './state';
import type { AgentCompaction, AgentEvent, AgentSessionInfo, AgentTurnResult, AgentUsage } from './types';

function usage(partial: Partial<AgentUsage>): AgentUsage
{
  return {
    inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
    costUsd: 0, durationMs: 0, ...partial,
  };
}

function evt(partial: Partial<AgentEvent>): AgentEvent
{
  return {
    kind: 'AssistantText', content: '', sessionInfo: null, toolCall: null, usageData: null,
    turnResult: null, rateLimitData: null, hookName: '', hookPhase: '', ...partial,
  };
}

function started(sessionId: string, autoCompactEnabled?: boolean | null): AgentEvent
{
  const info: AgentSessionInfo = {
    sessionId, model: '', cwd: '', permissionMode: '', cliVersion: '',
    tools: [], slashCommands: [], terminalSlashCommands: [], slashCommandInfos: [],
    skills: [], subAgents: [], mcpServers: [], capabilities: [], models: [],
    subscriptionType: '', effortLevel: '', availableModels: [], effortLevels: [],
    usageWindows: [], usageRawText: '',
  };

  // 不传就不带这个键：模拟只带一部分内容的会话事件
  if (autoCompactEnabled !== undefined)
  {
    info.autoCompactEnabled = autoCompactEnabled;
  }

  return evt({ kind: 'SessionStarted', sessionInfo: info });
}

function compaction(partial: Partial<AgentCompaction>): AgentEvent
{
  return evt({
    kind: 'Compaction',
    compactionData: {
      phase: 'completed', trigger: 'manual', preTokens: 0, postTokens: 0, durationMs: 0,
      boundaryUuid: '', summary: '', error: '', ...partial,
    },
  });
}

function turn(contextWindow?: number): AgentTurnResult
{
  return { contextWindow } as AgentTurnResult;
}

describe('上下文计量', () =>
{
  it('已用 56000、窗口 1000000 时剩余约 0.944', () =>
  {
    let m = meterAfterUsage(EMPTY_METER, usage({ inputTokens: 1000, cacheReadTokens: 50000, cacheCreationTokens: 5000 }));
    m = meterAfterTurn(m, turn(1000000));

    expect(m.usedTokens).toBe(56000);
    expect(remainingRatio(m)).toBeCloseTo(0.944, 3);
  });

  it('只有用量没有窗口时剩余未知', () =>
  {
    const m = meterAfterUsage(EMPTY_METER, usage({ inputTokens: 100 }));

    expect(remainingRatio(m)).toBeNull();
  });

  it('回合结果的窗口为 0 或缺失时不覆盖已有值', () =>
  {
    const m = { usedTokens: 10, window: 200000 };

    expect(meterAfterTurn(m, turn(0)).window).toBe(200000);
    expect(meterAfterTurn(m, turn(undefined)).window).toBe(200000);
    expect(meterAfterTurn(m, null).window).toBe(200000);
  });

  it('已用超过窗口时剩余为 0', () =>
  {
    expect(remainingRatio({ usedTokens: 300, window: 200 })).toBe(0);
  });
});

describe('上下文计量接进 reducer', () =>
{
  const withMeter = () =>
  {
    let s = reducer(initialState, { type: 'agentEvent', event: started('a') });
    s = reducer(s, { type: 'agentEvent', event: evt({ kind: 'UsageUpdated', usageData: usage({ inputTokens: 500 }) }) });
    return reducer(s, { type: 'agentEvent', event: evt({ kind: 'TurnCompleted', turnResult: turn(200000) }) });
  };

  it('用量与回合结果累积进 contextMeter', () =>
  {
    expect(withMeter().contextMeter).toEqual({ usedTokens: 500, window: 200000 });
  });

  it('SessionStarted 带不同 sessionId 时计量清空', () =>
  {
    const s = reducer(withMeter(), { type: 'agentEvent', event: started('b') });

    expect(s.contextMeter).toEqual(EMPTY_METER);
  });

  it('SessionStarted 同 sessionId 时计量保持', () =>
  {
    const s = reducer(withMeter(), { type: 'agentEvent', event: started('a') });

    expect(s.contextMeter).toEqual({ usedTokens: 500, window: 200000 });
  });

  it('SessionStarted 的 sessionId 为空时计量保持', () =>
  {
    const s = reducer(withMeter(), { type: 'agentEvent', event: started('') });

    expect(s.contextMeter).toEqual({ usedTokens: 500, window: 200000 });
  });

  it('压缩完成后已用量换成压缩后的 token 数，窗口保留', () =>
  {
    const s = reducer(withMeter(), { type: 'agentEvent', event: compaction({ preTokens: 500, postTokens: 120 }) });

    expect(s.contextMeter).toEqual({ usedTokens: 120, window: 200000 });
  });

  it('压缩完成但 CLI 没报压缩后用量时已用量变未知', () =>
  {
    const s = reducer(withMeter(), { type: 'agentEvent', event: compaction({ preTokens: 500, postTokens: 0 }) });

    expect(s.contextMeter).toEqual({ usedTokens: null, window: 200000 });
  });

  it('压缩开始与失败不动计量', () =>
  {
    let s = reducer(withMeter(), { type: 'agentEvent', event: compaction({ phase: 'started' }) });
    expect(s.contextMeter).toEqual({ usedTokens: 500, window: 200000 });

    s = reducer(s, { type: 'agentEvent', event: compaction({ phase: 'failed', error: 'x' }) });
    expect(s.contextMeter).toEqual({ usedTokens: 500, window: 200000 });
  });
});

describe('自动压缩开关跨 SessionStarted 合并', () =>
{
  const apply = (...events: AgentEvent[]) =>
    events.reduce((s, event) => reducer(s, { type: 'agentEvent', event }), initialState);

  it('关掉之后再来一条同样关掉的事件，仍是关', () =>
  {
    expect(apply(started('a', false), started('a', false)).session?.autoCompactEnabled).toBe(false);
  });

  it('关掉之后来一条不带这个键的事件，仍是关', () =>
  {
    expect(apply(started('a', false), started('a')).session?.autoCompactEnabled).toBe(false);
  });

  it('关掉之后宿主读失败报 null，仍是关', () =>
  {
    expect(apply(started('a', false), started('a', null)).session?.autoCompactEnabled).toBe(false);
  });

  it('关掉之后报开，变成开', () =>
  {
    expect(apply(started('a', false), started('a', true)).session?.autoCompactEnabled).toBe(true);
  });
});
