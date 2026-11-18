import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FeedbackDialog } from './FeedbackDialog';

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

function sent(): Posted[] {
  return posted.filter((m) => m.option === 'feedback');
}

describe('反馈弹窗', () => {
  it('打开时不发任何东西；写明会发给 Anthropic；点发送才提交', () => {
    render(<FeedbackDialog initialText="按钮点不动" onClose={() => undefined} />);

    expect(sent()).toHaveLength(0);
    expect(screen.getByText(/会发送给 Anthropic/)).toBeTruthy();

    fireEvent.click(screen.getByText('发送给 Anthropic'));
    expect(JSON.parse(sent()[0].value!)).toEqual({ description: '按钮点不动', saveLocally: false });

    emit({ kind: 'feedback', requestId: sent()[0].requestId, error: '', feedbackId: 'fb-1', bundlePath: '' });
    expect(screen.getByText(/fb-1/)).toBeTruthy();
  });

  it('勾选只存本机：按钮与说明都变，结果显示路径和打开文件夹', () => {
    render(<FeedbackDialog initialText="x" onClose={() => undefined} />);

    fireEvent.click(screen.getByLabelText('只保存在本机，不发送'));
    expect(screen.getByText('只把报告存到本机，不会发送给任何人。')).toBeTruthy();

    fireEvent.click(screen.getByText('保存报告'));
    expect(JSON.parse(sent()[0].value!).saveLocally).toBe(true);

    emit({ kind: 'feedback', requestId: sent()[0].requestId, error: '', feedbackId: '', bundlePath: 'C:/u/.claude/feedback-bundles/a.zip' });
    fireEvent.click(screen.getByText('在资源管理器中显示'));
    expect(posted.some((m) => m.option === 'revealFeedback' && m.value === 'C:/u/.claude/feedback-bundles/a.zip')).toBe(true);
  });

  it('失败时显示原因、留在编辑页', () => {
    render(<FeedbackDialog initialText="x" onClose={() => undefined} />);
    fireEvent.click(screen.getByText('发送给 Anthropic'));
    emit({ kind: 'feedback', requestId: sent()[0].requestId, error: 'zdr_org', feedbackId: '', bundlePath: '' });

    expect(screen.getByRole('alert').textContent).toContain('zdr_org');
    expect(screen.getByLabelText('反馈内容')).toBeTruthy();
  });
});
