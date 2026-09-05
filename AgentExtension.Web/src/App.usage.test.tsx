// usage 广播消息在 App 层的接线：收到就更新额度条，不碰 sessionId。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import App from './App';
import { OUTBOUND, INBOUND } from './protocol';
import { LANG_STORAGE_KEY } from './i18n';
import type { AgentEvent } from './types';

let emit: ((data: unknown) => void) | null = null;

/** 发给宿主的消息，用来断言探测有没有被打出去。 */
let sent: Array<{ type?: string }> = [];

beforeEach(() => {
  window.localStorage.setItem(LANG_STORAGE_KEY, 'zh');
  emit = null;
  sent = [];

  (window as unknown as { chrome?: unknown }).chrome = {
    webview: {
      postMessage: (m: { type?: string }) => { sent.push(m); },
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

const sessionStarted: AgentEvent = {
  kind: 'SessionStarted',
  content: '',
  toolCall: null,
  usageData: null,
  turnResult: null,
  rateLimitData: null,
  hookName: '',
  hookPhase: '',
  sessionInfo: {
    sessionId: 's1', model: 'opus', cwd: '', permissionMode: '', cliVersion: '',
    tools: [], slashCommands: [], terminalSlashCommands: [], slashCommandInfos: [],
    skills: [], subAgents: [], mcpServers: [], capabilities: [], models: [],
    subscriptionType: '', effortLevel: '', availableModels: [], effortLevels: [],
    usageWindows: [{ label: 'Current session', percentUsed: 10, resetsAtText: '', resetsAtUnix: 0, model: '' }],
    usageRawText: '',
  },
};

describe('App 的 usage 接线', () => {
  it('收到 usage 消息后额度条的数字变了', () => {
    render(<App />);

    act(() => {
      emit?.({ type: OUTBOUND.Replay, payload: [sessionStarted] });
    });

    expect(screen.getByText('10%')).toBeTruthy();

    act(() => {
      emit?.({
        type: OUTBOUND.Usage,
        payload: {
          usageWindows: [{ label: 'Current session', percentUsed: 77, resetsAtText: '', resetsAtUnix: 0, model: '' }],
          usageRawText: '新原文',
        },
      });
    });

    expect(screen.getByText('77%')).toBeTruthy();
    expect(screen.queryByText('10%')).toBeNull();
  });

  it('这个 tab 还没起会话时，收到 usage 不会让额度条冒出来', () => {
    render(<App />);

    act(() => {
      emit?.({
        type: OUTBOUND.Usage,
        payload: {
          usageWindows: [{ label: 'Current session', percentUsed: 50, resetsAtText: '', resetsAtUnix: 0, model: '' }],
          usageRawText: '不该生效',
        },
      });
    });

    expect(screen.queryByText('50%')).toBeNull();
  });
});

describe('App：额度探测不定时打进会话', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 定时探测发出去的 /usage 是一条真实用户消息，CLI 会原样记进转录。
  // 跑一天就是两千多条，把真实对话挤出回放窗口，终端接回时更是滤不掉。
  it('空闲五分钟一条 refreshUsage 都不发', () => {
    render(<App />);
    sent = [];

    act(() => {
      vi.advanceTimersByTime(300000);
    });

    const probes = sent.filter((m) => m.type === INBOUND.RefreshUsage);
    expect(probes).toHaveLength(0);
  });
});
