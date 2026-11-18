// 命令菜单里的 Ultracode 行：行尾是开关，点行、点开关、回车都只切换，不关菜单。

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Composer } from './Composer';

function setup(ultracode?: { visible: boolean; on: boolean }) {
  const toggle = vi.fn();
  const onSend = vi.fn();
  const host = {
    openPanel: vi.fn(),
    runAction: vi.fn(),
    choices: vi.fn(() => [
      { value: 'high', label: '高', description: '', current: true },
      { value: 'max', label: '最高', description: '', current: false },
    ]),
    pick: vi.fn(),
    ultracode: ultracode === undefined ? undefined : { ...ultracode, toggle },
  };

  window.localStorage.removeItem('agent.chatPrompt');
  window.localStorage.removeItem('agent.chatPromptHeight');

  const view = render(
    <Composer
      onSend={onSend}
      slashCommands={['model', 'compact']}
      menuHost={host}
      unavailableCommands={[]}
      injection={null}
      fileResults={null}
      droppedFiles={null}
    />);

  fireEvent.click(view.container.querySelector('.composer-menu-button')!);

  const filter = view.container.querySelector('.command-menu-filter') as HTMLInputElement;
  return { container: view.container, filter, toggle, host, onSend };
}

/** 菜单里标题是 Ultracode 的那一行。 */
function ultracodeRow(container: HTMLElement): HTMLElement | undefined {
  return Array.from(container.querySelectorAll<HTMLElement>('.command-menu-item'))
    .find((row) => row.querySelector('.command-menu-label')?.textContent === 'Ultracode');
}

describe('命令菜单的 Ultracode 行', () => {
  it('可用时排在「思考强度」的下一行，行尾是开关控件', () => {
    const { container } = setup({ visible: true, on: false });

    const rows = Array.from(container.querySelectorAll<HTMLElement>('.command-menu-item'));
    const effortAt = rows.findIndex((row) => row.textContent?.startsWith('思考强度'));
    const row = ultracodeRow(container);

    expect(row).toBeDefined();
    expect(rows[effortAt + 1]).toBe(row);
    expect(row!.title).toBe('每个任务都用动态工作流编排（仅本次会话）');

    const control = row!.querySelector('.command-menu-control [role="switch"]');
    expect(control).not.toBeNull();
    expect(control!.getAttribute('aria-checked')).toBe('false');
  });

  it('不可用（或宿主没给）时不列出', () => {
    expect(ultracodeRow(setup({ visible: false, on: false }).container)).toBeUndefined();
    expect(ultracodeRow(setup().container)).toBeUndefined();
  });

  it('开着时开关有可见标记', () => {
    const { container } = setup({ visible: true, on: true });
    const control = ultracodeRow(container)!.querySelector('[role="switch"]')!;

    expect(control.getAttribute('aria-checked')).toBe('true');
    expect(control.className).toContain('is-on');
  });

  it('点开关只切换一次，菜单不关', () => {
    const { container, toggle, host } = setup({ visible: true, on: false });
    const control = ultracodeRow(container)!.querySelector('[role="switch"]') as HTMLElement;

    // 真实点击是 mousedown 再 click：前者落在行上，不能算选中这一行。
    const notPrevented = fireEvent.mouseDown(control);
    fireEvent.click(control);

    // 拦住默认行为，筛选框才不失焦（一失焦菜单就关了）。
    expect(notPrevented).toBe(false);
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(host.runAction).not.toHaveBeenCalled();
    expect(container.querySelector('.command-menu')).not.toBeNull();
  });

  it('点这一行的标题也只切换，不关菜单、不当成普通动作执行', () => {
    const { container, toggle, host } = setup({ visible: true, on: false });

    fireEvent.mouseDown(ultracodeRow(container)!.querySelector('.command-menu-label')!);

    expect(toggle).toHaveBeenCalledTimes(1);
    expect(host.runAction).not.toHaveBeenCalled();
    expect(container.querySelector('.command-menu')).not.toBeNull();
  });

  it('筛选到它再按回车：切换，菜单留着', () => {
    const { container, filter, toggle, onSend } = setup({ visible: true, on: false });

    fireEvent.change(filter, { target: { value: 'ultracode' } });
    fireEvent.keyDown(filter, { key: 'Enter' });

    expect(toggle).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
    expect(container.querySelector('.command-menu')).not.toBeNull();
  });
});
