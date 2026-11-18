import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Transcript } from './Transcript';
import { BookmarksPanel } from './BookmarksPanel';
import { bookmarkId } from '../bookmarks';
import type { Block } from '../state';
import { reducer, initialState } from '../state';
import type { AgentEvent } from '../types';

const DAY = 86400000;

function block(id: number, kind: Block['kind'], text: string, at?: number, streaming = false): Block {
  return { id, kind, text, streaming, at };
}

describe('转录：时刻与日期线', () => {
  it('每条消息显示钟点；跨天处插一条日期线', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(9, 5, 0, 0);
    const today = new Date();
    today.setHours(10, 30, 0, 0);

    render(
      <Transcript
        blocks={[
          block(1, 'user', '昨天问的', yesterday.getTime()),
          block(2, 'assistant', '昨天答的', yesterday.getTime() + 1000),
          block(3, 'user', '今天问的', today.getTime()),
        ]}
        onRunCommand={() => undefined}
      />);

    expect(screen.getAllByRole('separator').map((node) => node.textContent)).toEqual(['昨天', '今天']);
    expect(screen.getAllByText('09:05').length).toBe(2);
    expect(screen.getByText('10:30')).toBeTruthy();
  });

  it('不知道时刻的块不画钟点也不画日期线', () => {
    render(<Transcript blocks={[block(1, 'user', '没时刻')]} onRunCommand={() => undefined} />);

    expect(screen.queryByRole('separator')).toBeNull();
    expect(document.querySelector('time')).toBeNull();
  });
});

describe('转录：书签按钮与专注视图', () => {
  it('回复下有书签按钮，点了把整块交出去；收藏过的显示实心星', () => {
    const reply = block(2, 'assistant', '答复', 1000);
    const onToggle = vi.fn();

    const { rerender } = render(
      <Transcript blocks={[block(1, 'user', '问', 900), reply]} onRunCommand={() => undefined} onToggleBookmark={onToggle} />);

    fireEvent.click(screen.getByRole('button', { name: '加书签' }));
    expect(onToggle).toHaveBeenCalledWith(reply);

    rerender(
      <Transcript
        blocks={[block(1, 'user', '问', 900), reply]}
        onRunCommand={() => undefined}
        onToggleBookmark={onToggle}
        bookmarkedIds={new Set([bookmarkId('答复')])}
      />);
    expect(screen.getByRole('button', { name: '取消书签' }).textContent).toBe('★');
    expect(document.getElementById(bookmarkId('答复'))).not.toBeNull();
  });

  it('还在流式输出的回复不给书签按钮', () => {
    render(
      <Transcript blocks={[block(1, 'assistant', '写到一半', 1000, true)]} onRunCommand={() => undefined} onToggleBookmark={() => undefined} />);

    expect(screen.queryByRole('button', { name: '加书签' })).toBeNull();
  });

  it('专注视图给转录加上 is-focus，工具与思考靠样式藏起来', () => {
    const { container } = render(<Transcript blocks={[]} onRunCommand={() => undefined} focusView />);
    expect(container.querySelector('.transcript.is-focus')).not.toBeNull();
  });
});

describe('书签侧栏', () => {
  const ITEM = { id: 'bm-x', text: '# 标题\n正文', at: 1000, savedAt: 2000 };

  it('点开看全文；对话里找不到时说明原因', () => {
    const onReveal = vi.fn(() => false);
    render(<BookmarksPanel bookmarks={[ITEM]} onReveal={onReveal} onRemove={() => undefined} onClose={() => undefined} />);

    fireEvent.click(screen.getByText(/正文/));
    fireEvent.click(screen.getByText('在对话中显示'));

    expect(onReveal).toHaveBeenCalledWith('bm-x');
    expect(screen.getByRole('status').textContent).toContain('不在当前加载的记录里');
  });

  it('移除后回到列表；Esc 先回列表再关侧栏', () => {
    const onRemove = vi.fn();
    const onClose = vi.fn();
    render(<BookmarksPanel bookmarks={[ITEM]} onReveal={() => true} onRemove={onRemove} onClose={onClose} />);

    fireEvent.click(screen.getByText(/正文/));
    fireEvent.keyDown(screen.getByText('在对话中显示'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText('在对话中显示')).toBeNull();

    fireEvent.keyDown(screen.getByText(/正文/), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();

    fireEvent.click(screen.getByText(/正文/));
    fireEvent.click(screen.getByText('移除书签'));
    expect(onRemove).toHaveBeenCalledWith('bm-x');
  });
});

describe('状态：块上的时刻', () => {
  it('宿主带了时刻就用；用户自己发的记发送那一刻', () => {
    const event = { kind: 'AssistantText', content: '嗨', atUnixMs: 5 * DAY } as unknown as AgentEvent;
    const withReply = reducer(initialState, { type: 'agentEvent', event });
    expect(withReply.blocks[0].at).toBe(5 * DAY);

    const sent = reducer(initialState, { type: 'userSent', text: '你好', at: 42 });
    expect(sent.blocks[0].at).toBe(42);
  });
});

describe('代码块复制', () => {
  it('每个代码块带一个复制按钮，点了写剪贴板', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<Transcript blocks={[block(1, 'assistant', '看：\n\n```\nlet a = 1;\n```\n')]} onRunCommand={() => undefined} />);

    const button = screen.getByRole('button', { name: '复制' });
    fireEvent.click(button);

    expect(writeText).toHaveBeenCalledWith('let a = 1;\n');
  });
});
