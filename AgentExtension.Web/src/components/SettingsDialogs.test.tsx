import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryDialog } from './MemoryDialog';
import { SandboxDialog } from './SandboxDialog';
import { BackgroundContext, backgroundableToolIds } from '../backgroundable';
import { ToolCard } from './ToolCard';
import type { Block } from '../state';

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
  return posted.filter((m) => m.option === 'cliDialog' || m.option === 'cliEdit').slice(-1)[0];
}

describe('记忆弹窗', () => {
  it('读 memory；点自动记忆开关发 autoMemoryEnabled', () => {
    render(<MemoryDialog onOpenFullPanel={() => undefined} onClose={() => undefined} />);
    expect(last()).toMatchObject({ option: 'cliDialog', value: 'memory' });

    emit({
      kind: 'cliDialog', name: 'memory', requestId: last().requestId, error: '',
      dialog: JSON.stringify({
        auto_memory: { enabled: true, toggleable: true },
        auto_dream: { shown: false, enabled: false, toggleable: false },
        files: [{ kind: 'user', path: 'C:/u/CLAUDE.md', label: 'User instructions', exists: true }],
        memories: [],
      }),
    });

    expect(screen.getByText('User instructions')).toBeTruthy();
    expect(screen.queryByText('自动整理记忆')).toBeNull();

    fireEvent.click(screen.getByRole('switch', { name: '自动记忆' }));
    expect(last().option).toBe('cliEdit');
    expect(JSON.parse(last().value!)).toEqual({ name: 'memory', edit: { autoMemoryEnabled: false } });
  });
});

describe('沙箱弹窗', () => {
  it('平台不支持时只给说明，不给设置', () => {
    render(<SandboxDialog onClose={() => undefined} />);
    emit({
      kind: 'cliDialog', name: 'sandbox', requestId: last().requestId, error: '',
      dialog: JSON.stringify({ supported: false, unsupported_reason: 'platform' }),
    });

    expect(screen.getByText('当前平台（Windows）不支持命令沙箱。')).toBeTruthy();
    expect(screen.queryByText('模式')).toBeNull();
  });

  it('支持时选模式发 mode', () => {
    render(<SandboxDialog onClose={() => undefined} />);
    emit({
      kind: 'cliDialog', name: 'sandbox', requestId: last().requestId, error: '',
      dialog: JSON.stringify({ supported: true, mode: 'disabled', no_sandbox_allowed: true, excluded_commands: [] }),
    });

    fireEvent.click(screen.getByLabelText('沙箱运行，照常询问权限'));
    expect(JSON.parse(last().value!)).toEqual({ name: 'sandbox', edit: { mode: 'regular' } });
  });
});

describe('工具卡片上的转到后台', () => {
  const call = (name: string, done: boolean) =>
    ({ toolUseId: 't1', name, inputJson: '{"command":"npm test"}', resultText: '', isError: false, done });

  it('在可转清单里的才有按钮，点了把 id 交出去；失败后按钮恢复', () => {
    const ran: string[] = [];
    const run = (id: string) => { ran.push(id); };
    const { rerender } = render(
      <BackgroundContext.Provider value={{ ids: new Set(['t1']), run, failed: null }}>
        <ToolCard call={call('Bash', false)} running />
      </BackgroundContext.Provider>);

    fireEvent.click(screen.getByText('转到后台'));
    expect(ran).toEqual(['t1']);
    expect(screen.getByText('已请求转后台')).toBeTruthy();

    rerender(
      <BackgroundContext.Provider value={{ ids: new Set(['t1']), run, failed: { id: 't1', seq: 1 } }}>
        <ToolCard call={call('Bash', false)} running />
      </BackgroundContext.Provider>);
    expect(screen.getByText('转到后台')).toBeTruthy();
  });

  it('不在可转清单里就没有按钮', () => {
    render(
      <BackgroundContext.Provider value={{ ids: new Set(['other']), run: () => undefined, failed: null }}>
        <ToolCard call={call('Bash', false)} running />
      </BackgroundContext.Provider>);
    expect(screen.queryByText('转到后台')).toBeNull();
  });
});

describe('可转后台的工具调用', () => {
  const tool = (id: string, name: string, done: boolean): Block =>
    ({ id: 1, kind: 'tool', text: '', streaming: false, tool: { toolUseId: id, name, inputJson: '{}', resultText: '', isError: false, done } }) as Block;

  it('只看最后一条用户消息之后：上一轮被中断的不算', () => {
    const user = { id: 9, kind: 'user', text: '下一句', streaming: false } as Block;
    expect(backgroundableToolIds([tool('old', 'Bash', false), user, tool('new', 'Bash', false)])).toEqual(['new']);
  });

  it('只挑还在跑的 Bash / PowerShell / Agent / Task', () => {
    const blocks = [tool('a', 'Bash', false), tool('b', 'Bash', true), tool('c', 'Read', false), tool('d', 'Task', false)];
    expect(backgroundableToolIds(blocks)).toEqual(['a', 'd']);
  });
});
