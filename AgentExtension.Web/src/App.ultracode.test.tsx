// Ultracode 开关在 App 层的接线：宿主回报 → 两处开关 → 点击发给宿主的消息。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import App from './App';
import { OUTBOUND } from './protocol';
import { LANG_STORAGE_KEY } from './i18n';

const posted: unknown[] = [];

let emit: ((data: unknown) => void) | null = null;

beforeEach(() => {
  window.localStorage.setItem(LANG_STORAGE_KEY, 'zh');
  posted.length = 0;
  emit = null;

  (window as unknown as { chrome?: unknown }).chrome = {
    webview: {
      postMessage: (m: unknown) => { posted.push(m); },
      addEventListener: (_t: string, handler: (e: MessageEvent) => void) => {
        emit = (data: unknown) => handler({ data } as MessageEvent);
      },
      removeEventListener: () => {},
    },
  };
});

afterEach(() => {
  window.localStorage.removeItem(LANG_STORAGE_KEY);
  delete (window as unknown as { chrome?: unknown }).chrome;
});

const EVENT_BASE = {
  content: '', sessionInfo: null, toolCall: null, usageData: null, turnResult: null,
  rateLimitData: null, hookName: '', hookPhase: '',
};

/** 会话起来了：档位清单里带 ultracode，握手报的型号支持强度。 */
function pushSession(effortLevels: string[], supportsEffort = true): void {
  act(() => {
    emit?.({
      type: OUTBOUND.Event,
      payload: {
        ...EVENT_BASE,
        kind: 'SessionStarted',
        sessionInfo: {
          sessionId: 's1', model: 'default', cwd: 'F:/proj',
          permissionMode: 'acceptEdits', cliVersion: '2.1.325',
          tools: [], slashCommands: [], slashCommandInfos: [], terminalSlashCommands: [],
          skills: [], subAgents: [], mcpServers: [], capabilities: [],
          models: [{
            value: 'default', displayName: 'Default', resolvedModel: 'claude-fable-5-2', description: '',
            supportsEffort, supportedEffortLevels: supportsEffort ? ['low', 'medium', 'high'] : [],
          }],
          subscriptionType: '', effortLevel: 'high',
          availableModels: [], effortLevels,
          usageWindows: [], usageRawText: '',
        },
      },
    });
  });
}

/** 宿主转来 CLI 的 get_settings 回报。 */
function pushApplied(available: boolean | null, requested: boolean | null): void {
  act(() => {
    emit?.({
      type: OUTBOUND.Event,
      payload: {
        ...EVENT_BASE,
        kind: 'AppliedSettings',
        appliedSettings: {
          ultracodeAvailable: available, ultracodeRequested: requested,
          ultracode: requested === true, effort: 'high', model: 'claude-fable-5-2',
        },
      },
    });
  });
}

function ultracodeMessages(): unknown[] {
  return posted.filter((m) => (m as { option?: string }).option === 'ultracode');
}

function openModePopup(container: HTMLElement): HTMLElement {
  fireEvent.click(container.querySelector('.status-bar .mode-button')!);
  return container.querySelector('.mode-popup') as HTMLElement;
}

const LEVELS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultracode'];

describe('App 的 Ultracode 接线', () => {
  it('CLI 报可用：弹层里有开关，点它发 setOption 并立刻显示为开', () => {
    const { container } = render(<App />);
    pushSession(LEVELS);
    pushApplied(true, false);

    const popup = openModePopup(container);
    const toggle = popup.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(toggle);

    expect(ultracodeMessages()).toEqual([{ type: 'setOption', option: 'ultracode', value: 'true' }]);
    expect(container.querySelector('.mode-popup [role="switch"]')!.getAttribute('aria-checked')).toBe('true');
  });

  it('以宿主回报为准：CLI 说没开成，开关退回关', () => {
    const { container } = render(<App />);
    pushSession(LEVELS);
    pushApplied(true, false);

    const popup = openModePopup(container);
    fireEvent.click(popup.querySelector('[role="switch"]')!);
    pushApplied(true, false);

    expect(container.querySelector('.mode-popup [role="switch"]')!.getAttribute('aria-checked')).toBe('false');
  });

  it('开着时再点发的是 false', () => {
    const { container } = render(<App />);
    pushSession(LEVELS);
    pushApplied(true, true);

    const popup = openModePopup(container);
    const toggle = popup.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(toggle.className).toContain('is-on');

    fireEvent.click(toggle);

    expect(ultracodeMessages()).toEqual([{ type: 'setOption', option: 'ultracode', value: 'false' }]);
  });

  it('开关可用时强度滑轨不再有 ultracode 这一档，不可用时保持原样', () => {
    const { container } = render(<App />);
    pushSession(LEVELS);
    pushApplied(false, false);

    // 强度滑轨收在型号弹窗里，先点开
    fireEvent.click(container.querySelector('.status-bar .picker-trigger')!);
    expect(container.querySelector('.status-bar [data-effort="ultracode"]')).not.toBeNull();
    expect(openModePopup(container).querySelector('[role="switch"]')).toBeNull();

    pushApplied(true, false);

    if (container.querySelector('.status-bar .picker-panel') === null)
    {
      fireEvent.click(container.querySelector('.status-bar .picker-trigger')!);
    }

    expect(container.querySelector('.status-bar [data-effort="ultracode"]')).toBeNull();
    // 滑轨跟着当前模型走：测试里的 default 只报 low/medium/high
    expect(container.querySelector('.status-bar [data-effort="high"]')).not.toBeNull();
    expect(container.querySelector('.status-bar [data-effort="max"]')).toBeNull();
    expect(container.querySelector('.status-bar [data-effort="auto"]')).toBeNull();
  });

  it('CLI 没报可用性时保守兜底：档位清单里有 ultracode 才显示开关', () => {
    const { container } = render(<App />);
    pushSession(['low', 'medium', 'high']);

    expect(openModePopup(container).querySelector('[role="switch"]')).toBeNull();

    pushSession(LEVELS);

    expect(container.querySelector('.mode-popup [role="switch"]')).not.toBeNull();
  });

  it('当前型号不支持思考强度时不显示开关', () => {
    const { container } = render(<App />);
    pushSession(LEVELS, false);
    pushApplied(true, false);

    expect(openModePopup(container).querySelector('[role="switch"]')).toBeNull();
  });

  it('新会话 / 重启进程（宿主发空回放）后开关复位', () => {
    const { container } = render(<App />);
    pushSession(LEVELS);
    pushApplied(true, true);

    act(() => {
      emit?.({ type: OUTBOUND.Replay, payload: [] });
    });

    // 新进程还没报任何东西：开关不显示。
    expect(openModePopup(container).querySelector('[role="switch"]')).toBeNull();

    // 新进程报上来的是关。
    pushSession(LEVELS);
    pushApplied(true, false);

    expect(container.querySelector('.mode-popup [role="switch"]')!.getAttribute('aria-checked')).toBe('false');
  });

  it('命令菜单「模型」分组里也有开关：点它发消息，菜单不关', () => {
    const { container } = render(<App />);
    pushSession(LEVELS);
    pushApplied(true, false);

    fireEvent.click(container.querySelector('.composer-menu-button')!);

    const toggle = container.querySelector('.command-menu [role="switch"]') as HTMLButtonElement;
    expect(toggle).not.toBeNull();

    fireEvent.mouseDown(toggle);
    fireEvent.click(toggle);

    expect(ultracodeMessages()).toEqual([{ type: 'setOption', option: 'ultracode', value: 'true' }]);
    expect(container.querySelector('.command-menu')).not.toBeNull();
    expect(container.querySelector('.command-menu [role="switch"]')!.getAttribute('aria-checked')).toBe('true');
  });

  it('不可用时命令菜单里没有这一行', () => {
    const { container } = render(<App />);
    pushSession(LEVELS);
    pushApplied(false, false);

    fireEvent.click(container.querySelector('.composer-menu-button')!);

    expect(container.querySelector('.command-menu')).not.toBeNull();
    expect(container.querySelector('.command-menu [role="switch"]')).toBeNull();
  });
});
