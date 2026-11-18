import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { LogoutDialog } from './LogoutDialog';
import { reducer, initialState } from '../state';

type Posted = { option?: string; requestId?: string };

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

describe('退出登录确认框', () => {
  it('先确认才发 logout；成功后通知清账号，可转去重新登录', () => {
    const onLoggedOut = vi.fn();
    const onLogin = vi.fn();
    render(<LogoutDialog email="a@b.c" onLoggedOut={onLoggedOut} onLogin={onLogin} onClose={() => undefined} />);

    expect(screen.getByText('确定退出当前账号 a@b.c？')).toBeTruthy();
    expect(posted.some((m) => m.option === 'logout')).toBe(false);

    fireEvent.click(screen.getAllByText('退出登录').find((el) => el.tagName === 'BUTTON')!);
    const request = posted.find((m) => m.option === 'logout')!;
    expect(request).toBeTruthy();

    emit({ kind: 'logout', requestId: request.requestId, stage: 'done' });
    expect(onLoggedOut).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('重新登录'));
    expect(onLogin).toHaveBeenCalled();
  });

  it('失败时回到确认页并显示原因', () => {
    const onLoggedOut = vi.fn();
    render(<LogoutDialog email="" onLoggedOut={onLoggedOut} onLogin={() => undefined} onClose={() => undefined} />);

    fireEvent.click(screen.getAllByText('退出登录').find((el) => el.tagName === 'BUTTON')!);
    const request = posted.find((m) => m.option === 'logout')!;
    emit({ kind: 'logout', requestId: request.requestId, stage: 'error', error: '退出码 1' });

    expect(screen.getByRole('alert').textContent).toContain('退出码 1');
    expect(onLoggedOut).not.toHaveBeenCalled();
  });
});

describe('accountCleared', () => {
  it('没有会话时不动', () => {
    expect(reducer(initialState, { type: 'accountCleared' })).toBe(initialState);
  });
});
