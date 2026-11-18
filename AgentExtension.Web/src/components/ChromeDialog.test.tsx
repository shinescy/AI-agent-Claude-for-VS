import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ChromeDialog, chromeBlockedReason } from './ChromeDialog';

type Posted = { option?: string; value?: string; requestId?: string };

let posted: Posted[] = [];
let hostHandlers: Set<(event: MessageEvent) => void>;

beforeEach(() => {
  posted = [];
  hostHandlers = new Set();

  (window as unknown as { chrome?: unknown }).chrome = {
    webview: {
      postMessage: (message: unknown) => { posted.push(message as Posted); },
      addEventListener: (_type: string, handler: (event: MessageEvent) => void) => { hostHandlers.add(handler); },
      removeEventListener: (_type: string, handler: (event: MessageEvent) => void) => { hostHandlers.delete(handler); },
    },
  };
});

afterEach(() => {
  delete (window as unknown as { chrome?: unknown }).chrome;
});

function emit(payload: Record<string, unknown>) {
  act(() => { hostHandlers.forEach((handler) => handler({ data: { type: 'context', payload } } as MessageEvent)); });
}

function last(option: string): Posted {
  return posted.filter((m) => m.option === option).slice(-1)[0];
}

const DIALOG = JSON.stringify({
  allowed: true, subscriber: true, wsl: false, installed: true, connected: false, enabled_by_default: true,
  urls: { install: 'https://claude.ai/chrome', permissions: 'https://clau.de/chrome/permissions' },
});

function open() {
  render(<ChromeDialog onClose={() => undefined} />);
  emit({ kind: 'cliDialog', name: 'chrome', requestId: last('cliDialog').requestId, dialog: DIALOG, error: '' });
}

describe('Chrome 弹窗', () => {
  it('接入后列浏览器，可改用另一个', () => {
    open();
    fireEvent.click(screen.getByText('在本会话接入浏览器'));
    expect(last('chromeConnect').value).toBe('on');

    emit({ kind: 'chromeConnect', requestId: last('chromeConnect').requestId, connected: true, error: '' });
    expect(last('chromeBrowsers')).toBeTruthy();

    emit({
      kind: 'chromeBrowsers', requestId: last('chromeBrowsers').requestId, error: '',
      browsers: JSON.stringify({ browsers: [{ device_id: 'd1', name: 'Work', current: true }, { device_id: 'd2', name: 'Home' }] }),
    });
    fireEvent.click(screen.getByText('改用这个'));
    expect(last('chromeSelect').value).toBe('d2');
    expect(screen.getByText('处理中…')).toBeTruthy();

    emit({
      kind: 'chromeBrowsers', requestId: last('chromeSelect').requestId, error: '',
      browsers: JSON.stringify({ browsers: [{ device_id: 'd1', name: 'Work' }, { device_id: 'd2', name: 'Home', current: true }] }),
    });
    expect(screen.getByText('断开浏览器')).toBeTruthy();
    expect(screen.getByText('正在用')).toBeTruthy();
  });

  it('默认启用开关发 enabledByDefault；权限链接走 openLink', () => {
    open();
    fireEvent.click(screen.getByRole('switch', { name: '新会话默认启用' }));
    expect(JSON.parse(last('cliEdit').value!)).toEqual({ name: 'chrome', edit: { enabledByDefault: false } });

    fireEvent.click(screen.getByText('在浏览器里调整网站权限'));
    expect(last('openLink').value).toBe('https://clau.de/chrome/permissions');
  });

  it('接入失败时显示错误，状态退回 CLI 报的「未接入」', () => {
    open();
    fireEvent.click(screen.getByText('在本会话接入浏览器'));
    emit({ kind: 'chromeConnect', requestId: last('chromeConnect').requestId, error: '会话还没启动' });

    expect(screen.getByRole('alert').textContent).toContain('会话还没启动');
    expect(screen.getByText('本会话还没有接入浏览器。')).toBeTruthy();
  });

  it('不能用的原因', () => {
    expect(chromeBlockedReason({ allowed: false })).toContain('组织');
    expect(chromeBlockedReason({ wsl: true })).toContain('WSL');
    expect(chromeBlockedReason({ subscriber: false })).toContain('订阅');
    expect(chromeBlockedReason({ allowed: true, subscriber: true })).toBe('');
  });
});
