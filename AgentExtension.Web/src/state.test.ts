import { describe, it, expect } from 'vitest';
import { initialState, reducer } from './state';
import type { AgentEvent } from './types';
import { withKnownTerminalOnly } from './commandCatalog';

function evt(partial: Partial<AgentEvent>): AgentEvent {
  return {
    kind: 'AssistantText',
    content: '',
    sessionInfo: null,
    toolCall: null,
    usageData: null,
    turnResult: null,
    rateLimitData: null,
    hookName: '',
    hookPhase: '',
    ...partial,
  };
}

describe('转录 reducer', () => {
  it('用户消息新建一个块', () => {
    const s = reducer(initialState, { type: 'userSent', text: '你好' });

    expect(s.blocks).toHaveLength(1);
    expect(s.blocks[0].kind).toBe('user');
    expect(s.blocks[0].text).toBe('你好');
  });

  it('连续文本增量追加到同一个块', () => {
    let s = reducer(initialState, { type: 'agentEvent', event: evt({ content: '你' }) });
    s = reducer(s, { type: 'agentEvent', event: evt({ content: '好' }) });

    expect(s.blocks).toHaveLength(1);
    expect(s.blocks[0].text).toBe('你好');
  });

  it('思考与正文分属不同块', () => {
    let s = reducer(initialState, { type: 'agentEvent', event: evt({ content: '正文' }) });
    s = reducer(s, { type: 'agentEvent', event: evt({ kind: 'Thinking', content: '思考' }) });

    expect(s.blocks).toHaveLength(2);
    expect(s.blocks[1].kind).toBe('thinking');
  });

  it('工具调用打断文本流，后续文本另起一块', () => {
    let s = reducer(initialState, { type: 'agentEvent', event: evt({ content: '前' }) });
    s = reducer(s, {
      type: 'agentEvent',
      event: evt({
        kind: 'ToolCallStarted',
        toolCall: { toolUseId: 't1', name: 'Edit', inputJson: '{}', resultText: '', isError: false },
      }),
    });
    s = reducer(s, { type: 'agentEvent', event: evt({ content: '后' }) });

    expect(s.blocks).toHaveLength(3);
    expect(s.blocks[2].text).toBe('后');
  });

  it('工具结果按 id 回填到对应的工具块', () => {
    let s = reducer(initialState, {
      type: 'agentEvent',
      event: evt({
        kind: 'ToolCallStarted',
        toolCall: { toolUseId: 't1', name: 'Edit', inputJson: '{}', resultText: '', isError: false },
      }),
    });
    s = reducer(s, {
      type: 'agentEvent',
      event: evt({
        kind: 'ToolCallCompleted',
        toolCall: { toolUseId: 't1', name: '', inputJson: '', resultText: '成功', isError: false },
      }),
    });

    expect(s.blocks).toHaveLength(1);
    expect(s.blocks[0].tool?.resultText).toBe('成功');
  });

  it('回填结果不会抹掉发起时的工具名与输入', () => {
    // ToolCallCompleted 只携带 toolUseId / resultText / isError，
    // name 与 inputJson 一律是空串（C# 侧 ParseUser 只填这三项）。
    // 整体展开合并会把它们覆盖掉，卡片跑完就退化成一个无名齿轮，
    // 摘要和 diff 也一起消失。
    let s = reducer(initialState, {
      type: 'agentEvent',
      event: evt({
        kind: 'ToolCallStarted',
        toolCall: {
          toolUseId: 't1',
          name: 'Edit',
          inputJson: '{"file_path":"a.ts","old_string":"x","new_string":"y"}',
          resultText: '',
          isError: false,
        },
      }),
    });
    s = reducer(s, {
      type: 'agentEvent',
      event: evt({
        kind: 'ToolCallCompleted',
        toolCall: { toolUseId: 't1', name: '', inputJson: '', resultText: '成功', isError: false },
      }),
    });

    expect(s.blocks[0].tool?.name).toBe('Edit');
    expect(s.blocks[0].tool?.inputJson).toContain('a.ts');
    expect(s.blocks[0].tool?.resultText).toBe('成功');
  });

  it('回填的错误标记要生效', () => {
    let s = reducer(initialState, {
      type: 'agentEvent',
      event: evt({
        kind: 'ToolCallStarted',
        toolCall: { toolUseId: 't1', name: 'Bash', inputJson: '{}', resultText: '', isError: false },
      }),
    });
    s = reducer(s, {
      type: 'agentEvent',
      event: evt({
        kind: 'ToolCallCompleted',
        toolCall: { toolUseId: 't1', name: '', inputJson: '', resultText: '炸了', isError: true },
      }),
    });

    expect(s.blocks[0].tool?.isError).toBe(true);
  });

  it('工具发起时标记为执行中', () => {
    const s = reducer(initialState, {
      type: 'agentEvent',
      event: evt({
        kind: 'ToolCallStarted',
        toolCall: { toolUseId: 't1', name: 'Bash', inputJson: '{}', resultText: '', isError: false },
      }),
    });

    expect(s.blocks[0].streaming).toBe(true);
  });

  it('结果为空串的工具也会解除执行中状态', () => {
    // 关键场景：跑一条没有输出的命令，resultText 就是空串。
    // 若用「resultText 为空」推断执行中，这张卡片会永远停在执行中。
    let s = reducer(initialState, {
      type: 'agentEvent',
      event: evt({
        kind: 'ToolCallStarted',
        toolCall: { toolUseId: 't1', name: 'Bash', inputJson: '{}', resultText: '', isError: false },
      }),
    });
    s = reducer(s, {
      type: 'agentEvent',
      event: evt({
        kind: 'ToolCallCompleted',
        toolCall: { toolUseId: 't1', name: '', inputJson: '', resultText: '', isError: false },
      }),
    });

    expect(s.blocks[0].streaming).toBe(false);
  });

  it('配额更新只进状态不进转录', () => {
    // 配额是持续状态而非事件；每轮往转录里插一条只会刷屏
    const s = reducer(initialState, {
      type: 'agentEvent',
      event: evt({
        kind: 'RateLimitUpdated',
        rateLimitData: {
          status: 'allowed_warning',
          limitType: 'seven_day',
          utilization: 0.87,
          resetsAt: 1786932000,
          isUsingOverage: false,
        },
      }),
    });

    expect(s.blocks).toHaveLength(0);
    expect(s.rateLimits.seven_day?.utilization).toBe(0.87);
    expect(s.rateLimits.seven_day?.limitType).toBe('seven_day');
  });

  it('不同窗口的配额各自保存不互相覆盖', () => {
    // CLI 会分别汇报五小时与七日两个窗口。只留最后一条的话，
    // 后到的会把前一条冲掉，界面上永远只看得见一个。
    let s = reducer(initialState, {
      type: 'agentEvent',
      event: evt({
        kind: 'RateLimitUpdated',
        rateLimitData: {
          status: 'allowed', limitType: 'five_hour',
          utilization: 0.3, resetsAt: 100, isUsingOverage: false,
        },
      }),
    });
    s = reducer(s, {
      type: 'agentEvent',
      event: evt({
        kind: 'RateLimitUpdated',
        rateLimitData: {
          status: 'allowed_warning', limitType: 'seven_day',
          utilization: 0.87, resetsAt: 200, isUsingOverage: false,
        },
      }),
    });

    expect(s.rateLimits.five_hour?.utilization).toBe(0.3);
    expect(s.rateLimits.seven_day?.utilization).toBe(0.87);
  });

  it('同一窗口的后续汇报覆盖前一条', () => {
    let s = reducer(initialState, {
      type: 'agentEvent',
      event: evt({
        kind: 'RateLimitUpdated',
        rateLimitData: {
          status: 'allowed', limitType: 'five_hour',
          utilization: 0.3, resetsAt: 100, isUsingOverage: false,
        },
      }),
    });
    s = reducer(s, {
      type: 'agentEvent',
      event: evt({
        kind: 'RateLimitUpdated',
        rateLimitData: {
          status: 'allowed', limitType: 'five_hour',
          utilization: 0.5, resetsAt: 100, isUsingOverage: false,
        },
      }),
    });

    expect(Object.keys(s.rateLimits)).toEqual(['five_hour']);
    expect(s.rateLimits.five_hour?.utilization).toBe(0.5);
  });

  it('缺窗口类型的配额归到 unknown 而不是丢弃', () => {
    const s = reducer(initialState, {
      type: 'agentEvent',
      event: evt({
        kind: 'RateLimitUpdated',
        rateLimitData: {
          status: 'allowed', limitType: '',
          utilization: 0.1, resetsAt: 0, isUsingOverage: false,
        },
      }),
    });

    expect(s.rateLimits.unknown?.utilization).toBe(0.1);
  });

  it('配额更新不改变忙碌状态', () => {
    let s = reducer(initialState, { type: 'userSent', text: '干活' });
    s = reducer(s, {
      type: 'agentEvent',
      event: evt({
        kind: 'RateLimitUpdated',
        rateLimitData: {
          status: 'allowed', limitType: 'seven_day',
          utilization: 0.1, resetsAt: 0, isUsingOverage: false,
        },
      }),
    });

    expect(s.busy).toBe(true);
  });

  it('缺少配额载荷时原样返回', () => {
    const s = reducer(initialState, {
      type: 'agentEvent',
      event: evt({ kind: 'RateLimitUpdated', rateLimitData: null }),
    });

    expect(s.rateLimits).toEqual({});
  });

  it('系统提示产生中性块而非错误块', () => {
    const s = reducer(initialState, {
      type: 'agentEvent',
      event: evt({ kind: 'Notice', content: '权限模式已切换为 自动' }),
    });

    expect(s.blocks).toHaveLength(1);
    expect(s.blocks[0].kind).toBe('notice');
    expect(s.blocks[0].text).toContain('权限模式已切换');
  });

  it('系统提示不解除忙碌状态', () => {
    // 提示来自宿主动作（切模型/切权限重启了会话），与轮次是否在跑无关。
    // 跟着解除忙碌会让按钮变回「发送」，用户以为本轮已结束。
    let s = reducer(initialState, { type: 'userSent', text: '干活' });
    expect(s.busy).toBe(true);

    s = reducer(s, { type: 'agentEvent', event: evt({ kind: 'Notice', content: '已重启会话' }) });

    expect(s.busy).toBe(true);
  });

  it('失败仍然解除忙碌状态', () => {
    let s = reducer(initialState, { type: 'userSent', text: '干活' });
    s = reducer(s, { type: 'agentEvent', event: evt({ kind: 'Failed', content: '炸了' }) });

    expect(s.blocks[s.blocks.length - 1].kind).toBe('error');
    expect(s.busy).toBe(false);
  });

  it('终端那份补全清单一条都不滤——被对话滤掉的正是终端能用的', () => {
    // 对话那份特意排除了 terminalSlashCommands，理由曾是「本扩展没有终端」。
    // 现在有了，而 color 这种「只能在终端用」的命令在终端里当然能用。
    // 用户的原话是「输入框的命令感知没了」：终端输入框拿着对话那份清单，
    // 恰恰把终端里最该补全的那批漏掉了。
    const s = reducer(initialState, {
      type: 'agentEvent',
      event: evt({
        kind: 'SessionStarted',
        sessionInfo: {
          sessionId: 's1', model: 'opus', cwd: '', permissionMode: '', cliVersion: '',
          tools: [], slashCommands: ['compact', 'clear', 'color'],
          terminalSlashCommands: ['color', 'vim'],
          slashCommandInfos: [],
          skills: [], subAgents: [], mcpServers: [], capabilities: [], models: [], subscriptionType: '', effortLevel: '', availableModels: [], effortLevels: [], usageWindows: [], usageRawText: '',
        },
      }),
    });

    expect(s.terminalCommands).toContain('color');
    expect(s.terminalCommands).toContain('compact');

    // CLI 只在 terminalSlashCommands 里报过的也要有。
    expect(s.terminalCommands).toContain('vim');

    // 去重：两份清单里都出现的只留一条，否则补全里会看见两个一模一样的项。
    expect(s.terminalCommands.filter((c) => c === 'color')).toHaveLength(1);

    // 本扩展自己造的入口不进这份：`/terminal` 是为了给管线用不了的命令一个出口而加的，
    // 真 TUI 里没有这条命令，补进去等于教用户敲一条终端不认的命令。
    expect(s.terminalCommands).not.toContain('terminal');

    // 但被本扩展接成面板的那些**不是**造出来的替身，它们本来就是 CLI 的命令
    // （2026-08-21 在真 TUI 的菜单里逐条验过），终端里能用，所以必须在这份里。
    // 此前这条断言反着写，把「面板命令」整类当成了虚构的东西。
    expect(s.terminalCommands).toContain('plugin');
    expect(s.terminalCommands).toContain('resume');
  });

  it('终端专属命令留在补全里，有原生面板的那些照样只出现一次', () => {
    // doctor 与 color 都是 CLI 说的「只能在终端用」，两者在这里的结局不同，但**都留着名字**：
    // color 在这条管线里做不成事，由弹层打「仅终端」标（withKnownTerminalOnly 负责）；
    // doctor 在本扩展里有原生面板，不打标。
    // 早先这里是「把 terminalSlashCommands 整批从补全里删掉」，代价是用户看到一份残缺的
    // 清单却毫无迹象，而且 doctor 被顺手删掉后要靠「补在删之后」才救得回来。
    const s = reducer(initialState, {
      type: 'agentEvent',
      event: evt({
        kind: 'SessionStarted',
        sessionInfo: {
          sessionId: 's1', model: 'opus', cwd: '', permissionMode: '', cliVersion: '',
          tools: [], slashCommands: ['compact', 'clear', 'doctor', 'color'],
          terminalSlashCommands: ['doctor', 'color'],
          slashCommandInfos: [],
          skills: [], subAgents: [], mcpServers: [], capabilities: [], models: [], subscriptionType: '', effortLevel: '', availableModels: [], effortLevels: [], usageWindows: [], usageRawText: '',
        },
      }),
    });

    expect(s.slashCommands).toContain('color');
    expect(s.slashCommands).toContain('compact');
    expect(s.slashCommands).toContain('clear');

    // 留着名字≠假装能用：打标那一步必须认得它。
    expect(withKnownTerminalOnly([], ['doctor', 'color'])).toContain('color');
    // doctor 有原生面板，在这里功能是全的，不能打标。
    expect(withKnownTerminalOnly([], ['doctor', 'color'])).not.toContain('doctor');

    // 四个面板命令一个都不能少，且各只出现一次。
    for (const name of ['plugin', 'mcp', 'agents', 'doctor'])
    {
      expect(s.slashCommands.filter((c) => c === name)).toHaveLength(1);
    }
  });

  it('CLI 报的面板命令别名不会与规范名并列出现', () => {
    // CLI 报 plugins、我们补 plugin，两个同义项并排出现在补全里只是噪音。
    const s = reducer(initialState, {
      type: 'agentEvent',
      event: evt({
        kind: 'SessionStarted',
        sessionInfo: {
          sessionId: 's1', model: 'opus', cwd: '', permissionMode: '', cliVersion: '',
          tools: [], slashCommands: ['plugins', 'compact'],
          terminalSlashCommands: [],
          slashCommandInfos: [],
          skills: [], subAgents: [], mcpServers: [], capabilities: [], models: [], subscriptionType: '', effortLevel: '', availableModels: [], effortLevels: [], usageWindows: [], usageRawText: '',
        },
      }),
    });

    expect(s.slashCommands).not.toContain('plugins');
    expect(s.slashCommands).toContain('plugin');
  });

  it('会话信息重发不清空已有转录', () => {
    let s = reducer(initialState, { type: 'userSent', text: '你好' });
    s = reducer(s, {
      type: 'agentEvent',
      event: evt({
        kind: 'SessionStarted',
        sessionInfo: {
          sessionId: 's1', model: 'opus', cwd: '', permissionMode: '', cliVersion: '',
          tools: [], slashCommands: [], terminalSlashCommands: [],
          slashCommandInfos: [],
          skills: [], subAgents: [], mcpServers: [], capabilities: [], models: [], subscriptionType: '', effortLevel: '', availableModels: [], effortLevels: [], usageWindows: [], usageRawText: '',
        },
      }),
    });

    expect(s.blocks).toHaveLength(1);
  });

  it('轮次开始置忙，结束解除', () => {
    let s = reducer(initialState, { type: 'userSent', text: '你好' });
    expect(s.busy).toBe(true);

    s = reducer(s, {
      type: 'agentEvent',
      event: evt({ kind: 'TurnCompleted', turnResult: { usage: null, wasInterrupted: false, permissionDenials: [] } }),
    });
    expect(s.busy).toBe(false);
  });

  it('重放从零重建状态', () => {
    const events = [
      evt({ content: '嗨' }),
      evt({ kind: 'TurnCompleted', turnResult: { usage: null, wasInterrupted: false, permissionDenials: [] } }),
    ];

    const s = reducer(initialState, { type: 'replay', events });

    // 助手文本块 + 轮次结尾块。结尾块承载耗时/token/成本，每轮都有，不是异常才有。
    expect(s.blocks).toHaveLength(2);
    expect(s.blocks[0].kind).toBe('assistant');
    expect(s.blocks[1].kind).toBe('turnEnd');
    expect(s.busy).toBe(false);
  });

  it('正常完成的轮次也有结尾块', () => {
    let s = reducer(initialState, { type: 'userSent', text: '你好' });
    s = reducer(s, { type: 'agentEvent', event: evt({ content: '回答' }) });
    s = reducer(s, {
      type: 'agentEvent',
      event: evt({
        kind: 'TurnCompleted',
        turnResult: {
          usage: {
            inputTokens: 10, outputTokens: 20, cacheReadTokens: 0,
            cacheCreationTokens: 0, costUsd: 0.001, durationMs: 1200,
          },
          wasInterrupted: false,
          permissionDenials: [],
        },
      }),
    });

    const last = s.blocks[s.blocks.length - 1];
    expect(last.kind).toBe('turnEnd');
    expect(last.turn?.usage?.durationMs).toBe(1200);
  });
});

describe('UserPrompt 事件', () => {
  it('产出一个用户块', () => {
    const state = reducer(initialState, {
      type: 'agentEvent',
      event: evt({ kind: 'UserPrompt', content: '上次问的那句' }),
    });

    expect(state.blocks).toHaveLength(1);
    expect(state.blocks[0].kind).toBe('user');
    expect(state.blocks[0].text).toBe('上次问的那句');
  });

  it('不把界面置成忙碌', () => {
    // 回放历史时会连着来一串 UserPrompt。置 busy 的话回放完输入框是禁用的，
    // 用户看到一屏历史却打不了字。busy 只由实时的 userSent 负责。
    const state = reducer(initialState, {
      type: 'agentEvent',
      event: evt({ kind: 'UserPrompt', content: '随便一句' }),
    });

    expect(state.busy).toBe(false);
  });

  it('回放一串历史事件后仍可输入', () => {
    const state = reducer(initialState, {
      type: 'replay',
      events: [
        evt({ kind: 'UserPrompt', content: '第一句' }),
        evt({ kind: 'UserPrompt', content: '第二句' }),
      ],
    });

    expect(state.busy).toBe(false);
    expect(state.blocks.map((b) => b.kind)).toEqual(['user', 'user']);
  });
});

describe('usage 广播 action', () => {
  const sessionInfo = {
    sessionId: 's1', model: 'opus', cwd: '', permissionMode: '', cliVersion: '',
    tools: [], slashCommands: [], terminalSlashCommands: [], slashCommandInfos: [],
    skills: [], subAgents: [], mcpServers: [], capabilities: [], models: [],
    subscriptionType: '', effortLevel: '', availableModels: [], effortLevels: [],
    usageWindows: [{ label: 'Current session', percentUsed: 10, resetsAtText: '', resetsAtUnix: 0, model: '' }],
    usageRawText: '旧原文',
  };

  it('只合并额度字段，不碰 sessionId / model', () => {
    let s = reducer(initialState, {
      type: 'agentEvent',
      event: evt({ kind: 'SessionStarted', sessionInfo }),
    });

    s = reducer(s, {
      type: 'usage',
      usageWindows: [{ label: 'Current session', percentUsed: 77, resetsAtText: '', resetsAtUnix: 0, model: '' }],
      usageRawText: '新原文',
    });

    expect(s.session?.usageWindows[0].percentUsed).toBe(77);
    expect(s.session?.usageRawText).toBe('新原文');
    expect(s.session?.sessionId).toBe('s1');
    expect(s.session?.model).toBe('opus');
  });

  it('这个 tab 还没起会话时忽略', () => {
    const s = reducer(initialState, {
      type: 'usage',
      usageWindows: [{ label: 'Current session', percentUsed: 50, resetsAtText: '', resetsAtUnix: 0, model: '' }],
      usageRawText: '不该生效',
    });

    expect(s.session).toBeNull();
  });
});
