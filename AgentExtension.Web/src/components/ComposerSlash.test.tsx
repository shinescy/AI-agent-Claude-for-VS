import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Composer } from './Composer';

const COMMANDS = ['model', 'effort', 'usage', 'context', 'compact'];

function setup(slashCommands: string[] = COMMANDS) {
  const onSend = vi.fn();

  // 提示词是跨会话留存的，用例之间必须清干净，否则上一条的提示词会拼进下一条。
  window.localStorage.removeItem('agent.chatPrompt');
  window.localStorage.removeItem('agent.chatPromptHeight');

  const view = render(
    <Composer
      onSend={onSend}
      busy={false}
      slashCommands={slashCommands}
      unavailableCommands={[]}
      injection={null}
      fileResults={null}
      droppedFiles={null}
    />);

  // 按类点名要「具体内容」那一格：输入框分成了两格，补全只挂在这一格上。
  const textarea = view.container.querySelector('.composer-row textarea') as HTMLTextAreaElement;
  return { textarea, onSend };
}

/** 打字：同时给出新文本与新光标位置，与真实输入一致。 */
function type(textarea: HTMLTextAreaElement, text: string) {
  fireEvent.change(textarea, { target: { value: text, selectionStart: text.length, selectionEnd: text.length } });
}

/** 只移动光标、不改文本（方向键、Home/End、点击都属于这种）。 */
function moveCaret(textarea: HTMLTextAreaElement, position: number) {
  textarea.selectionStart = position;
  textarea.selectionEnd = position;
  fireEvent.select(textarea);
}

function popupOpen(): boolean {
  return screen.queryByRole('listbox') !== null || document.querySelector('.slash-popup') !== null;
}

describe('slash 补全：光标移动也要重新判定', () => {
  it('打出斜杠就打开', () => {
    const { textarea } = setup();

    type(textarea, '/mo');

    expect(popupOpen()).toBe(true);
  });

  it('把光标移到斜杠前面就关掉', () => {
    // 「时有时无」的根因：光标位置原先是渲染时从 DOM 现读的，而移动光标不改文本、
    // 不触发重渲染，判定于是一直停在上一次的旧光标上。
    const { textarea } = setup();

    type(textarea, '/mo');
    expect(popupOpen()).toBe(true);

    moveCaret(textarea, 0);

    expect(popupOpen()).toBe(false);
  });

  it('光标移回命令末尾又打开', () => {
    const { textarea } = setup();

    type(textarea, '/mo');
    moveCaret(textarea, 0);
    expect(popupOpen()).toBe(false);

    moveCaret(textarea, 3);

    expect(popupOpen()).toBe(true);
  });

  it('光标停在命令中间也算在命令里', () => {
    // /mo|del —— 光标在命令 token 内部，补全应该按光标前的部分过滤。
    const { textarea } = setup();

    type(textarea, '/model');
    moveCaret(textarea, 3);

    expect(popupOpen()).toBe(true);
  });

  it('命令后面已经打了空格就不再是补全场景', () => {
    const { textarea } = setup();

    type(textarea, '/model opus');

    expect(popupOpen()).toBe(false);
  });

  it('没有候选时不弹空框', () => {
    const { textarea } = setup();

    type(textarea, '/zzzz');

    expect(popupOpen()).toBe(false);
  });

  it('Esc 关掉后继续打字会重新打开', () => {
    const { textarea } = setup();

    type(textarea, '/mo');
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(popupOpen()).toBe(false);

    type(textarea, '/mod');

    expect(popupOpen()).toBe(true);
  });
});

describe('从输入框用方向键进入命令选项框', () => {
  function withOptionsBox() {
    // 造一个和转录渲染出来一样的选项框（类名与 tabindex 是 optionFocus 依赖的契约）。
    const box = document.createElement('div');
    box.className = 'command-options';

    for (const [label, tabIndex] of [['low', '-1'], ['high', '0']])
    {
      const button = document.createElement('button');
      button.textContent = label;
      button.setAttribute('tabindex', tabIndex);
      box.appendChild(button);
    }

    document.body.appendChild(box);
    return box;
  }

  it('输入框为空时按 ↑ 跳进最近的选项框，并停在当前项上', () => {
    const box = withOptionsBox();
    const { textarea } = setup();

    textarea.focus();
    fireEvent.keyDown(textarea, { key: 'ArrowUp' });

    expect(document.activeElement).toBe(box.querySelector('[tabindex="0"]'));

    box.remove();
  });

  it('草稿非空时不接管 ↑', () => {
    // 有草稿时 ↑ 该留给文本里的光标移动，不能把人从输入框里弹出去。
    const box = withOptionsBox();
    const { textarea } = setup();

    type(textarea, '写了一半的话');
    textarea.focus();
    fireEvent.keyDown(textarea, { key: 'ArrowUp' });

    expect(document.activeElement).toBe(textarea);

    box.remove();
  });

  it('没有选项框时 ↑ 不做任何事', () => {
    const { textarea } = setup();

    textarea.focus();
    fireEvent.keyDown(textarea, { key: 'ArrowUp' });

    expect(document.activeElement).toBe(textarea);
  });

  it('补全弹层开着时 ↑ 仍然用于在候选间移动', () => {
    // 两个「↑」的用途必须分清：弹层开着时它属于候选列表。
    const box = withOptionsBox();
    const { textarea } = setup();

    type(textarea, '/mo');
    fireEvent.keyDown(textarea, { key: 'ArrowUp' });

    expect(document.activeElement).not.toBe(box.querySelector('[tabindex="0"]'));

    box.remove();
  });
});
