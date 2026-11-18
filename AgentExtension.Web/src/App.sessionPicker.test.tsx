// 会话小弹层在 App 层的接线：三个入口、取数、接回、回退到整屏面板。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import App from './App';
import { INBOUND, OUTBOUND } from './protocol';
import { LANG_STORAGE_KEY } from './i18n';

type Posted = { type?: string; panelId?: string; requestId?: string; value?: string; fork?: boolean };

const posted: Posted[] = [];

let emit: ((data: unknown) => void) | null = null;

beforeEach(() => {
  window.localStorage.setItem(LANG_STORAGE_KEY, 'zh');
  posted.length = 0;
  emit = null;

  (window as unknown as { chrome?: unknown }).chrome = {
    webview: {
      postMessage: (m: unknown) => { posted.push(m as Posted); },
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

function push(data: unknown): void {
  act(() => { emit?.(data); });
}

function sessionRequests(): Posted[] {
  return posted.filter((m) => m.type === INBOUND.PanelOpen && m.panelId === 'sessions');
}

function item(id: string, title: string) {
  return {
    id, title, subtitle: '2020-01-01 10:00', enabled: true, detail: '', fields: {}, currentProject: true,
  };
}

/** 宿主回一份会话列表。 */
function replySessions(requestId: string | undefined): void {
  push({
    type: OUTBOUND.PanelData,
    payload: {
      panelId: 'sessions', items: [item('aaa', '第一条'), item('bbb', '第二条')],
      error: '', rawText: '', restartHint: false, requestId,
    },
  });
}

function typeInComposer(container: HTMLElement, text: string): HTMLTextAreaElement {
  const textarea = container.querySelector('.composer:not(.composer-terminal) .composer-row textarea') as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: text, selectionStart: text.length, selectionEnd: text.length } });
  return textarea;
}

describe('会话小弹层的接线', () => {
  it('输入 /res 回车打开小弹层，不开整屏面板，也不往对话里发命令', () => {
    const { container } = render(<App />);

    const textarea = typeInComposer(container, '/res');
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(container.querySelector('.session-pick')).not.toBeNull();
    expect(container.querySelector('.panel-overlay')).toBeNull();
    expect(sessionRequests()).toHaveLength(1);
    expect(sessionRequests()[0].requestId).toMatch(/^sp-/);
    expect(posted.some((m) => m.type === INBOUND.Send)).toBe(false);
  });

  it('直接发 /resume 也是小弹层', () => {
    const { container } = render(<App />);

    const textarea = typeInComposer(container, '/resume');
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    expect(container.querySelector('.session-pick')).not.toBeNull();
    expect(posted.some((m) => m.type === INBOUND.Send)).toBe(false);
  });

  it('tab 条右端的历史按钮打开小弹层', () => {
    const { container } = render(<App />);

    push({ type: OUTBOUND.Tabs, payload: { tabs: [{ id: 't1', title: '会话 1' }], activeId: 't1' } });
    fireEvent.click(container.querySelector('.tabstrip-history') as HTMLElement);

    expect(container.querySelector('.session-pick')).not.toBeNull();
    expect(sessionRequests()).toHaveLength(1);
  });

  it('回包填进列表，选中即接回并关闭', () => {
    const { container } = render(<App />);

    const textarea = typeInComposer(container, '/resume');
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    expect(container.textContent).toContain('正在读取会话…');

    replySessions(sessionRequests()[0].requestId);
    const rows = container.querySelectorAll('.session-pick-row');
    expect(rows).toHaveLength(2);

    fireEvent.click(rows[1]);

    const resume = posted.filter((m) => m.type === INBOUND.ResumeSession);
    expect(resume).toHaveLength(1);
    expect(resume[0].value).toBe('bbb');
    expect(resume[0].fork).toBe(false);
    expect(container.querySelector('.session-pick')).toBeNull();
  });

  it('过期请求号的回包不进列表', () => {
    const { container } = render(<App />);

    const textarea = typeInComposer(container, '/resume');
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    replySessions('sp-999');

    expect(container.querySelectorAll('.session-pick-row')).toHaveLength(0);
    expect(container.textContent).toContain('正在读取会话…');
  });

  it('「全部会话…」关掉小弹层并打开整屏面板', () => {
    const { container } = render(<App />);

    const textarea = typeInComposer(container, '/resume');
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    fireEvent.click(container.querySelector('.session-pick-all') as HTMLElement);

    expect(container.querySelector('.session-pick')).toBeNull();
    expect(container.querySelector('.panel-overlay')).not.toBeNull();
    expect(sessionRequests()).toHaveLength(2);
    expect(sessionRequests()[1].requestId).not.toMatch(/^sp-/);
  });

  it('Esc 只关小弹层，不退回宿主', () => {
    const { container } = render(<App />);

    const textarea = typeInComposer(container, '/resume');
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(container.querySelector('.session-pick-input') as HTMLElement, { key: 'Escape' });

    expect(container.querySelector('.session-pick')).toBeNull();
    expect(posted.some((m) => m.type === INBOUND.EscapeUnhandled)).toBe(false);
  });
});
