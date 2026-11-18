// 语言/外观广播消息（uiPrefs）在 App 层的接线：收到就应用，绝不回声。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import App from './App';
import { OUTBOUND, INBOUND } from './protocol';
import { LANG_STORAGE_KEY } from './i18n';

const posted: unknown[] = [];

let emit: ((data: unknown) => void) | null = null;

beforeEach(() => {
  // 与 App.tabs.test.tsx 同理：钉住初始语言，断言写的中文文案才立得住。
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
  document.documentElement.style.removeProperty('--user-font-size');
  delete (window as unknown as { chrome?: unknown }).chrome;
});

function pushTabs(tabs: unknown[], activeId: string): void {
  act(() => {
    emit?.({ type: OUTBOUND.Tabs, payload: { tabs, activeId } });
  });
}

function pushUiPrefs(payload: unknown): void {
  act(() => {
    emit?.({ type: OUTBOUND.UiPrefs, payload });
  });
}

describe('App 的 uiPrefs 接线', () => {
  it('收到 uiPrefs 消息后界面语言确实变了', () => {
    render(<App />);
    pushTabs([{ id: 'a', title: '会话 1', busy: false, unread: false }], 'a');

    // 初始语言钉在 zh：+ 按钮的可访问名是中文原文。
    expect(screen.getByRole('button', { name: '新建会话' })).toBeTruthy();

    pushUiPrefs({ lang: 'en', appearance: { fontFamily: '', fontSize: 13, textColor: '' } });

    expect(screen.getByRole('button', { name: 'New session' })).toBeTruthy();
  });

  it('收到 uiPrefs 消息后外观也应用了，但不写回本地存档触发的语言选择', () => {
    render(<App />);

    pushUiPrefs({ lang: 'zh', appearance: { fontFamily: 'Consolas, monospace', fontSize: 20, textColor: '#ff0000' } });

    expect(document.documentElement.style.getPropertyValue('--user-font-size')).toBe('20px');
    expect(document.documentElement.style.getPropertyValue('--user-font-family')).toBe('Consolas, monospace');
  });

  it('收到 uiPrefs 之后不会再发一遍 uiPrefsChanged（不成环）', () => {
    render(<App />);
    pushTabs([{ id: 'a', title: '会话 1', busy: false, unread: false }], 'a');

    posted.length = 0;

    pushUiPrefs({ lang: 'en', appearance: { fontFamily: '', fontSize: 15, textColor: '' } });

    const echoed = posted.filter((m) => (m as { type: string }).type === INBOUND.UiPrefsChanged);
    expect(echoed.length).toBe(0);
  });
});
