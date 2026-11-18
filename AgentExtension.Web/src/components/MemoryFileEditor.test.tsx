import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryFileEditor } from './MemoryFileEditor';

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

function last(): Posted & { body: { op: string; path: string; content: string; version: string } } {
  const message = posted.filter((m) => m.option === 'memoryFile').slice(-1)[0];
  return { ...message, body: JSON.parse(message.value!) };
}

const PATH = 'C:/u/.claude/projects/p/memory/note.md';

describe('记忆文件编辑', () => {
  it('打开就读、先只读；点编辑改了才能存，存时带上读出的身份戳，存完回只读', () => {
    render(<MemoryFileEditor name="note" path={PATH} onBack={() => undefined} onDeleted={() => undefined} />);
    expect(last().body).toMatchObject({ op: 'read', path: PATH });

    emit({ kind: 'memoryFile', requestId: last().requestId, error: '', content: 'old', version: 'v1', editable: true, op: 'read' });
    expect(screen.getByLabelText('记忆内容').tagName).toBe('PRE');
    expect(screen.queryByText('保存')).toBeNull();

    fireEvent.click(screen.getByText('编辑'));
    expect(screen.getByText('保存').closest('button')!.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('记忆内容'), { target: { value: 'new' } });
    fireEvent.click(screen.getByText('保存'));
    expect(last().body).toEqual({ op: 'write', path: PATH, content: 'new', version: 'v1' });

    emit({ kind: 'memoryFile', requestId: last().requestId, error: '', content: 'new', version: 'v2', editable: true, op: 'write' });
    expect(screen.getByText('已保存。')).toBeTruthy();
    expect(screen.getByLabelText('记忆内容').tagName).toBe('PRE');
  });

  it('取消编辑丢掉没存的改动', () => {
    render(<MemoryFileEditor name="note" path={PATH} onBack={() => undefined} onDeleted={() => undefined} />);
    emit({ kind: 'memoryFile', requestId: last().requestId, error: '', content: 'old', version: 'v1', editable: true, op: 'read' });

    fireEvent.click(screen.getByText('编辑'));
    fireEvent.change(screen.getByLabelText('记忆内容'), { target: { value: 'changed' } });
    fireEvent.click(screen.getByText('取消'));

    expect(screen.getByLabelText('记忆内容').textContent).toBe('old');
  });

  it('MEMORY.md 不给删', () => {
    render(<MemoryFileEditor name="MEMORY" path="C:/u/.claude/projects/p/memory/MEMORY.md" onBack={() => undefined} onDeleted={() => undefined} />);
    emit({ kind: 'memoryFile', requestId: last().requestId, error: '', content: '- [a](a.md)', version: 'v1', editable: true, op: 'read' });

    expect(screen.queryByText('删除')).toBeNull();
    expect(screen.getByText(/不能删/)).toBeTruthy();
  });

  it('不是合法 UTF-8 时只读', () => {
    render(<MemoryFileEditor name="note" path={PATH} onBack={() => undefined} onDeleted={() => undefined} />);
    emit({ kind: 'memoryFile', requestId: last().requestId, error: '', content: '??', version: 'v1', editable: false, op: 'read' });

    expect(screen.getByText('编辑').closest('button')!.disabled).toBe(true);
    expect(screen.getByText(/只能看/)).toBeTruthy();
  });

  it('删除点两下才发；成功后通知外面', () => {
    const onDeleted = vi.fn();
    render(<MemoryFileEditor name="note" path={PATH} onBack={() => undefined} onDeleted={onDeleted} />);
    emit({ kind: 'memoryFile', requestId: last().requestId, error: '', content: 'x', version: 'v1', editable: true, op: 'read' });

    fireEvent.click(screen.getByText('删除'));
    expect(last().body.op).toBe('read');

    fireEvent.click(screen.getByText('确认删除'));
    expect(last().body).toMatchObject({ op: 'delete', version: 'v1' });

    emit({ kind: 'memoryFile', requestId: last().requestId, error: '', op: 'delete' });
    expect(onDeleted).toHaveBeenCalled();
  });

  it('宿主拒绝时显示原因', () => {
    render(<MemoryFileEditor name="note" path={PATH} onBack={() => undefined} onDeleted={() => undefined} />);
    emit({ kind: 'memoryFile', requestId: last().requestId, error: '这条记忆在你打开之后被改过了', op: 'read' });
    expect(screen.getByRole('alert').textContent).toContain('被改过了');
  });
});
