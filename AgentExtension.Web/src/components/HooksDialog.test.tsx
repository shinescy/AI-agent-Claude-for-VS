import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { HooksDialog, groupHooks } from './HooksDialog';
import type { HookRow } from './HooksDialog';

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

const MINE: HookRow = {
  event: 'Stop', matcher: '', source: 'userSettings', type: 'command', displayText: 'echo done',
  editable: { matcher: '', config: { type: 'command', command: 'echo done', timeout: 5 } },
};
const PLUGIN: HookRow = {
  event: 'PreToolUse', matcher: 'Bash', source: 'pluginHook', type: 'command', displayText: 'guard.sh', pluginName: 'sec',
};

const LISTING = JSON.stringify({
  hooks: [MINE, PLUGIN],
  eventCatalog: [{ name: 'PreToolUse', supportsMatcher: true }, { name: 'Stop', supportsMatcher: false }],
  policy: {},
});

function open() {
  render(<HooksDialog onClose={() => undefined} />);
  expect(last()).toMatchObject({ option: 'cliDialog', value: 'hooks' });
  emit({ kind: 'cliDialog', name: 'hooks', requestId: last().requestId, dialog: LISTING, error: '' });
}

describe('钩子弹窗', () => {
  it('插件来的只读；自己的可编辑，编辑只换 command、保留其他字段', () => {
    open();
    expect(screen.getByText('只读')).toBeTruthy();

    fireEvent.click(screen.getByText('编辑'));
    fireEvent.change(screen.getByLabelText('命令'), { target: { value: 'echo bye' } });
    fireEvent.click(screen.getByText('保存'));

    expect(JSON.parse(last().value!)).toEqual({
      name: 'hooks',
      edit: {
        op: 'replace', source: 'userSettings', event: 'Stop', matcher: '',
        hook: { type: 'command', command: 'echo bye', timeout: 5 },
        target: { event: 'Stop', matcher: '', hook: { type: 'command', command: 'echo done', timeout: 5 } },
      },
    });
  });

  it('删除要点两下', () => {
    open();
    const before = posted.length;

    fireEvent.click(screen.getByText('删除'));
    expect(posted.length).toBe(before);

    fireEvent.click(screen.getByText('确认删除'));
    expect(JSON.parse(last().value!).edit).toMatchObject({ op: 'remove', source: 'userSettings', event: 'Stop' });
  });

  it('新增：支持匹配的事件带上 matcher', () => {
    open();
    fireEvent.click(screen.getByText('添加钩子'));
    fireEvent.change(screen.getByLabelText('匹配条件'), { target: { value: 'Bash' } });
    fireEvent.change(screen.getByLabelText('命令'), { target: { value: 'npm test' } });
    fireEvent.click(screen.getByText('添加'));

    expect(JSON.parse(last().value!).edit).toEqual({
      op: 'add', source: 'localSettings', event: 'PreToolUse', matcher: 'Bash',
      hook: { type: 'command', command: 'npm test' },
    });
  });

  it('保存失败时表单与输入保留；成功才关', () => {
    open();
    fireEvent.click(screen.getByText('添加钩子'));
    fireEvent.change(screen.getByLabelText('命令'), { target: { value: 'npm test' } });
    fireEvent.click(screen.getByText('添加'));

    emit({ kind: 'cliDialog', name: 'hooks', requestId: last().requestId, dialog: LISTING, error: 'CLI 拒绝修改' });
    expect((screen.getByLabelText('命令') as HTMLTextAreaElement).value).toBe('npm test');

    fireEvent.click(screen.getByText('添加'));
    emit({ kind: 'cliDialog', name: 'hooks', requestId: last().requestId, dialog: LISTING, error: '' });
    expect(screen.queryByLabelText('命令')).toBeNull();
  });

  it('groupHooks 按事件分组并保持顺序', () => {
    expect(groupHooks([MINE, PLUGIN, MINE]).map((g) => [g.event, g.rows.length])).toEqual([['Stop', 2], ['PreToolUse', 1]]);
  });
});
