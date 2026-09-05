import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionsPanel } from './SessionsPanel';
import type { PanelItemView } from '../panelState';

function item(partial: Partial<PanelItemView>): PanelItemView {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    title: '改工具栏',
    subtitle: '2026-08-18 17:30',
    enabled: true,
    detail: '',
    fields: { session: '11111111-1111-1111-1111-111111111111', size: '2 KB' },
    currentProject: false,
    scope: '',
    ...partial,
  };
}

describe('会话历史面板', () => {
  it('默认只显示有对话的会话', () => {
    // 本扩展每次启动都留下一份只有 /model /effort /usage 探测的转录，实测数量远多于真实会话。
    // 不默认筛掉，列表会被自己的探测淹掉。
    render(
      <SessionsPanel
        items={[
          item({ id: 'aaaa1111-1111-1111-1111-111111111111', title: '真实对话' }),
          item({ id: 'bbbb2222-2222-2222-2222-222222222222', title: '命令：/usage', enabled: false }),
        ]}
        currentSessionId=""
        onResume={() => {}}
        onNewSession={() => {}}
      />);

    expect(screen.getByText('真实对话')).toBeTruthy();
    expect(screen.queryByText('命令：/usage')).toBeNull();
  });

  it('取消筛选后探测会话也列出来', () => {
    render(
      <SessionsPanel
        items={[item({ title: '命令：/usage', enabled: false })]}
        currentSessionId=""
        onResume={() => {}}
        onNewSession={() => {}}
      />);

    fireEvent.click(screen.getByRole('checkbox'));

    expect(screen.getByText('命令：/usage')).toBeTruthy();
  });

  it('接回与开分支分别报告 fork 标记', () => {
    const onResume = vi.fn();
    const id = 'aaaa1111-1111-1111-1111-111111111111';

    render(
      <SessionsPanel
        items={[item({ id })]}
        currentSessionId=""
        onResume={onResume}
        onNewSession={() => {}}
      />);

    fireEvent.click(screen.getByRole('button', { name: '接回' }));
    expect(onResume).toHaveBeenCalledWith(id, false);

    fireEvent.click(screen.getByRole('button', { name: '开分支' }));
    expect(onResume).toHaveBeenCalledWith(id, true);
  });

  it('当前会话不给接回按钮', () => {
    // 接回当前会话是个空操作，给了按钮点下去只会重启一次进程、丢掉转录，
    // 用户会以为自己点坏了什么。
    const id = 'aaaa1111-1111-1111-1111-111111111111';

    render(
      <SessionsPanel
        items={[item({ id })]}
        currentSessionId={id}
        onResume={() => {}}
        onNewSession={() => {}}
      />);

    expect(screen.getByText('当前会话')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '接回' })).toBeNull();
  });

  it('提前说明历史消息不会回填', () => {
    // 实测 CLI 只把上下文喂给模型、不回放历史消息。不说明的话，接回后一片空白
    // 看着就像失败了——这正是本项目明令要防的那类「静默」。
    render(
      <SessionsPanel
        items={[item({})]}
        currentSessionId=""
        onResume={() => {}}
        onNewSession={() => {}}
      />);

    expect(screen.getByText(/历史消息不会回填/)).toBeTruthy();
  });

  it('空态区分「真的没有」与「都被筛掉了」', () => {
    const { rerender } = render(
      <SessionsPanel
        items={[]}
        currentSessionId=""
        onResume={() => {}}
        onNewSession={() => {}}
      />);

    expect(screen.getByText('这个目录下还没有历史会话。')).toBeTruthy();

    rerender(
      <SessionsPanel
        items={[item({ enabled: false })]}
        currentSessionId=""
        onResume={() => {}}
        onNewSession={() => {}}
      />);

    expect(screen.getByText('这个目录下只有启动探测留下的会话。')).toBeTruthy();
  });

  it('点开新会话触发 onNewSession', () => {
    // 自动接回把用户锁在上一条会话里，这个按钮是唯一的干净重来入口。
    const onNewSession = vi.fn();

    render(
      <SessionsPanel
        items={[]}
        currentSessionId=""
        onResume={() => {}}
        onNewSession={onNewSession}
      />);

    fireEvent.click(screen.getByRole('button', { name: '开新会话' }));

    expect(onNewSession).toHaveBeenCalledTimes(1);
  });

  it('取数出错时不再补一句空态文案', () => {
    // 顶部已经在报错，再说「没有历史会话」是在断言一件没验证过的事。
    render(
      <SessionsPanel
        items={[]}
        currentSessionId=""
        error="读取失败：拒绝访问"
        onResume={() => {}}
        onNewSession={() => {}}
      />);

    expect(screen.queryByText('这个目录下还没有历史会话。')).toBeNull();
  });
});
