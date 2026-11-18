import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionPicker, anchoredStyle } from './SessionPicker';
import type { PanelItemView } from '../panelState';

function session(id: string, title: string, extra: Partial<PanelItemView> = {}): PanelItemView {
  return {
    id, title, subtitle: '2020-01-01 10:00', enabled: true, detail: '', fields: {}, currentProject: true,
    ...extra,
  };
}

const ITEMS = [
  session('s1', '修复登录'),
  session('s2', '重构菜单', { fields: { branch: 'feature/menu' } }),
  session('s3', '写测试'),
  session('probe', '探测', { enabled: false }),
];

function setup(overrides: Partial<Parameters<typeof SessionPicker>[0]> = {}) {
  const onPick = vi.fn();
  const onShowAll = vi.fn();
  const onClose = vi.fn();
  const onAction = vi.fn();

  const view = render(
    <SessionPicker
      items={ITEMS}
      loading={false}
      error=""
      currentSessionId="s1"
      anchor={null}
      onPick={onPick}
      onShowAll={onShowAll}
      onClose={onClose}
      onAction={onAction}
      {...overrides}
    />);

  const input = view.container.querySelector('.session-pick-input') as HTMLInputElement;
  const rows = () => Array.from(view.container.querySelectorAll('.session-pick-row'));
  return { input, rows, onPick, onShowAll, onClose, onAction, container: view.container };
}

/** 某一行里按无障碍名找按钮。 */
function toolIn(row: Element, name: string): HTMLButtonElement | null {
  const found = Array.from(row.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === name);
  return (found as HTMLButtonElement | undefined) ?? null;
}

describe('会话小弹层：改名与存档', () => {
  it('改名：回车把新名字交给宿主，不触发接回', () => {
    const { rows, onAction, onPick } = setup();
    const row = rows()[1];

    fireEvent.click(toolIn(row, '重命名')!);
    const box = row.querySelector('.session-pick-rename') as HTMLInputElement;
    fireEvent.change(box, { target: { value: '  菜单重构完  ' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(onAction).toHaveBeenCalledWith('session.rename', ['s2', '菜单重构完']);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('改名中按 Esc 只取消改名，不关弹层也不发', () => {
    const { rows, onAction, onClose, container } = setup();

    fireEvent.click(toolIn(rows()[1], '重命名')!);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(container.querySelector('.session-pick-rename')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('名字没变或清空不发', () => {
    const { rows, onAction } = setup();
    const row = rows()[1];

    fireEvent.click(toolIn(row, '重命名')!);
    const box = row.querySelector('.session-pick-rename') as HTMLInputElement;
    fireEvent.change(box, { target: { value: '   ' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(onAction).not.toHaveBeenCalled();
  });

  it('开着的会话与当前会话没有改名按钮', () => {
    const { rows } = setup({
      items: [session('s1', '当前'), session('s2', '别的 tab 开着', { fields: { live: '1' } }), session('s3', '关着的')],
    });

    expect(toolIn(rows()[0], '重命名')).toBeNull();
    expect(toolIn(rows()[1], '重命名')).toBeNull();
    expect(toolIn(rows()[2], '重命名')).not.toBeNull();
  });

  it('存档发 session.archive，当前会话不给存档', () => {
    const { rows, onAction } = setup();

    expect(toolIn(rows()[0], '存档')).toBeNull();

    fireEvent.click(toolIn(rows()[2], '存档')!);
    expect(onAction).toHaveBeenCalledWith('session.archive', ['s3']);
  });

  it('已存档默认收起，勾上「显示已存档」才列出且可取消存档', () => {
    const { rows, onAction, container } = setup({
      items: [session('s1', '当前'), session('s2', '收起来的', { fields: { archived: '1' } })],
    });

    expect(rows().length).toBe(1);

    const toggle = container.querySelector('.session-pick-archived-toggle input') as HTMLInputElement;
    fireEvent.click(toggle);

    expect(rows().length).toBe(2);
    fireEvent.click(toolIn(rows()[1], '取消存档')!);
    expect(onAction).toHaveBeenCalledWith('session.unarchive', ['s2']);
  });

  it('没有已存档时不显示那个开关', () => {
    const { container } = setup();

    expect(container.querySelector('.session-pick-archived-toggle')).toBeNull();
  });
});

describe('会话小弹层', () => {
  it('打开即聚焦搜索框，只列有对话的会话，带相对时间', () => {
    const { input, rows } = setup();

    expect(document.activeElement).toBe(input);
    expect(rows().map((row) => row.querySelector('.session-pick-title')?.textContent)).toEqual(
      ['修复登录', '重构菜单', '写测试']);
    expect(rows()[0].querySelector('.session-pick-time')?.textContent).toMatch(/^\d+ 年前$/);
  });

  it('当前会话高亮并标出来', () => {
    const { rows } = setup();

    expect(rows()[0].classList.contains('is-current')).toBe(true);
    expect(rows()[1].classList.contains('is-current')).toBe(false);
    expect(screen.getByText('当前会话')).toBeTruthy();
  });

  it('上下键移动高亮，到头夹住不循环', () => {
    const { input, rows } = setup();

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(rows()[0].classList.contains('is-highlighted')).toBe(true);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(rows()[2].classList.contains('is-highlighted')).toBe(true);
    expect(input.getAttribute('aria-activedescendant')).toBe('session-pick-s3');
  });

  it('回车接回高亮的那条', () => {
    const { input, onPick } = setup();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onPick).toHaveBeenCalledWith('s2');
  });

  it('按住回车的重复触发不算', () => {
    const { input, onPick } = setup();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter', repeat: true });

    expect(onPick).not.toHaveBeenCalled();
  });

  it('选当前会话只关弹层，不接回', () => {
    const { input, onPick, onClose } = setup();

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onPick).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('点一行接回它', () => {
    const { rows, onPick } = setup();

    fireEvent.click(rows()[2]);

    expect(onPick).toHaveBeenCalledWith('s3');
  });

  it('搜索按标题与分支过滤，高亮回到第一条，命中处标出来', () => {
    const { input, rows, container } = setup();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.change(input, { target: { value: '菜单' } });

    expect(rows()).toHaveLength(1);
    expect(rows()[0].classList.contains('is-highlighted')).toBe(true);
    expect(container.querySelector('.session-pick-mark')?.textContent).toBe('菜单');

    fireEvent.change(input, { target: { value: 'FEATURE' } });
    expect(rows().map((row) => row.querySelector('.session-pick-title')?.textContent)).toEqual(['重构菜单']);
  });

  it('搜不到与本来就没有是两句话', () => {
    const { input } = setup();

    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByText('没有找到会话')).toBeTruthy();

    const empty = setup({ items: [] });
    expect(empty.container.textContent).toContain('这个目录下还没有历史会话。');
  });

  it('加载中不说没有会话；出错显示原因', () => {
    const loading = setup({ items: [], loading: true });
    expect(loading.container.textContent).toContain('正在读取会话…');
    expect(loading.container.textContent).not.toContain('还没有历史会话');

    const failed = setup({ items: [], error: '读不到目录' });
    expect(failed.container.querySelector('[role="alert"]')?.textContent).toBe('读不到目录');
    expect(failed.container.textContent).not.toContain('还没有历史会话');
  });

  it('Esc 先清搜索，再按才关闭，且不往外传', () => {
    const { input, onClose } = setup();
    const outer = vi.fn();
    window.addEventListener('keydown', outer);

    fireEvent.change(input, { target: { value: '菜单' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('');
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();

    window.removeEventListener('keydown', outer);
  });

  it('输入法组字中的按键不处理', () => {
    const { input, onPick, onClose } = setup();

    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });

    expect(onPick).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('点外面关闭，点弹层里面不关', () => {
    const { container, onClose } = setup();

    fireEvent.mouseDown(container.querySelector('.session-pick') as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(container.querySelector('.session-pick-overlay') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('底部的「全部会话…」打开整屏面板', () => {
    const { onShowAll } = setup();

    fireEvent.click(screen.getByText('全部会话…'));

    expect(onShowAll).toHaveBeenCalled();
  });
});

describe('弹层的摆放', () => {
  it('按钮在左半边就左对齐，离边至少 16px', () => {
    const style = anchoredStyle({ left: 4, right: 28, bottom: 30, width: 24 }, 800);

    expect(style).toEqual({ position: 'fixed', top: 34, left: 16 });
  });

  it('按钮在右半边就右对齐', () => {
    const style = anchoredStyle({ left: 760, right: 784, bottom: 30, width: 24 }, 800);

    expect(style).toEqual({ position: 'fixed', top: 34, right: 16 });
  });
});
