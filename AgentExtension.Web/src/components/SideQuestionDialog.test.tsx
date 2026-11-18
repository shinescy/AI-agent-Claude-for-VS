import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SideQuestionDialog } from './SideQuestionDialog';
import type { SideQa } from './SideQuestionDialog';

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

function Harness({ initial }: { initial: string }) {
  const [thread, setThread] = useState<SideQa[]>([]);
  return <SideQuestionDialog thread={thread} onThreadChange={setThread} initialQuestion={initial} onClose={() => undefined} />;
}

function asks(): Posted[] {
  return posted.filter((m) => m.option === 'sideQuestion');
}

describe('侧问侧栏', () => {
  it('带着问题打开就问；回答显示出来，下一问带上历史', () => {
    render(<Harness initial="1+1?" />);

    expect(asks()).toHaveLength(1);
    expect(JSON.parse(asks()[0].value!)).toEqual({ question: '1+1?', history: [] });
    expect(screen.getByText('正在想…')).toBeTruthy();

    emit({ kind: 'sideQuestion', requestId: asks()[0].requestId, response: '等于 2', error: '' });
    expect(screen.getByText('等于 2')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('侧问内容'), { target: { value: '再加 1？' } });
    fireEvent.click(screen.getByText('提问'));

    expect(JSON.parse(asks()[1].value!)).toEqual({
      question: '再加 1？',
      history: [{ question: '1+1?', response: '等于 2' }],
    });
  });

  it('出错的显示原因，且不算进历史', () => {
    render(<Harness initial="q1" />);
    emit({ kind: 'sideQuestion', requestId: asks()[0].requestId, response: '', error: '会话还没启动' });
    expect(screen.getByRole('alert').textContent).toContain('会话还没启动');

    fireEvent.change(screen.getByLabelText('侧问内容'), { target: { value: 'q2' } });
    fireEvent.click(screen.getByText('提问'));
    expect(JSON.parse(asks()[1].value!).history).toEqual([]);
  });

  it('没答完就关窗，留下一条说明而不是凭空消失', () => {
    let saved: SideQa[] = [];
    render(
      <SideQuestionDialog
        thread={[]}
        onThreadChange={(next) => { saved = next; }}
        initialQuestion="q1"
        onClose={() => undefined}
      />);

    fireEvent.keyDown(screen.getByLabelText('侧问内容'), { key: 'Escape' });
    expect(saved).toHaveLength(1);
    expect(saved[0].question).toBe('q1');
    expect(saved[0].error).toContain('窗口已关闭');
  });

  it('不带问题打开时不发请求', () => {
    render(<Harness initial="" />);
    expect(asks()).toHaveLength(0);
  });
});
