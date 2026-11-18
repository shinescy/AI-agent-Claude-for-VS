// Ultracode 开关的纯逻辑：显示条件、状态折叠、强度档位取舍、菜单清单、发给宿主的消息。

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ULTRACODE_UNKNOWN, isUltracodeVisible, modelSupportsEffort, sliderEffortLevels,
  ultracodeFromApplied, ultracodeShownOn,
} from './ultracode';
import { initialState, reducer } from './state';
import { quickActions, isUltracodeItem } from './commandMenu';
import { sendUltracode } from './bridge';
import type { AgentEvent, AgentModelInfo, AppliedSettingsInfo } from './types';

const LEVELS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultracode'];

function applied(overrides: Partial<AppliedSettingsInfo> = {}): AppliedSettingsInfo {
  return {
    ultracodeAvailable: true, ultracodeRequested: false, ultracode: false,
    effort: 'medium', model: 'claude-fable-5-2',
    ...overrides,
  };
}

function appliedEvent(info: AppliedSettingsInfo): AgentEvent {
  return {
    kind: 'AppliedSettings', content: '', sessionInfo: null, toolCall: null, usageData: null,
    turnResult: null, rateLimitData: null, hookName: '', hookPhase: '', appliedSettings: info,
  };
}

function model(value: string, supportsEffort: boolean): AgentModelInfo {
  return {
    value, displayName: value, resolvedModel: `claude-${value}-1`, description: '',
    supportsEffort, supportedEffortLevels: supportsEffort ? ['low', 'high'] : [],
  };
}

describe('Ultracode 开关的显示条件', () => {
  it('CLI 明确报可用就显示，哪怕档位清单里没有 ultracode', () => {
    expect(isUltracodeVisible({ available: true, on: false }, ['low', 'high'], true)).toBe(true);
  });

  it('CLI 明确报不可用就不显示，哪怕档位清单里有 ultracode', () => {
    expect(isUltracodeVisible({ available: false, on: false }, LEVELS, true)).toBe(false);
  });

  it('CLI 没报可用性时保守兜底：档位清单里有 ultracode 才显示', () => {
    expect(isUltracodeVisible(ULTRACODE_UNKNOWN, LEVELS, true)).toBe(true);
    expect(isUltracodeVisible(ULTRACODE_UNKNOWN, ['low', 'medium', 'high'], true)).toBe(false);
    expect(isUltracodeVisible(ULTRACODE_UNKNOWN, [], true)).toBe(false);
  });

  it('当前型号不支持思考强度时不显示', () => {
    expect(isUltracodeVisible({ available: true, on: false }, LEVELS, false)).toBe(false);
  });

  it('型号支不支持强度按握手清单查，取值与解析后的全名都认；查不到不拦', () => {
    const reported = [model('opus', true), model('haiku', false)];

    expect(modelSupportsEffort('opus', reported)).toBe(true);
    expect(modelSupportsEffort('haiku', reported)).toBe(false);
    expect(modelSupportsEffort('claude-haiku-1', reported)).toBe(false);
    expect(modelSupportsEffort('default', reported)).toBe(true);
    expect(modelSupportsEffort('default', [])).toBe(true);
  });
});

describe('CLI 回报折成开关状态', () => {
  it('开关状态取 ultracodeRequested', () => {
    expect(ultracodeFromApplied(applied({ ultracodeRequested: true, ultracode: true })))
      .toEqual({ available: true, on: true });
    expect(ultracodeFromApplied(applied())).toEqual({ available: true, on: false });
  });

  it('不可用时一律算关', () => {
    expect(ultracodeFromApplied(applied({ ultracodeAvailable: false, ultracodeRequested: true })))
      .toEqual({ available: false, on: false });
  });

  it('旧 CLI 不报这两个字段：可用性未知，开关状态算「没说」', () => {
    const state = ultracodeFromApplied(applied({ ultracodeAvailable: null, ultracodeRequested: null }));

    expect(state).toEqual({ available: null, on: null });
    // 「没说」时界面沿用刚点的乐观值，不被这条回报冲掉。
    expect(ultracodeShownOn(state, true)).toBe(true);
    expect(ultracodeShownOn(state, null)).toBe(false);
  });

  it('刚点的乐观值优先于 CLI 上一次报的', () => {
    expect(ultracodeShownOn({ available: true, on: false }, true)).toBe(true);
    expect(ultracodeShownOn({ available: true, on: true }, null)).toBe(true);
  });
});

describe('转录状态里的 Ultracode', () => {
  it('AppliedSettings 事件只刷新开关状态，不往转录里加块', () => {
    const next = reducer(initialState, {
      type: 'agentEvent', event: appliedEvent(applied({ ultracodeRequested: true })),
    });

    expect(next.ultracode).toEqual({ available: true, on: true });
    expect(next.blocks).toEqual([]);
  });

  it('每次回报都是新对象，界面才知道该丢掉乐观值', () => {
    const first = reducer(initialState, { type: 'agentEvent', event: appliedEvent(applied()) });
    const second = reducer(first, { type: 'agentEvent', event: appliedEvent(applied()) });

    expect(second.ultracode).not.toBe(first.ultracode);
  });

  it('新会话 / 重启进程后的回放把开关复位成未知（即关）', () => {
    const on = reducer(initialState, {
      type: 'agentEvent', event: appliedEvent(applied({ ultracodeRequested: true })),
    });

    const reset = reducer(on, { type: 'replay', events: [] });

    expect(reset.ultracode).toEqual(ULTRACODE_UNKNOWN);
    expect(ultracodeShownOn(reset.ultracode, null)).toBe(false);
  });

  it('页面重建时的回放按日志里最后一次回报还原', () => {
    const replayed = reducer(initialState, {
      type: 'replay',
      events: [appliedEvent(applied()), appliedEvent(applied({ ultracodeRequested: true }))],
    });

    expect(replayed.ultracode).toEqual({ available: true, on: true });
  });
});

describe('强度滑轨的档位', () => {
  it('开关可见时去掉 ultracode 这一档', () => {
    expect(sliderEffortLevels(LEVELS, true, 'high')).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  });

  it('开关不可见时保持原样', () => {
    expect(sliderEffortLevels(LEVELS, false, 'high')).toEqual(LEVELS);
  });

  it('当前正停在 ultracode 档时留着它，滑块才有处落', () => {
    expect(sliderEffortLevels(LEVELS, true, 'ultracode')).toEqual(LEVELS);
  });
});

describe('命令菜单里的 Ultracode 行', () => {
  const t = (zh: string) => zh;

  it('不可用时不列出', () => {
    expect(quickActions(t).some(isUltracodeItem)).toBe(false);
    expect(quickActions(t, false).some(isUltracodeItem)).toBe(false);
  });

  it('可用时列在「模型」分组里「思考强度」的下一行', () => {
    const items = quickActions(t, true);
    const effortAt = items.findIndex((item) => item.kind === 'submenu' && item.command === 'effort');
    const row = items[effortAt + 1];

    expect(isUltracodeItem(row)).toBe(true);
    expect(row.label).toBe('Ultracode');
    expect(row.section).toBe(items[effortAt].section);
    expect(row.description).toBe('每个任务都用动态工作流编排（仅本次会话）');
  });
});

describe('发给宿主的 Ultracode 消息', () => {
  afterEach(() => {
    delete (window as unknown as { chrome?: unknown }).chrome;
  });

  it('走 setOption，option 是 ultracode，value 是字符串 true / false', () => {
    const postMessage = vi.fn();
    (window as unknown as { chrome: unknown }).chrome = {
      webview: { postMessage, addEventListener: vi.fn(), removeEventListener: vi.fn() },
    };

    sendUltracode(true);
    sendUltracode(false);

    expect(postMessage.mock.calls.map((call) => call[0])).toEqual([
      { type: 'setOption', option: 'ultracode', value: 'true' },
      { type: 'setOption', option: 'ultracode', value: 'false' },
    ]);
  });
});
