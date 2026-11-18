import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DesignLoginDialog } from './DesignLoginDialog';

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

function last(): Posted {
  return posted.filter((m) => m.option === 'designLogin').slice(-1)[0];
}

describe('Claude Design 登录弹窗', () => {
  it('先查状态；登录拿到网址后可交授权码，授权码要带 #', () => {
    render(<DesignLoginDialog onClose={() => undefined} />);
    expect(last().value).toBe('status');

    emit({ kind: 'designLogin', requestId: last().requestId, stage: 'status', available: true, signedIn: false, canSignInHere: true, error: '' });
    fireEvent.click(screen.getByText('用 claude.ai 账号登录'));
    expect(last().value).toBe('start');

    emit({ kind: 'designLogin', requestId: last().requestId, stage: 'pages', url: 'https://a', manualUrl: 'https://m', error: '' });
    expect((screen.getByLabelText('登录网址') as HTMLInputElement).value).toBe('https://m');

    fireEvent.change(screen.getByLabelText('授权码'), { target: { value: 'nohash' } });
    fireEvent.click(screen.getByText('继续'));
    expect(screen.getByRole('alert').textContent).toContain('xxxx#yyyy');

    fireEvent.change(screen.getByLabelText('授权码'), { target: { value: 'abc#def' } });
    fireEvent.click(screen.getByText('继续'));
    expect(last().value).toBe('code:abc#def');

    emit({ kind: 'designLogin', requestId: last().requestId, stage: 'done', ok: true, message: '', error: '' });
    expect(screen.getByText('Claude Design 登录成功。')).toBeTruthy();
  });

  it('这里不能登录时只显示原因', () => {
    render(<DesignLoginDialog onClose={() => undefined} />);
    emit({ kind: 'designLogin', requestId: last().requestId, stage: 'status', available: true, signedIn: false, canSignInHere: false, message: 'inside a session', error: '' });
    expect(screen.getByText('inside a session')).toBeTruthy();
    expect(screen.queryByText('用 claude.ai 账号登录')).toBeNull();
  });

  it('登录进行中关掉弹窗会取消', () => {
    const { unmount } = render(<DesignLoginDialog onClose={() => undefined} />);
    emit({ kind: 'designLogin', requestId: last().requestId, stage: 'status', available: true, signedIn: false, canSignInHere: true, error: '' });
    fireEvent.click(screen.getByText('用 claude.ai 账号登录'));

    unmount();
    expect(last().value).toBe('cancel');
  });
});
