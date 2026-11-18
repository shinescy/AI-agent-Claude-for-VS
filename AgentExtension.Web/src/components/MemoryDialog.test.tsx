import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryDialog } from './MemoryDialog';

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

const DAY = 86400000;

function load(dialog: Record<string, unknown>) {
  const request = posted.filter((m) => m.option === 'cliDialog').slice(-1)[0];
  const payload = { kind: 'cliDialog', requestId: request.requestId, dialog: JSON.stringify(dialog), error: '' };
  act(() => { hostHandlers.forEach((handler) => handler({ data: { type: 'context', payload } } as MessageEvent)); });
}

const DIALOG = {
  files: [{ kind: 'project', path: 'F:/p/CLAUDE.md', label: '项目说明', exists: true }],
  memories: [
    { name: 'no-mocks', path: 'C:/m/no-mocks.md', description: '测试不用模拟库', type: 'feedback', modified_ms: Date.now() - 3 * DAY },
    { name: 'deploy', path: 'C:/m/deploy.md', type: 'project' },
  ],
  folders: [{ kind: 'auto', path: 'C:/m', label: 'auto' }],
};

describe('记忆弹窗', () => {
  it('每条记忆显示「类型 · 多久以前」', () => {
    render(<MemoryDialog onOpenFullPanel={() => undefined} onClose={() => undefined} />);
    load(DIALOG);

    expect(screen.getByText('feedback · 3 天前')).toBeTruthy();
    expect(screen.getByText('project')).toBeTruthy();
  });

  it('↑↓ 在各行之间移焦点，Enter 打开那条记忆且先只读', () => {
    render(<MemoryDialog onOpenFullPanel={() => undefined} onClose={() => undefined} />);
    load(DIALOG);

    const rows = Array.from(document.querySelectorAll<HTMLElement>('.memory-row'));
    expect(document.activeElement).toBe(rows[0]);

    fireEvent.keyDown(rows[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[1]);

    fireEvent.keyDown(rows[1], { key: 'End' });
    expect(document.activeElement).toBe(rows[rows.length - 1]);

    fireEvent.keyDown(rows[rows.length - 1], { key: 'ArrowUp' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    fireEvent.click(document.activeElement!);

    const read = posted.filter((m) => m.option === 'memoryFile').slice(-1)[0];
    expect(JSON.parse(read.value!)).toMatchObject({ op: 'read', path: 'C:/m/no-mocks.md' });
  });

  it('「打开记忆文件夹」交给宿主去开，不带前端的路径', () => {
    render(<MemoryDialog onOpenFullPanel={() => undefined} onClose={() => undefined} />);
    load(DIALOG);

    fireEvent.click(screen.getByText(/打开记忆文件夹/));
    expect(posted.some((m) => m.option === 'openMemoryFolder' && m.value === '')).toBe(true);
  });

  it('底部有按键提示', () => {
    render(<MemoryDialog onOpenFullPanel={() => undefined} onClose={() => undefined} />);
    load(DIALOG);

    expect(screen.getByText('↑↓ 选择 · Enter 打开 · Esc 关闭')).toBeTruthy();
  });
});
