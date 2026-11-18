// 权限模式弹层：按钮 + 向上弹出的清单，分隔线下面是 Ultracode 开关。

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { PermissionModePopup } from './PermissionModePopup';
import { PERMISSION_MODES } from '../permissionModes';

function setup(overrides: Partial<Parameters<typeof PermissionModePopup>[0]> = {}) {
  const onModeChange = vi.fn();
  const onUltracodeChange = vi.fn();

  const view = render(
    <PermissionModePopup
      mode="acceptEdits"
      onModeChange={onModeChange}
      ultracode={{ visible: true, on: false }}
      onUltracodeChange={onUltracodeChange}
      {...overrides}
    />);

  const button = view.container.querySelector('.mode-button') as HTMLButtonElement;
  return { ...view, button, onModeChange, onUltracodeChange };
}

function popupOf(container: HTMLElement): HTMLElement | null {
  return container.querySelector('.mode-popup');
}

describe('权限模式按钮', () => {
  it('显示当前模式的图标与名称，悬停提示是实测结论', () => {
    const { button } = setup({ mode: 'plan' });

    expect(button.textContent).toBe('计划模式');
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button.title).toContain('实测');
  });

  it('完全放开的模式保持危险色', () => {
    expect(setup({ mode: 'bypassPermissions' }).button.className).toContain('mode-button-danger');
    expect(setup({ mode: 'dangerously' }).button.className).toContain('mode-button-danger');
    expect(setup({ mode: 'plan' }).button.className).not.toContain('mode-button-danger');
  });

  it('按钮不禁用：换模式走控制请求，生成中也能切', () => {
    const { button, container } = setup();

    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(popupOf(container)).not.toBeNull();
  });
});

describe('权限模式弹层', () => {
  it('每个模式一行：图标、名称、一行说明；当前项打勾', () => {
    const { button, container } = setup({ mode: 'plan' });
    fireEvent.click(button);

    const options = Array.from(container.querySelectorAll('[role="option"]'));
    expect(options.length).toBe(PERMISSION_MODES.length);

    for (const option of options)
    {
      expect(option.querySelector('svg')).not.toBeNull();
      expect(option.querySelector('.mode-option-name')!.textContent).not.toBe('');
      expect(option.querySelector('.mode-option-description')!.textContent).not.toBe('');
    }

    const checked = options.filter((option) => option.querySelector('.mode-option-check')!.textContent === '✓');
    expect(checked.map((option) => option.id)).toEqual(['mode-option-plan']);
    expect(checked[0].getAttribute('aria-selected')).toBe('true');
  });

  it('危险档在清单里也是危险色', () => {
    const { button, container } = setup();
    fireEvent.click(button);

    const danger = Array.from(container.querySelectorAll('.mode-option-danger')).map((el) => el.id);
    expect(danger.sort()).toEqual(['mode-option-bypassPermissions', 'mode-option-dangerously']);
  });

  it('点一行即切换并关闭，焦点回到按钮', () => {
    const { button, container, onModeChange } = setup();
    fireEvent.click(button);
    fireEvent.click(container.querySelector('#mode-option-plan')!);

    expect(onModeChange).toHaveBeenCalledWith('plan');
    expect(popupOf(container)).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('点当前项只关闭，不重复发切换', () => {
    const { button, container, onModeChange } = setup();
    fireEvent.click(button);
    fireEvent.click(container.querySelector('#mode-option-acceptEdits')!);

    expect(onModeChange).not.toHaveBeenCalled();
    expect(popupOf(container)).toBeNull();
  });

  it('打开后焦点在清单上，上下移动、Enter 选中', () => {
    const { button, container, onModeChange } = setup();
    fireEvent.click(button);

    const list = container.querySelector('[role="listbox"]') as HTMLElement;
    expect(document.activeElement).toBe(list);
    // 一打开停在当前项上。
    expect(list.getAttribute('aria-activedescendant')).toBe('mode-option-acceptEdits');

    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(list.getAttribute('aria-activedescendant')).toBe(`mode-option-${PERMISSION_MODES[1].value}`);

    fireEvent.keyDown(list, { key: 'ArrowUp' });
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    const last = PERMISSION_MODES[PERMISSION_MODES.length - 1].value;
    expect(list.getAttribute('aria-activedescendant')).toBe(`mode-option-${last}`);

    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onModeChange).toHaveBeenCalledWith(last);
    expect(popupOf(container)).toBeNull();
  });

  it('Esc 关闭并把焦点还给按钮，且不让外层再处理这个 Esc', () => {
    const { button, container, onModeChange } = setup();
    fireEvent.click(button);

    const list = container.querySelector('[role="listbox"]') as HTMLElement;
    const notPrevented = fireEvent.keyDown(list, { key: 'Escape' });

    expect(notPrevented).toBe(false);
    expect(popupOf(container)).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it('焦点落在弹层外壳上（点了标题或说明文字）时 Esc 也能关', () => {
    const { button, container } = setup();
    fireEvent.click(button);

    const popup = popupOf(container) as HTMLElement;
    popup.focus();
    expect(document.activeElement).toBe(popup);

    const notPrevented = fireEvent.keyDown(popup, { key: 'Escape' });

    expect(notPrevented).toBe(false);
    expect(popupOf(container)).toBeNull();
  });

  it('点在外面关闭，点在弹层里面不关', () => {
    const { button, container } = setup();
    fireEvent.click(button);

    fireEvent.mouseDown(container.querySelector('.mode-popup-title')!);
    expect(popupOf(container)).not.toBeNull();

    fireEvent.mouseDown(document.body);
    expect(popupOf(container)).toBeNull();
  });

  it('不写 Shift+Tab 的提示', () => {
    const { button, container } = setup();
    fireEvent.click(button);

    expect(popupOf(container)!.textContent).not.toMatch(/tab/i);
  });
});

describe('弹层分隔线下面的开关', () => {
  it('弹层里不再放思考强度滑轨（工具栏已有）', () => {
    const { button, container } = setup();
    fireEvent.click(button);

    expect(container.querySelector('.mode-popup [role="slider"]')).toBeNull();
  });

  it('Ultracode 可用时有开关行，点它发出切换且不关弹层', () => {
    const { button, container, onUltracodeChange } = setup();
    fireEvent.click(button);

    const toggle = container.querySelector('.mode-popup [role="switch"]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.className).not.toContain('is-on');
    expect(popupOf(container)!.textContent).toContain('每个任务都用动态工作流编排（仅本次会话）');

    fireEvent.click(toggle);

    expect(onUltracodeChange).toHaveBeenCalledWith(true);
    expect(popupOf(container)).not.toBeNull();
  });

  it('开着时开关有可见标记', () => {
    const { button, container, onUltracodeChange } = setup({ ultracode: { visible: true, on: true } });
    fireEvent.click(button);

    const toggle = container.querySelector('.mode-popup [role="switch"]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(toggle.className).toContain('is-on');

    fireEvent.click(toggle);
    expect(onUltracodeChange).toHaveBeenCalledWith(false);
  });

  it('Ultracode 不可用时不画开关行', () => {
    const { button, container } = setup({ ultracode: { visible: false, on: false } });
    fireEvent.click(button);

    expect(container.querySelector('.mode-popup [role="switch"]')).toBeNull();
    expect(popupOf(container)!.textContent).not.toContain('Ultracode');
  });
});
