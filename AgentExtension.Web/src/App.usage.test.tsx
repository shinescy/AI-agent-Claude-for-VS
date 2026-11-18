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

  // 2026-09 曾因探测写进真实会话而去掉定时器；现在探测是独立短进程且不落盘，
  // 只靠「一轮说完」刷新会让终端里聊、别处用掉的额度一直不更新（用户报）。
  it('空闲时每五分钟刷新一次，不更密', () => {
    render(<App />);
    sent = [];

    act(() => {
      vi.advanceTimersByTime(299000);
    });
    expect(sent.filter((m) => m.type === INBOUND.RefreshUsage)).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(sent.filter((m) => m.type === INBOUND.RefreshUsage)).toHaveLength(1);
  });
});
