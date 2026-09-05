import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import type { MutableRefObject } from 'react';
import { TerminalComposer } from './TerminalComposer';
import type { TerminalHandle } from './TerminalPanel';

/** 终端里能用的命令。真实清单来自 CLI 握手，这里给几条够测行为的。 */
const COMMANDS = ['model', 'effort', 'plugins', 'resume', 'status'];

/** 造一个记录调用的假句柄。 */
function fakeHandle()
{
  const sent: string[] = [];
  const keys: string[] = [];
  let focused = 0;
  const ref = createRef<TerminalHandle>() as MutableRefObject<TerminalHandle | null>;

  ref.current = {
    send(text: string) { sent.push(text); },
    sendKey(data: string) { keys.push(data); },
    focus() { focused += 1; },
  };

  return { ref, sent, keys, focusCount: () => focused };
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
  fireEvent.change(box, { target: { value: text } });
  return box;
}

function typePrompt(view: ReturnType<typeof render>, text: string): HTMLTextAreaElement
{
  const box = promptBox(view);
  fireEvent.change(box, { target: { value: text } });
  return box;
}

beforeEach(() =>
{
  // 提示词是跨会话留存的，用例之间必须清干净，否则上一条的提示词会拼进下一条。
  window.localStorage.removeItem('agent.terminalPrompt');
  window.localStorage.removeItem('agent.terminalPromptHeight');
  window.localStorage.removeItem('agent.composerHeight');
});

describe('终端输入框', () =>
{
  it('Enter 把内容送进终端并清空草稿', () =>
  {
    const h = fakeHandle();
    const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    // 用不触发补全的文本：敲 `/` 开头的东西时 Enter 归补全弹层，那条另有用例。
    const box = typeInto(view, 'npm run build');
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(h.sent).toEqual(['npm run build']);
    expect(box.value).toBe('');
  });

  it('Shift+Enter 只换行，不发送', () =>
  {
    const h = fakeHandle();
    const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    const box = typeInto(view, '第一行');
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });

    // 多行提示词要能一次写完再送。若这里也发送，第二行就永远打不出来。
    expect(h.sent).toEqual([]);
    expect(box.value).toBe('第一行');
  });

  it('终端还没建好时不发送，也**不**清空草稿', () =>
  {
    const ref = createRef<TerminalHandle>() as MutableRefObject<TerminalHandle | null>;
    const view = render(<TerminalComposer handleRef={ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    const box = typeInto(view, '别把我吃掉');
    fireEvent.keyDown(box, { key: 'Enter' });

    // 清空等于把用户敲的东西悄悄吞了，而且毫无提示——这正是本项目反复栽的那类静默失效。
    expect(box.value).toBe('别把我吃掉');
  });

  it('Esc 把焦点交回终端本体', () =>
  {
    const h = fakeHandle();
    const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    // TUI 的上下选、Ctrl 组合键必须打在终端上，没有这个出口就只能用鼠标点回去。
    fireEvent.keyDown(view.container.querySelector('textarea')!, { key: 'Escape' });

    expect(h.focusCount()).toBe(1);
  });

  it('空草稿时发送按钮不可点', () =>
  {
    const h = fakeHandle();
    const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    const button = view.container.querySelector<HTMLButtonElement>('.composer-button')!;
    expect(button.disabled).toBe(true);

    typeInto(view, 'x');
    expect(button.disabled).toBe(false);
  });

  it('多行内容整段送出，不在这里拆行', () =>
  {
    const h = fakeHandle();
    const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    const box = typeInto(view, ['第一行', '第二行'].join('\n'));
    fireEvent.keyDown(box, { key: 'Enter' });

    // 拆行由 xterm 的 paste() 按括号粘贴模式决定，输入框不许自作主张——
    // 在这里逐行送会让 TUI 把每一行都当成一次提交。
    expect(h.sent).toEqual([['第一行', '第二行'].join('\n')]);
  });

  it('敲 / 弹出命令补全——「命令感知」丢的就是这个', () =>
  {
    const h = fakeHandle();
    const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    typeInto(view, '/mod');

    const popup = view.container.querySelector('.slash-popup');
    expect(popup).not.toBeNull();
    expect(popup!.textContent).toContain('model');
  });

  it('Enter 在弹层开着时是「选中这条命令」，不是把半截命令发进终端', () =>
  {
    const h = fakeHandle();
    const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    const box = typeInto(view, '/mod');
    fireEvent.keyDown(box, { key: 'Enter' });

    // 发出去的话，终端里会多一条它不认识的 /mod。
    expect(h.sent).toEqual([]);
    expect(box.value).toBe('/model ');
  });

  it('补全关掉之后 Enter 才恢复成发送', () =>
  {
    const h = fakeHandle();
    const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    const box = typeInto(view, '/mod');
    fireEvent.keyDown(box, { key: 'Escape' });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(h.sent).toEqual(['/mod']);
  });

  it('Esc 先关弹层，再按才把焦点交回终端', () =>
  {
    const h = fakeHandle();
    const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    const box = typeInto(view, '/mod');

    // 第一下 Esc 归弹层。此时就把焦点丢回终端，用户会发现自己正打着的命令没了着落。
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(h.focusCount()).toBe(0);
    expect(view.container.querySelector('.slash-popup')).toBeNull();

    fireEvent.keyDown(box, { key: 'Escape' });
    expect(h.focusCount()).toBe(1);
  });

  it('命令后面补一个空格，省得每次自己再敲', () =>
  {
    const h = fakeHandle();
    const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    const box = typeInto(view, '/plug');
    fireEvent.keyDown(box, { key: 'Tab' });

    expect(box.value).toBe('/plugins ');
  });

  it('普通文本里的斜杠不触发补全', () =>
  {
    const h = fakeHandle();
    const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    typeInto(view, '看一下 src/App.tsx');

    expect(view.container.querySelector('.slash-popup')).toBeNull();
  });

  it('发送时提示词在前、内容在后', () =>
  {
    const h = fakeHandle();
    const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    typePrompt(view, '用中文回答');
    const box = typeInto(view, '解释这段代码');
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(h.sent).toEqual(['用中文回答\n解释这段代码']);
  });

  it('发完只清内容那一格，提示词留着', () =>
  {
    const h = fakeHandle();
    const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    typePrompt(view, '用中文回答');
    const box = typeInto(view, '第一次');
    fireEvent.keyDown(box, { key: 'Enter' });

    // 提示词的用处就是不用每次重打，清掉等于没有这个功能。
    expect(promptBox(view).value).toBe('用中文回答');
    expect(contentBox(view).value).toBe('');

    // 再发一次，提示词照样带上。
    const again = typeInto(view, '第二次');
    fireEvent.keyDown(again, { key: 'Enter' });

    expect(h.sent).toEqual(['用中文回答\n第一次', '用中文回答\n第二次']);
  });

  it('提示词跨挂载留存', () =>
  {
    const first = render(<TerminalComposer handleRef={fakeHandle().ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);
    typePrompt(first, '固定的那段');
    first.unmount();

    const second = render(<TerminalComposer handleRef={fakeHandle().ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    // 关掉面板再回来还得在，否则「固定」两个字就是假的。
    expect(promptBox(second).value).toBe('固定的那段');
  });

  it('提示词那一格的 Enter 也是发送', () =>
  {
    const h = fakeHandle();
    const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    typeInto(view, '正文');
    const box = typePrompt(view, '前缀');
    fireEvent.keyDown(box, { key: 'Enter' });

    // 同一个键在两个长得一样的框里做两件事，记不住也解释不清。
    expect(h.sent).toEqual(['前缀\n正文']);
  });

  it('提示词那一格 Shift+Enter 仍是换行', () =>
  {
    const h = fakeHandle();
    const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    const box = typePrompt(view, '第一行');
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });

    // 多行提示词是常见用法，这一下要是发送出去，第二行就永远打不出来。
    expect(h.sent).toEqual([]);
    expect(box.value).toBe('第一行');
  });

  it('只有提示词、内容为空时也能发', () =>
  {
    const h = fakeHandle();
    const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    typePrompt(view, '只有提示词');
    const button = view.container.querySelector<HTMLButtonElement>('.composer-button')!;

    expect(button.disabled).toBe(false);
    fireEvent.click(button);

    expect(h.sent).toEqual(['只有提示词']);
  });

  it('两格都空才不亮发送键', () =>
  {
    const h = fakeHandle();
    const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    const button = view.container.querySelector<HTMLButtonElement>('.composer-button')!;
    expect(button.disabled).toBe(true);

    typePrompt(view, 'x');
    expect(button.disabled).toBe(false);
  });

  it('两格各有各的把手', () =>
  {
    const h = fakeHandle();
    const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    // 共用一条的话，拖上面那格会把下面那格也改掉。
    expect(view.container.querySelectorAll('.composer-grip')).toHaveLength(2);
  });

  it('提示词非空 + 内容是命令时，警告这条命令已经不是命令了', () =>
  {
    const h = fakeHandle();
    const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    typeInto(view, '/help');
    expect(view.container.querySelector('.composer-warning')).toBeNull();

    typePrompt(view, '请只用一句话回答：');

    // 拼上提示词就成了多行，TUI 只把独占第一行的 /xxx 当命令。
    // 不说的话，界面上什么都不会变，只是烧了一次 token，而你以为执行了一条本地命令。
    const warning = view.container.querySelector('.composer-warning');
    expect(warning).not.toBeNull();
    expect(warning!.textContent).toContain('help');
  });

  it('不拿补全清单去核——清单本来就不全', () =>
  {
    const h = fakeHandle();
    const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    typePrompt(view, '前缀');
    typeInto(view, '/help');

    // COMMANDS 里没有 help，真机上 CLI 报的清单里也没有（只有 ralph-loop:help）。
    // 拿清单去核的话，这条警告会在最该出现的时候不出现——实测因此白烧过两次 token。
    expect(view.container.querySelector('.composer-warning')).not.toBeNull();
  });

  it('普通文本不报警', () =>
  {
    const h = fakeHandle();
    const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    typePrompt(view, '前缀');
    typeInto(view, '看一下 /usr/bin/env');

    expect(view.container.querySelector('.composer-warning')).toBeNull();
  });

  it('提示词为空时不报警——那时命令照常是命令', () =>
  {
    const h = fakeHandle();
    const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    typeInto(view, '/help');

    expect(view.container.querySelector('.composer-warning')).toBeNull();
  });
});

// —— @ 文件引用 ——
//
// 这一组测的是「终端那个输入框也能 @ 文件」。原先只有对话那个有，
// 而默认视图改到终端之后，用户第一眼用的就是这个框（2026-08-21 反馈）。

/** 发给宿主的一条消息。只取用得上的字段，别的不管。 */
interface HostMessage
{
  type: string;
  option?: string;
  value?: string;
  requestId?: string;
}

/**
 * 装一个假宿主，把发出去的消息收下来。
 * <p>
 * @ 检索是请求-响应式的，requestId 由模块级计数器生成，用例猜不到，只能从
 * 发出去的那条消息里读回来。顺带把「问出去的到底是什么」一并锁住——
 * 这条消息的形状（type / option / value）是跨语言契约的一部分，
 * C# 侧按 option === 'files' 分发（WebViewBridge.HandleQuery）。
 * </p>
 */
function captureHost(): { sent: HostMessage[]; restore(): void }
{
  const sent: HostMessage[] = [];
  const previous = window.chrome;

  window.chrome = {
    webview: {
      postMessage: (message: unknown) => { sent.push(message as HostMessage); },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  };

  return { sent, restore() { window.chrome = previous; } };
}

/** 最近一次文件检索请求；没有就返回 null。 */
function lastFileQuery(sent: HostMessage[]): HostMessage | null
{
  const queries = sent.filter((m) => m.type === 'query' && m.option === 'files');
  const last = queries.length > 0 ? queries[queries.length - 1] : null;

  return last;
}

/** 文件弹层里列出来的路径。 */
function mentionItems(view: ReturnType<typeof render>): string[]
{
  const nodes = view.container.querySelectorAll('.mention-popup .slash-popup-item');

  return Array.from(nodes).map((n) => n.textContent ?? '');
}

/** 把某次请求的回包喂回去。 */
function answer(
  view: ReturnType<typeof render>,
  handle: ReturnType<typeof fakeHandle>,
  requestId: string,
  results: string[]): void
{
  view.rerender(
    <TerminalComposer
      handleRef={handle.ref}
      commands={COMMANDS}
      fileResults={{ requestId, results }} droppedFiles={null}
    />);
}

describe('终端输入框的 @ 文件引用', () =>
{
  it('敲 @ 就向宿主要一次文件检索，问的是打出来的那半截', () =>
  {
    const host = captureHost();

    try
    {
      const h = fakeHandle();
      const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

      typeInto(view, '@ment');

      const query = lastFileQuery(host.sent);

      expect(query).not.toBeNull();
      expect(query!.value).toBe('ment');
      expect(query!.requestId).not.toBe('');
    }
    finally
    {
      host.restore();
    }
  });

  it('回包里的文件列出来', () =>
  {
    const host = captureHost();

    try
    {
      const h = fakeHandle();
      const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

      typeInto(view, '@ment');
      answer(view, h, lastFileQuery(host.sent)!.requestId!, ['src/mention.ts', 'src/mention.test.ts']);

      expect(mentionItems(view)).toEqual(['src/mention.ts', 'src/mention.test.ts']);
    }
    finally
    {
      host.restore();
    }
  });

  it('Enter 在文件弹层开着时是「选中这个文件」，不是把半截路径发进终端', () =>
  {
    const host = captureHost();

    try
    {
      const h = fakeHandle();
      const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

      const box = typeInto(view, '看看 @ment');
      answer(view, h, lastFileQuery(host.sent)!.requestId!, ['src/mention.ts']);

      fireEvent.keyDown(box, { key: 'Enter' });

      // 没发出去，而是把路径补进了草稿；后面补一个空格，接着打字不用自己加。
      expect(h.sent).toEqual([]);
      expect(box.value).toBe('看看 @src/mention.ts ');
    }
    finally
    {
      host.restore();
    }
  });

  it('补完之后弹层收起来，Enter 恢复成送进终端', () =>
  {
    const host = captureHost();

    try
    {
      const h = fakeHandle();
      const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

      const box = typeInto(view, '@ment');
      answer(view, h, lastFileQuery(host.sent)!.requestId!, ['src/mention.ts']);

      fireEvent.keyDown(box, { key: 'Enter' });
      expect(mentionItems(view)).toEqual([]);

      fireEvent.keyDown(box, { key: 'Enter' });
      expect(h.sent).toEqual(['@src/mention.ts ']);
    }
    finally
    {
      host.restore();
    }
  });

  it('方向键在文件弹层里选，选中的那条才是被补进去的', () =>
  {
    const host = captureHost();

    try
    {
      const h = fakeHandle();
      const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

      const box = typeInto(view, '@ment');
      answer(view, h, lastFileQuery(host.sent)!.requestId!, ['src/mention.ts', 'src/mention.test.ts']);

      fireEvent.keyDown(box, { key: 'ArrowDown' });
      fireEvent.keyDown(box, { key: 'Enter' });

      expect(box.value).toBe('@src/mention.test.ts ');
    }
    finally
    {
      host.restore();
    }
  });

  it('Esc 先关文件弹层，再按才把焦点交回终端', () =>
  {
    const host = captureHost();

    try
    {
      const h = fakeHandle();
      const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

      const box = typeInto(view, '@ment');
      answer(view, h, lastFileQuery(host.sent)!.requestId!, ['src/mention.ts']);

      fireEvent.keyDown(box, { key: 'Escape' });
      expect(mentionItems(view)).toEqual([]);
      expect(h.focusCount()).toBe(0);

      fireEvent.keyDown(box, { key: 'Escape' });
      expect(h.focusCount()).toBe(1);
    }
    finally
    {
      host.restore();
    }
  });

  it('弹层还没出来就按了 Esc：回包再到也不该弹出来', () =>
  {
    const host = captureHost();

    try
    {
      const h = fakeHandle();
      const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

      const box = typeInto(view, '@ment');
      const id = lastFileQuery(host.sent)!.requestId!;

      fireEvent.keyDown(box, { key: 'Escape' });

      // 回包比 Esc 晚到。认了的话，焦点已经交回终端了，弹层却自己冒出来。
      answer(view, h, id, ['src/mention.ts']);

      expect(mentionItems(view)).toEqual([]);
    }
    finally
    {
      host.restore();
    }
  });

  it('迟到的旧回包不覆盖新结果', () =>
  {
    const host = captureHost();

    try
    {
      const h = fakeHandle();
      const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

      typeInto(view, '@men');
      const stale = lastFileQuery(host.sent)!.requestId!;

      typeInto(view, '@mention');
      const fresh = lastFileQuery(host.sent)!.requestId!;

      answer(view, h, fresh, ['src/mention.ts']);
      answer(view, h, stale, ['src/menu.ts', 'src/men.ts']);

      expect(mentionItems(view)).toEqual(['src/mention.ts']);
    }
    finally
    {
      host.restore();
    }
  });

  it('斜杠补全开着时不弹文件——两个弹层不同时出现', () =>
  {
    const host = captureHost();

    try
    {
      const h = fakeHandle();
      const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

      // 先让文件弹层有内容，再敲出一条斜杠命令。
      typeInto(view, '@ment');
      answer(view, h, lastFileQuery(host.sent)!.requestId!, ['src/mention.ts']);

      typeInto(view, '/mod');

      expect(view.container.querySelector('.slash-popup:not(.mention-popup)')).not.toBeNull();
      expect(mentionItems(view)).toEqual([]);
    }
    finally
    {
      host.restore();
    }
  });

  it('邮箱之类的 @ 不触发检索——前面不是空白就不算引用', () =>
  {
    const host = captureHost();

    try
    {
      const h = fakeHandle();
      const view = render(<TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

      typeInto(view, '发给 a@b.com');

      expect(lastFileQuery(host.sent)).toBeNull();
    }
    finally
    {
      host.restore();
    }
  });
});

describe('终端输入框里的 Esc 就是打断', () =>
{
  // 用户反馈「esc 打断失效」（2026-08-21）。病根：这一格的 Esc 只把焦点移回终端，
  // **不把这一下 Esc 送进 TUI**，于是什么都没停下；要再按第二下（那时焦点已在终端上）
  // 才真打断。终端现在是默认视图，撞上的概率最高。
  it('Esc 把真正的 ESC 字节送进终端', () =>
  {
    const h = fakeHandle();
    const view = render(
      <TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    fireEvent.keyDown(contentBox(view), { key: 'Escape' });

    expect(h.keys).toEqual(['\u001b']);
  });

  it('送完还是要把焦点交回终端——两件事都要做', () =>
  {
    const h = fakeHandle();
    const view = render(
      <TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    fireEvent.keyDown(contentBox(view), { key: 'Escape' });

    expect(h.focusCount()).toBe(1);
  });

  it('不能当成「发一行」送出去——那会在终端里多敲一次回车', () =>
  {
    const h = fakeHandle();
    const view = render(
      <TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    fireEvent.keyDown(contentBox(view), { key: 'Escape' });

    expect(h.sent).toEqual([]);
  });

  it('补全弹层开着时 Esc 先关弹层，不打断', () =>
  {
    // 优先级和对话那边一致：弹层 > 打断。反过来的话补全就退不出去了。
    const h = fakeHandle();
    const view = render(
      <TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    const box = typeInto(view, '/mod');
    expect(view.container.querySelector('.slash-popup')).not.toBeNull();

    fireEvent.keyDown(box, { key: 'Escape' });

    expect(view.container.querySelector('.slash-popup')).toBeNull();
    expect(h.keys).toEqual([]);
  });

  it('提示词那一格按 Esc 同样打断', () =>
  {
    // 两格共用 handleSendKeys，容易在改动里只顾着一格。
    const h = fakeHandle();
    const view = render(
      <TerminalComposer handleRef={h.ref} commands={COMMANDS} fileResults={null} droppedFiles={null} />);

    fireEvent.keyDown(view.container.querySelector('.composer-prompt-row textarea')!, { key: 'Escape' });

    expect(h.keys).toEqual(['\u001b']);
  });
});
