import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Transcript } from './Transcript';
import type { Block } from '../state';

/** 一段 /effort 的用法串回复——转录会把它还原成选项框。 */
const EFFORT_USAGE = 'Usage: /effort <low|medium|high|xhigh|max|ultracode|auto>';

/** /model 的回复：带「当前是哪个」，且当前值恰好与某个可选值同名。 */
const MODEL_USAGE = 'Current model: opus\nUsage: /model <name>. Available: sonnet, opus, haiku';

function assistantBlock(text: string): Block {
  return { id: 1, kind: 'assistant', text, streaming: false };
}

function renderOptions(text = EFFORT_USAGE) {
  const onRunCommand = vi.fn();
  render(<Transcript blocks={[assistantBlock(text)]} onRunCommand={onRunCommand} />);
  const toolbar = screen.getByRole('toolbar');
  const buttons = screen.getAllByRole('button');
  return { onRunCommand, toolbar, buttons };
}

describe('转录里的命令选项框：键盘操作', () => {
  it('整组只占一个 Tab 停靠点', () => {
    // 此前每个选项都是一个停靠点：十个模型就要按十次 Tab 才能走出这一组。
    const { buttons } = renderOptions();

    const reachable = buttons.filter((b) => b.getAttribute('tabindex') === '0');

    expect(buttons.length).toBe(7);
    expect(reachable).toHaveLength(1);
  });

  it('Tab 进来先落在当前生效的那一项上', () => {
    // 当前值取自「Current model: X」那一行（detectCurrentValue），能对上某个选项时就落在它上面。
    const { buttons } = renderOptions(MODEL_USAGE);

    const stop = buttons.find((b) => b.getAttribute('tabindex') === '0');

    expect(stop?.textContent).toBe('opus');
  });

  it('取不到当前值时落在第一项', () => {
    // /effort 的真机回复只有用法串、没有当前值（当前 effort 写在 /model 那一段里），
    // 而 /model 的当前值又常是「Opus 5 (1M context)」这种显示名，对不上「opus」这种取值。
    // 对不上就退回第一项——不能让整组没有 Tab 停靠点。
    const { buttons } = renderOptions();

    const stop = buttons.find((b) => b.getAttribute('tabindex') === '0');

    expect(stop?.textContent).toBe('low');
  });

  it('方向键移动焦点', () => {
    const { toolbar, buttons } = renderOptions();

    buttons[0].focus();
    expect(document.activeElement).toBe(buttons[0]);

    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(buttons[1]);

    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(buttons[2]);

    fireEvent.keyDown(toolbar, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(buttons[1]);
  });

  it('上下键与左右键等效（横向排列但键盘习惯两种都有）', () => {
    const { toolbar, buttons } = renderOptions();

    buttons[0].focus();
    fireEvent.keyDown(toolbar, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(buttons[1]);

    fireEvent.keyDown(toolbar, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('走到头会环绕', () => {
    const { toolbar, buttons } = renderOptions();
    const last = buttons.length - 1;

    buttons[0].focus();
    fireEvent.keyDown(toolbar, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(buttons[last]);

    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('Home 与 End 跳到首末', () => {
    const { toolbar, buttons } = renderOptions();

    buttons[3].focus();
    fireEvent.keyDown(toolbar, { key: 'End' });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);

    fireEvent.keyDown(toolbar, { key: 'Home' });
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('方向键只移动，绝不执行命令', () => {
    // 这些选项一按就真的发出一条命令（切模型要重启 CLI 进程）。
    // 「选择跟随焦点」在这里等于路过即触发，所以不能用 radiogroup 的默认语义。
    const { toolbar, buttons, onRunCommand } = renderOptions();

    buttons[0].focus();
    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    fireEvent.keyDown(toolbar, { key: 'End' });
    fireEvent.keyDown(toolbar, { key: 'Home' });

    expect(onRunCommand).not.toHaveBeenCalled();
  });

  it('选中项按下后发出对应命令', () => {
    const { buttons, onRunCommand } = renderOptions();

    fireEvent.click(buttons[3]);

    expect(onRunCommand).toHaveBeenCalledWith('/effort xhigh');
  });

  it('焦点移动后按下的是移动到的那一项', () => {
    // roving tabindex 的意义就在这儿：方向键走到哪，Enter 就执行哪一个。
    const { toolbar, buttons, onRunCommand } = renderOptions();

    buttons[0].focus();
    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    fireEvent.click(document.activeElement as HTMLElement);

    expect(onRunCommand).toHaveBeenCalledWith('/effort medium');
  });

  it('当前生效的那一项带上语义标记', () => {
    // 视觉上靠边框颜色表达，不给语义等于只对看得见的人有效。
    renderOptions(MODEL_USAGE);

    const pressed = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true');

    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toBe('opus');
  });

  it('工具栏带可读的名字', () => {
    // 屏幕阅读器进组时要能说出「这是哪条命令的可选值」。
    const { toolbar } = renderOptions();

    expect(toolbar.getAttribute('aria-label')).toContain('/effort');
  });

  it('没有用法串时不渲染选项框', () => {
    const onRunCommand = vi.fn();
    render(<Transcript blocks={[assistantBlock('普通回复，没有可选值。')]} onRunCommand={onRunCommand} />);

    expect(screen.queryByRole('toolbar')).toBeNull();
  });
});
