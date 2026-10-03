import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from './App';
import { OUTBOUND, INBOUND } from './protocol';
import { LANG_STORAGE_KEY } from './i18n';

/** 收集前端发给宿主的消息。 */
const posted: unknown[] = [];

/** 宿主侧注册的消息回调。 */
let emit: ((data: unknown) => void) | null = null;

beforeEach(() => {
  // 语言默认跟随环境，而 jsdom 的 navigator.language 是 en-US，界面会渲染成英文。
  // 下面的断言写的是中文文案，必须先把语言钉住——否则这些测试测的是运行环境，不是代码。
  // （TabStrip 自己的测试不需要这一步：它不套 Provider，走 LangContext 的默认值 'zh'。）
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

function pushTabs(tabs: unknown[], activeId: string): void {
  act(() => {
    emit?.({ type: OUTBOUND.Tabs, payload: { tabs, activeId } });
  });
}

function sentTypes(): string[] {
  return posted.map((m) => (m as { type: string }).type);
}

describe('App 的 tab 条接线', () => {
  it('收到 tabs 消息就把 tab 条画出来', () => {
    render(<App />);

    pushTabs([
      { id: 'a', title: '会话 1', busy: false, unread: false },
      { id: 'b', title: '会话 2', busy: false, unread: true },
    ], 'a');

    expect(screen.getByText('会话 1')).toBeTruthy();
    expect(screen.getByText('会话 2')).toBeTruthy();
  });

  it('还没收到 tabs 时不画 tab 条', () => {
    render(<App />);

    expect(document.querySelector('.tabstrip')).toBeNull();
  });

  it('点别的 tab 发 tabActivate', () => {
    render(<App />);
    pushTabs([
      { id: 'a', title: '会话 1', busy: false, unread: false },
      { id: 'b', title: '会话 2', busy: false, unread: false },
    ], 'a');

    fireEvent.click(screen.getByText('会话 2'));

    expect(sentTypes()).toContain(INBOUND.TabActivate);
    const message = posted.find((m) => (m as { type: string }).type === INBOUND.TabActivate);
    expect((message as { value: string }).value).toBe('b');
  });

  it('点 + 发 tabCreate', () => {
    render(<App />);
    pushTabs([{ id: 'a', title: '会话 1', busy: false, unread: false }], 'a');

    fireEvent.click(screen.getByRole('button', { name: '新建会话' }));

    expect(sentTypes()).toContain(INBOUND.TabCreate);
  });

  it('点 x 发 tabClose', () => {
    render(<App />);
    pushTabs([
      { id: 'a', title: '会话 1', busy: false, unread: false },
      { id: 'b', title: '会话 2', busy: false, unread: false },
    ], 'a');

    fireEvent.click(screen.getByRole('button', { name: '关闭会话 2' }));

    const message = posted.find((m) => (m as { type: string }).type === INBOUND.TabClose);
    expect((message as { value: string }).value).toBe('b');
  });

  it('后来的 tabs 消息整条替换而不是累加', () => {
    render(<App />);
    pushTabs([
      { id: 'a', title: '会话 1', busy: false, unread: false },
      { id: 'b', title: '会话 2', busy: false, unread: false },
    ], 'a');
    pushTabs([{ id: 'a', title: '会话 1', busy: false, unread: false }], 'a');

    expect(screen.queryByText('会话 2')).toBeNull();
  });
});
