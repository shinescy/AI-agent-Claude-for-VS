// 对话输入框的「固定提示词」那一格。
//
// 终端那格先有的，这边一直只有一格：长期不变的要求（用中文、别改测试、先看某份文档）
// 每次都得重打，或者靠翻上一条消息复制。补上之后要钉住的，都是些错了不报错、
// 只会让「发出去的东西和你以为的差一点」的地方：
// 拼接顺序、发完清哪一格、跨挂载还在不在、以及那条会静默把命令变成一句话的组合。

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Composer } from './Composer';

const COMMANDS = ['model', 'effort', 'usage', 'compact'];

function setup(busy = false)
{
  const onSend = vi.fn();
  const view = render(
    <Composer
      onSend={onSend}
      busy={busy}
      slashCommands={COMMANDS}
      unavailableCommands={[]}
      injection={null}
      fileResults={null}
      droppedFiles={null}
    />);

  return { view, onSend };
}

/** 「具体内容」那一格。输入框现在有两格，按容器取而不是取第一个 textarea。 */
function contentBox(view: ReturnType<typeof render>): HTMLTextAreaElement
{
  return view.container.querySelector('.composer-row textarea')!;
}

/** 「固定提示词」那一格。 */
function promptBox(view: ReturnType<typeof render>): HTMLTextAreaElement
{
  return view.container.querySelector('.composer-prompt-row textarea')!;
}

function typeInto(view: ReturnType<typeof render>, text: string): HTMLTextAreaElement
{
  const box = contentBox(view);
  fireEvent.change(box, { target: { value: text, selectionStart: text.length, selectionEnd: text.length } });
  return box;
}

function typePrompt(view: ReturnType<typeof render>, text: string): HTMLTextAreaElement
{
  const box = promptBox(view);
  fireEvent.change(box, { target: { value: text } });
  return box;
}

function sendButton(view: ReturnType<typeof render>): HTMLButtonElement
{
  return view.container.querySelector<HTMLButtonElement>('.composer-button')!;
}

beforeEach(() =>
{
  // 提示词是跨会话留存的，用例之间必须清干净，否则上一条的提示词会拼进下一条。
  window.localStorage.removeItem('agent.chatPrompt');
  window.localStorage.removeItem('agent.chatPromptHeight');
  window.localStorage.removeItem('agent.terminalPrompt');
  window.localStorage.removeItem('agent.composerHeight');
});

describe('对话输入框的固定提示词', () =>
{
  it('两格都在，且各自认得出来', () =>
  {
    const { view } = setup();

    expect(promptBox(view)).not.toBeNull();
    expect(contentBox(view)).not.toBeNull();
    expect(promptBox(view)).not.toBe(contentBox(view));
  });

  it('发送时提示词在前、内容在后', () =>
  {
    const { view, onSend } = setup();

    typePrompt(view, '用中文回答');
    const box = typeInto(view, '解释这段代码');
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(onSend).toHaveBeenCalledWith('用中文回答\n解释这段代码', []);
  });

  it('发完只清内容那一格，提示词留着', () =>
  {
    const { view, onSend } = setup();

    typePrompt(view, '用中文回答');
    fireEvent.keyDown(typeInto(view, '第一次'), { key: 'Enter' });

    // 提示词的用处就是不用每次重打，清掉等于没有这个功能。
    expect(promptBox(view).value).toBe('用中文回答');
    expect(contentBox(view).value).toBe('');

    fireEvent.keyDown(typeInto(view, '第二次'), { key: 'Enter' });

    expect(onSend.mock.calls.map((c) => c[0]))
      .toEqual(['用中文回答\n第一次', '用中文回答\n第二次']);
  });

  it('提示词跨挂载留存', () =>
  {
    const first = setup();
    typePrompt(first.view, '固定的那段');
    first.view.unmount();

    const second = setup();

    // 切去终端再切回来、关掉面板再打开都得在，否则「固定」两个字就是假的。
    expect(promptBox(second.view).value).toBe('固定的那段');
  });

  it('不吃终端那格的提示词', () =>
  {
    // 两格各存各的。混成一份的表现是：在终端改了模板，对话这边下一次发送悄悄跟着变。
    window.localStorage.setItem('agent.terminalPrompt', '终端那格的');

    const { view } = setup();

    expect(promptBox(view).value).toBe('');
  });

  it('提示词那一格的 Enter 也是发送', () =>
  {
    const { view, onSend } = setup();

    typeInto(view, '正文');
    fireEvent.keyDown(typePrompt(view, '前缀'), { key: 'Enter' });

    // 同一个键在两个长得一样的框里做两件事，记不住也解释不清。
    expect(onSend).toHaveBeenCalledWith('前缀\n正文', []);
  });

  it('提示词那一格 Shift+Enter 仍是换行', () =>
  {
    const { view, onSend } = setup();

    const box = typePrompt(view, '第一行');
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });

    // 多行提示词是常见用法，这一下要是发送出去，第二行就永远打不出来。
    expect(onSend).not.toHaveBeenCalled();
    expect(box.value).toBe('第一行');
  });

  it('只有提示词、内容为空时也能发', () =>
  {
    const { view, onSend } = setup();

    typePrompt(view, '照老规矩再来一遍');

    expect(sendButton(view).disabled).toBe(false);
    fireEvent.click(sendButton(view));

    expect(onSend).toHaveBeenCalledWith('照老规矩再来一遍', []);
  });

  it('两格都空才不亮发送键', () =>
  {
    const { view } = setup();

    expect(sendButton(view).disabled).toBe(true);

    typePrompt(view, '前缀');
    expect(sendButton(view).disabled).toBe(false);
  });

  it('提示词只有空白不算数', () =>
  {
    // 末尾多敲的换行不该让发送键亮起来，更不该被当成"有提示词"拼进去。
    const { view, onSend } = setup();

    typePrompt(view, '  \n ');
    expect(sendButton(view).disabled).toBe(true);

    fireEvent.keyDown(typeInto(view, '正文'), { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('正文', []);
  });

  it('正忙时提示词那格按 Enter 也不发', () =>
  {
    const { view, onSend } = setup(true);

    typePrompt(view, '前缀');
    fireEvent.keyDown(promptBox(view), { key: 'Enter' });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('补全只挂在内容那一格上', () =>
  {
    // 提示词是长期不变的模板，不是敲命令的地方；这一格要是也弹补全，
    // Enter 就会被弹层吃掉，而这一格的 Enter 是发送。
    const { view } = setup();

    typePrompt(view, '/mo');

    expect(view.container.querySelector('.slash-popup')).toBeNull();
  });
});

describe('提示词非空时，内容里那条命令已经不是命令了', () =>
{
  it('警告说出后果', () =>
  {
    // 拼上提示词就成了多行，而 App 那边的命令截获按开头匹配——匹配不上就整段进管线。
    // 界面上什么都不提示的话，你以为执行了一条本地命令，实际只是烧了一次 token。
    const { view } = setup();

    typePrompt(view, '用中文回答');
    typeInto(view, '/compact');

    const warning = view.container.querySelector('.composer-warning');

    expect(warning).not.toBeNull();
    expect(warning!.textContent).toContain('/compact');
  });

  it('提示词为空时不报警——那时命令照常是命令', () =>
  {
    const { view } = setup();

    typeInto(view, '/compact');

    expect(view.container.querySelector('.composer-warning')).toBeNull();
  });

  it('内容不是命令就不报警', () =>
  {
    // 「看一下 /c/Users/x」这种再普通不过的话不该弹警告。
    const { view } = setup();

    typePrompt(view, '用中文回答');
    typeInto(view, '看一下 /c/Users/x');

    expect(view.container.querySelector('.composer-warning')).toBeNull();
  });

  it('只是警告，不拦着发', () =>
  {
    // 拦下来就成了「按了没反应」。说清楚后果，发不发是用户的事。
    //
    // 故意用一条**不在补全清单里**的命令：清单里的那些会把补全弹层弹出来，
    // 那时 Enter 归弹层（选中命令），根本走不到发送这一步。
    const { view, onSend } = setup();

    typePrompt(view, '用中文回答');
    fireEvent.keyDown(typeInto(view, '/doctor'), { key: 'Enter' });

    expect(onSend).toHaveBeenCalledWith('用中文回答\n/doctor', []);
  });
});
