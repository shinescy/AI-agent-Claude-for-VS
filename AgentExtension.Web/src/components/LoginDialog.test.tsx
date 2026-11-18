import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { LoginDialog } from './LoginDialog';

type Posted = { type?: string; option?: string; value?: string; requestId?: string };

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

function lastLogin(): Posted {
  return posted.filter((m) => m.option === 'login').slice(-1)[0];
}

describe('登录对话框', () => {
  it('选订阅登录：发 login，收到网址后显示，可提交授权码，完成后提示成功', () => {
    render(<LoginDialog onClose={() => undefined} />);

    fireEvent.click(screen.getByText('Claude.ai 订阅'));
    const request = lastLogin();
    expect(request.value).toBe('claudeai');
    expect(screen.getByText('正在生成登录链接…')).toBeTruthy();

    emit({ kind: 'login', requestId: request.requestId, stage: 'url', url: 'https://claude.com/x' });
    expect((screen.getByLabelText('登录网址') as HTMLInputElement).value).toBe('https://claude.com/x');

    fireEvent.change(screen.getByLabelText('授权码'), { target: { value: ' abc#st ' } });
    fireEvent.click(screen.getByText('继续'));
    const code = posted.filter((m) => m.option === 'loginCode')[0];
    expect(code.value).toBe('abc#st');
    expect(code.requestId).toBe(request.requestId);

    emit({ kind: 'login', requestId: request.requestId, stage: 'done' });
    expect(screen.getByText('登录成功，账号信息已刷新。')).toBeTruthy();

    // 成功之后迟到的报错不能把它翻成失败
    emit({ kind: 'login', requestId: request.requestId, stage: 'error', error: 'late' });
    expect(screen.getByText('登录成功，账号信息已刷新。')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('选 Console 发 console', () => {
    render(<LoginDialog onClose={() => undefined} />);
    fireEvent.click(screen.getByText('Anthropic Console'));
    expect(lastLogin().value).toBe('console');
  });

  it('出错时回到选择页并显示原因；点返回后旧回包被忽略', () => {
    render(<LoginDialog onClose={() => undefined} />);

    fireEvent.click(screen.getByText('Claude.ai 订阅'));
    const first = lastLogin();
    emit({ kind: 'login', requestId: first.requestId, stage: 'error', error: '会话还没启动' });
    expect(screen.getByRole('alert').textContent).toContain('会话还没启动');
    expect(screen.getByText('用哪种方式登录？')).toBeTruthy();

    fireEvent.click(screen.getByText('Claude.ai 订阅'));
    fireEvent.click(screen.getByText('返回'));
    emit({ kind: 'login', requestId: lastLogin().requestId, stage: 'url', url: 'https://late' });
    expect(screen.queryByLabelText('登录网址')).toBeNull();
  });

  it('第三方服务商按钮请宿主打开说明文档', () => {
    render(<LoginDialog onClose={() => undefined} />);
    fireEvent.click(screen.getByText(/Bedrock, Foundry, or Vertex/));
    expect(posted.some((m) => m.option === 'loginDocs')).toBe(true);
  });

  it('Esc 关掉', () => {
    const onClose = vi.fn();
    render(<LoginDialog onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
