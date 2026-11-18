// 输入框底栏：当前文件标签。

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { ComposerFooter, withActiveFile } from './ComposerFooter';
import { Composer } from './Composer';

const FILE = { path: 'src/a.ts', name: 'a.ts' };

function footer(over: Partial<React.ComponentProps<typeof ComposerFooter>> = {})
{
  const props = {
    activeFile: FILE,
    attached: false,
    onToggleAttach: vi.fn(),
    ...over,
  };
  const view = render(<ComposerFooter {...props} />);
  return { view, props };
}

describe('ComposerFooter 文件标签', () =>
{
  it('没有活动文件时整行不画，也不留圆环', () =>
  {
    const { view } = footer({ activeFile: null });
    expect(view.container.querySelector('.composer-footer')).toBeNull();
    expect(footer().view.container.querySelector('.context-ring')).toBeNull();
  });

  it('点击标签切换附加，点亮带 is-attached', () =>
  {
    const { view, props } = footer();
    const chip = view.container.querySelector('.active-file-chip') as HTMLElement;
    fireEvent.click(chip);
    expect(props.onToggleAttach).toHaveBeenCalledTimes(1);
    expect(chip.className).not.toContain('is-attached');

    const on = footer({ attached: true });
    expect(on.view.container.querySelector('.active-file-chip')!.className).toContain('is-attached');
  });

  it('标签带 aria-pressed 与跟悬停提示一致的 aria-label', () =>
  {
    const off = footer().view.container.querySelector('.active-file-chip') as HTMLElement;
    expect(off.getAttribute('aria-pressed')).toBe('false');
    expect(off.getAttribute('aria-label')).toBe('单击附加当前文件：src/a.ts');

    const on = footer({ attached: true }).view.container.querySelector('.active-file-chip') as HTMLElement;
    expect(on.getAttribute('aria-pressed')).toBe('true');
    expect(on.getAttribute('aria-label')).toBe('发送时会附加 src/a.ts，单击取消');
  });
});

describe('withActiveFile', () =>
{
  it('拼前缀；斜杠命令与空路径原样返回', () =>
  {
    expect(withActiveFile('看看这里', 'src/a.ts')).toBe('@src/a.ts 看看这里');
    expect(withActiveFile('/compact', 'src/a.ts')).toBe('/compact');
    expect(withActiveFile('x', null)).toBe('x');
  });
});

describe('Composer 集成', () =>
{
  function mount(activeFile: { path: string; name: string } | null)
  {
    const onSend = vi.fn();
    const make = (file: typeof activeFile) => (
      <Composer
        onSend={onSend}
        slashCommands={[]}
        unavailableCommands={[]}
        injection={null}
        fileResults={null}
        droppedFiles={null}
        activeFile={file}
      />);
    const view = render(make(activeFile));
    return { view, onSend, rerender: (file: typeof activeFile) => view.rerender(make(file)) };
  }

  function type(view: ReturnType<typeof render>, text: string)
  {
    const box = view.container.querySelector('.composer-row textarea')!;
    fireEvent.change(box, { target: { value: text, selectionStart: text.length, selectionEnd: text.length } });
    return box;
  }

  it('点亮后发送带 @ 前缀', () =>
  {
    const { view, onSend } = mount(FILE);
    fireEvent.click(view.container.querySelector('.active-file-chip')!);
    const box = type(view, '看看');
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    expect(onSend.mock.calls[0][0]).toBe('@src/a.ts 看看');
  });

  it('点亮后切成无文档再发送，正文不带 @', () =>
  {
    const { view, onSend, rerender } = mount(FILE);
    fireEvent.click(view.container.querySelector('.active-file-chip')!);
    rerender(null);
    const box = type(view, '看看');
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    expect(onSend.mock.calls[0][0]).toBe('看看');
  });

  it('文档全关后附加自动失效，再打开文件也不会自己点亮', () =>
  {
    const { view, onSend, rerender } = mount(FILE);
    fireEvent.click(view.container.querySelector('.active-file-chip')!);
    rerender(null);
    rerender(FILE);

    expect(view.container.querySelector('.active-file-chip')!.className).not.toContain('is-attached');

    const box = type(view, '看看');
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    expect(onSend.mock.calls[0][0]).toBe('看看');
  });

  it('点亮但正文为空（只有提示词）时不加 @', () =>
  {
    const { view, onSend } = mount(FILE);
    fireEvent.click(view.container.querySelector('.active-file-chip')!);
    fireEvent.change(view.container.querySelector('.composer-prompt-textarea')!, { target: { value: '固定提示' } });

    fireEvent.keyDown(view.container.querySelector('.composer-row textarea')!, { key: 'Enter', ctrlKey: true });

    expect(onSend.mock.calls[0][0]).toBe('固定提示');
    fireEvent.change(view.container.querySelector('.composer-prompt-textarea')!, { target: { value: '' } });
  });

  it('点亮但正文为空（只有图片）时不加 @', async () =>
  {
    const { view, onSend } = mount(FILE);
    fireEvent.click(view.container.querySelector('.active-file-chip')!);

    const box = view.container.querySelector('.composer-row textarea')!;
    const shot = new File([new Uint8Array([137, 80, 78, 71])], 'image.png', { type: 'image/png' });
    fireEvent.paste(box, {
      clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => shot }] },
    });
    await waitFor(() => expect(view.container.querySelector('.composer-attachment')).not.toBeNull());

    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });

    expect(onSend.mock.calls[0][0]).toBe('');
    expect(onSend.mock.calls[0][1]).toHaveLength(1);
  });
});
