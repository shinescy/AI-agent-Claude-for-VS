import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabStrip } from './TabStrip';
import type { TabView } from '../types';
import { LangContext } from '../LangContext';

function tab(overrides: Partial<TabView> = {}): TabView {
  return { id: 'a', title: '会话 1', busy: false, unread: false, failed: false, ...overrides };
}

function setup(tabs: TabView[], activeId: string) {
  const onActivate = vi.fn();
  const onClose = vi.fn();
  const onCreate = vi.fn();

  render(
    <TabStrip
      tabs={tabs}
      activeId={activeId}
      onActivate={onActivate}
      onClose={onClose}
      onCreate={onCreate}
    />);

  return { onActivate, onClose, onCreate };
}

describe('TabStrip', () => {
  it('英文界面下标题跟着换成 Session', () => {
    // 标题是宿主用中文拼好推过来的，切语言时不跟着变的话，英文界面上会留一串中文。
    render(
      <LangContext.Provider value="en">
        <TabStrip
          tabs={[tab({ id: 'a', title: '会话 1' }), tab({ id: 'b', title: '会话 2' })]}
          activeId="a"
          onActivate={vi.fn()}
          onClose={vi.fn()}
          onCreate={vi.fn()}
        />
      </LangContext.Provider>);

    expect(screen.getByText('Session 1')).toBeTruthy();
    expect(screen.getByText('Session 2')).toBeTruthy();
    expect(screen.queryByText('会话 1')).toBeNull();
  });

  it('把每个 tab 的标题画出来', () => {
    setup([tab({ id: 'a', title: '会话 1' }), tab({ id: 'b', title: '会话 2' })], 'a');

    expect(screen.getByText('会话 1')).toBeTruthy();
    expect(screen.getByText('会话 2')).toBeTruthy();
  });

  it('点某个 tab 派发激活', () => {
    const { onActivate } = setup([tab({ id: 'a' }), tab({ id: 'b', title: '会话 2' })], 'a');

    fireEvent.click(screen.getByText('会话 2'));

    expect(onActivate).toHaveBeenCalledWith('b', false);
  });

  it('点已经激活的那个不重复派发', () => {
    // 重复激活会让宿主白跑一次切换，界面闪一下。
    const { onActivate } = setup([tab({ id: 'a' })], 'a');

    fireEvent.click(screen.getByText('会话 1'));

    expect(onActivate).not.toHaveBeenCalled();
  });

  it('点 x 派发关闭且不连带激活', () => {
    const { onClose, onActivate } = setup([tab({ id: 'a' }), tab({ id: 'b', title: '会话 2' })], 'a');

    fireEvent.click(screen.getAllByRole('button', { name: '关闭会话 2' })[0]);

    expect(onClose).toHaveBeenCalledWith('b');
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('点 + 派发新建', () => {
    const { onCreate } = setup([tab()], 'a');

    fireEvent.click(screen.getByRole('button', { name: '新建会话' }));

    expect(onCreate).toHaveBeenCalled();
  });

  it('激活的那个带 is-active', () => {
    setup([tab({ id: 'a' }), tab({ id: 'b', title: '会话 2' })], 'b');

    const active = document.querySelectorAll('.tabstrip-tab.is-active');

    expect(active.length).toBe(1);
    expect(active[0].textContent).toContain('会话 2');
  });

  it('未读和正在跑各有自己的标记', () => {
    setup([tab({ id: 'a', unread: true }), tab({ id: 'b', title: '会话 2', busy: true })], 'a');

    expect(document.querySelectorAll('.tabstrip-unread').length).toBe(1);
    expect(document.querySelectorAll('.tabstrip-busy').length).toBe(1);
  });

  it('崩了的 tab 显示的标记与未读/正在跑都不同', () => {
    // 三者共用同一个位置的小圆点，class 名必须三选一，不能叠加也不能混用。
    setup([
      tab({ id: 'a', failed: true }),
      tab({ id: 'b', title: '会话 2', unread: true }),
      tab({ id: 'c', title: '会话 3', busy: true }),
    ], 'a');

    expect(document.querySelectorAll('.tabstrip-failed').length).toBe(1);
    expect(document.querySelectorAll('.tabstrip-unread').length).toBe(1);
    expect(document.querySelectorAll('.tabstrip-busy').length).toBe(1);
  });

  it('崩了又忙/又未读时，崩了的标记优先，不画另外两种', () => {
    setup([tab({ id: 'a', failed: true, busy: true, unread: true })], 'a');

    expect(document.querySelectorAll('.tabstrip-failed').length).toBe(1);
    expect(document.querySelectorAll('.tabstrip-busy').length).toBe(0);
    expect(document.querySelectorAll('.tabstrip-unread').length).toBe(0);
  });

  it('只剩一个 tab 时不给关闭按钮', () => {
    // 零 tab 就是零 WebView，界面会变成再也点不出新 tab 的灰板。
    setup([tab()], 'a');

    expect(screen.queryByRole('button', { name: '关闭会话 1' })).toBeNull();
  });

  it('一个 tab 都没有时整条不画', () => {
    // 宿主还没推第一份列表时不该闪一条空条出来。
    const { container } = render(
      <TabStrip tabs={[]} activeId="" onActivate={vi.fn()} onClose={vi.fn()} onCreate={vi.fn()} />);

    expect(container.querySelector('.tabstrip')).toBeNull();
  });

  it('按 Enter 能切换 tab', () => {
    const { onActivate } = setup([tab({ id: 'a' }), tab({ id: 'b', title: '会话 2' })], 'a');

    fireEvent.keyDown(screen.getByText('会话 2').closest('.tabstrip-tab')!, { key: 'Enter' });

    expect(onActivate).toHaveBeenCalledWith('b', false);
  });

  it('roving tabindex：只有激活的那个能被 Tab 键停靠，其余是 -1', () => {
    // 标准 ARIA tabs 交互：Tab 键在 tab 条上只停一次，tab 之间的移动交给方向键。
    // 每个 tab 各占一个 Tab 停靠点的话，只剩一个 tab（没有关闭按钮）时，
    // 从 body 起 Tab、Tab、Enter 三下就会落到 + 上误触新建。
    setup([tab({ id: 'a' }), tab({ id: 'b', title: '会话 2' }), tab({ id: 'c', title: '会话 3' })], 'b');

    const tabs = document.querySelectorAll('.tabstrip-tab');

    expect(tabs.length).toBe(3);
    expect(tabs[0].getAttribute('tabindex')).toBe('-1');
    expect(tabs[1].getAttribute('tabindex')).toBe('0');
    expect(tabs[2].getAttribute('tabindex')).toBe('-1');
  });

  it('方向键在 tab 之间移动并激活，越界绕回另一端', () => {
    const { onActivate } = setup(
      [tab({ id: 'a' }), tab({ id: 'b', title: '会话 2' }), tab({ id: 'c', title: '会话 3' })], 'a');

    const first = screen.getByText('会话 1').closest('.tabstrip-tab')!;

    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(onActivate).toHaveBeenCalledWith('b', true);

    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    expect(onActivate).toHaveBeenCalledWith('c', true);
  });

  it('方向键切换带 fromKeyboard=true', () => {
    // 宿主靠这个标记决定要不要让前端把焦点挪到新激活的 tab 上。
    const { onActivate } = setup([tab({ id: 'a' }), tab({ id: 'b', title: '会话 2' })], 'a');

    const first = screen.getByText('会话 1').closest('.tabstrip-tab')!;
    fireEvent.keyDown(first, { key: 'ArrowRight' });

    expect(onActivate).toHaveBeenCalledWith('b', true);
  });

  it('鼠标点击带 fromKeyboard=false', () => {
    const { onActivate } = setup([tab({ id: 'a' }), tab({ id: 'b', title: '会话 2' })], 'a');

    fireEvent.click(screen.getByText('会话 2'));

    expect(onActivate).toHaveBeenCalledWith('b', false);
  });

  it('忙的 tab 第一次点关闭只进入确认态，不派发关闭', () => {
    const { onClose } = setup([tab({ id: 'a' }), tab({ id: 'b', title: '会话 2', busy: true })], 'a');

    const closeBtn = screen.getAllByRole('button', { name: '关闭会话 2' })[0];
    fireEvent.click(closeBtn);

    expect(onClose).not.toHaveBeenCalled();
    expect(closeBtn.className).toContain('is-confirming');
  });

  it('忙的 tab 第二次点同一个按钮才真的关闭', () => {
    const { onClose } = setup([tab({ id: 'a' }), tab({ id: 'b', title: '会话 2', busy: true })], 'a');

    const closeBtn = screen.getAllByRole('button', { name: '关闭会话 2' })[0];
    fireEvent.click(closeBtn);
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalledWith('b');
  });

  it('不忙的 tab 第一次点就直接关闭', () => {
    const { onClose } = setup([tab({ id: 'a' }), tab({ id: 'b', title: '会话 2', busy: false })], 'a');

    fireEvent.click(screen.getAllByRole('button', { name: '关闭会话 2' })[0]);

    expect(onClose).toHaveBeenCalledWith('b');
  });

  it('待确认时点别的 tab 会取消确认态，且不派发关闭', () => {
    const { onClose, onActivate } = setup(
      [tab({ id: 'a' }), tab({ id: 'b', title: '会话 2', busy: true }), tab({ id: 'c', title: '会话 3' })],
      'a');

    const closeBtn = screen.getAllByRole('button', { name: '关闭会话 2' })[0];
    fireEvent.click(closeBtn);
    expect(closeBtn.className).toContain('is-confirming');

    fireEvent.click(screen.getByText('会话 3'));

    expect(onActivate).toHaveBeenCalledWith('c', false);
    expect(onClose).not.toHaveBeenCalled();
    expect(closeBtn.className).not.toContain('is-confirming');

    // 确认态已经取消，这时点它该重新走「先确认」那一步，不能直接关。
    fireEvent.click(closeBtn);
    expect(onClose).not.toHaveBeenCalled();
  });
});
