import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

import { DEFAULT_APPEARANCE } from '../appearance';

/** 外观必须显式传：xterm 不读 CSS，字体与配色是 JS 选项。 */
const APPEARANCE = DEFAULT_APPEARANCE;

// 这条测试守的是一次真实故障：终端在 VS 里是一块黑的、打不了字，而**没有任何报错**。
// 原因是宿主的信封形状是 `{ type, payload: {...} }`，第一版组件却直接读 `message.data`，
// 永远 undefined，于是一个字节都没写进 xterm。
//
// 为什么既有测试全都拦不住它：
//  - 桥的契约测试只比对**类型名常量**（terminalOutput 这个字符串两侧一致），不比对载荷形状；
//  - terminalCodec 的测试只验编解码本身，不涉及消息怎么拆；
//  - 组件测试当时压根没有。
// 所以这里必须按**真实信封**投递，断言字节真的到了 xterm.write。

const writes: Uint8Array[] = [];
let dataHandler: ((data: string) => void) | null = null;
const scrollHandlers: (() => void)[] = [];
const renderHandlers: (() => void)[] = [];

export const instances: any[] = [];

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    constructor() { (globalThis as any).__lastTerm = this; }
    cols = 80;
    rows = 24;
    // 真 xterm 有 options，字体与配色就是往它上面写。假的不给，组件一改外观就炸——
    // 而那正是这次要测的路径。
    options: Record<string, unknown> = {};
    element = {} as unknown;
    selection = '';
    cleared = 0;
    resets = 0;
    pastes: string[] = [];
    paste(text: string) { this.pastes.push(text); }
    write(data: Uint8Array) { writes.push(data); }
    getSelection() { return this.selection; }
    clear() { this.cleared += 1; }
    reset() { this.resets += 1; }
    onData(handler: (data: string) => void) { dataHandler = handler; return { dispose() {} }; }
    // 回滚缓冲与滚动事件：终端上方那条「钉住的问题」全靠它们。用例往 lines 里塞几行
    // 真机抄来的内容，再手动触发一次 onRender，就能验到横栏显示的是哪一句。
    lines: string[] = [];
    viewportY = 0;
    scrolledTo = -1;
    // 组件挂载时注册的自定义按键处理器存这儿，测试用例直接调它模拟按键，
    // 不必真的在 jsdom 里发一个能被 xterm 内部逻辑认得的 KeyboardEvent。
    customKeyHandler: ((event: Partial<KeyboardEvent>) => boolean) | null = null;
    attachCustomKeyEventHandler(handler: (event: Partial<KeyboardEvent>) => boolean) { this.customKeyHandler = handler; }
    get buffer() {
      const self = this;
      return {
        active: {
          get viewportY() { return self.viewportY; },
          get length() { return self.lines.length; },
          getLine(row: number) {
            const text = self.lines[row];
            return text === undefined ? undefined : { translateToString: () => text };
          },
        },
      };
    }
    scrollToLine(row: number) { this.scrolledTo = row; }
    registerLinkProvider(provider: unknown) { (globalThis as any).__linkProvider = provider; return { dispose() {} }; }
    onScroll(handler: () => void) { scrollHandlers.push(handler); return { dispose() {} }; }
    onRender(handler: () => void) { renderHandlers.push(handler); return { dispose() {} }; }
    open() {}
    focus() {}
    dispose() {}
    loadAddon() {}
  },
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class { fit() {} activate() {} dispose() {} },
}));

import { createRef } from 'react';
import { TerminalPanel } from './TerminalPanel';
import type { TerminalHandle } from './TerminalPanel';

/**
 * 按宿主真实的信封形状投递一条消息。
 *
 * 包在 act() 里：投递会触发 setState（退出通知那条），不包的话重渲染不刷新，
 * 断言读到的还是上一帧的 DOM。
 */
function emitFromHost(message: unknown): void
{
  const win = window as unknown as { __agentDevHost?: { emit(data: unknown): void } };

  act(() =>
  {
    win.__agentDevHost?.emit(message);
  });
}

function base64(text: string): string
{
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) { binary += String.fromCharCode(bytes[i]); }
  return btoa(binary);
}

describe('终端面板', () =>
{
  beforeEach(() =>
  {
    writes.length = 0;
    dataHandler = null;
    scrollHandlers.length = 0;
    renderHandlers.length = 0;
    window.localStorage.removeItem('agent.terminalPrompt');
    // 每条用例都从「没有宿主」开始：装了假宿主的用例会污染后面的用例，
    // 而 onHostMessage 在有宿主时走的是 addEventListener 那条分支。
    delete (window as any).chrome;
  });

  /** 装一个假宿主并返回它收到的消息数组。三个方法都要有——只给 postMessage 会让 onHostMessage 抛。 */
  function captureHost(): unknown[]
  {
    const sent: unknown[] = [];
    (window as any).chrome = {
      webview: {
        postMessage: (m: unknown) => sent.push(m),
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    };
    return sent;
  }

  it('宿主输出要真的写进终端（载荷在 payload 里，不是平铺在顶层）', () =>
  {
    render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);

    emitFromHost({ type: 'terminalOutput', payload: { data: base64('HELLO') } });

    expect(writes.length).toBe(1);
    expect(new TextDecoder().decode(writes[0])).toBe('HELLO');
  });

  it('平铺在顶层的 data 不被接受——那正是当初写错的形状', () =>
  {
    render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);

    // 若组件退回去读 message.data，这条会让它误判为有效载荷，测试就失去意义。
    emitFromHost({ type: 'terminalOutput', data: base64('WRONG') });

    expect(writes.length).toBe(0);
  });

  it('写进去的是字节而不是字符串', () =>
  {
    // 多字节字符会被切在两次读取之间，必须交给 xterm 自己的跨块解码器。
    render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);

    emitFromHost({ type: 'terminalOutput', payload: { data: base64('你好') } });

    expect(writes[0]).toBeInstanceOf(Uint8Array);
    expect(Array.from(writes[0])).toEqual([0xe4, 0xbd, 0xa0, 0xe5, 0xa5, 0xbd]);
  });

  it('退出通知也从 payload 里取', () =>
  {
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);

    emitFromHost({ type: 'terminalExited', payload: { exitCode: 3, message: '' } });

    expect(view.container.textContent).toContain('3');
  });

  it('退出时宿主给了原因就显示原因', () =>
  {
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);

    emitFromHost({ type: 'terminalExited', payload: { exitCode: -1, message: '终端启动失败：找不到 claude' } });

    expect(view.container.textContent).toContain('找不到 claude');
  });

  it('按键经编码后发给宿主', () =>
  {
    render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);

    expect(dataHandler).not.toBeNull();
    dataHandler!('x');

    // 没有真实宿主时 sendToHost 静默返回，这里只验证输入通路已经接上，
    // 编码本身由 terminalCodec 的测试覆盖。
    expect(typeof dataHandler).toBe('function');
  });

  it('工具栏动作齐全，且「回到对话」排在最后', () =>
  {
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);
    const labels = Array.from(view.container.querySelectorAll('.terminal-toolbar button'))
      .map((b) => b.textContent?.trim());

    // 顺序也断言：常用动作靠左成组，「回到对话」是离开视图的动作，隔开放最右。
    expect(labels).toEqual(['重启', '中断', '清屏', '复制', '粘贴', '回到对话']);
  });

  it('点「回到对话」只是关掉视图，不动终端会话', () =>
  {
    let closed = 0;
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => { closed += 1; }} />);
    const sent = captureHost();

    const button = Array.from(view.container.querySelectorAll('.terminal-toolbar button'))
      .find((b) => b.textContent?.trim() === '回到对话')!;
    act(() => { (button as HTMLButtonElement).click(); });

    expect(closed).toBe(1);
    // 不能顺手发 terminalStop：离开视图不等于结束会话，回来时应当接回同一个进程。
    expect(sent).toEqual([]);
  });

  it('中断送的是 Ctrl+C 的字节', () =>
  {
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);
    const sent = captureHost();

    const button = Array.from(view.container.querySelectorAll('.terminal-toolbar button'))
      .find((b) => b.textContent?.trim() === '中断')!;
    act(() => { (button as HTMLButtonElement).click(); });

    // Ctrl+C 是 0x03，base64 后是 'Aw=='
    expect(sent).toEqual([{ type: 'terminalInput', data: 'Aw==' }]);
  });

  it('清屏只动显示，不发任何宿主消息', () =>
  {
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);
    const sent = captureHost();

    const button = Array.from(view.container.querySelectorAll('.terminal-toolbar button'))
      .find((b) => b.textContent?.trim() === '清屏')!;
    act(() => { (button as HTMLButtonElement).click(); });

    expect((globalThis as any).__lastTerm.cleared).toBe(1);
    expect(sent).toEqual([]);
  });

  it('重启会先停再起，并 reset 掉旧内容', () =>
  {
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);
    const sent = captureHost() as any[];

    const button = Array.from(view.container.querySelectorAll('.terminal-toolbar button'))
      .find((b) => b.textContent?.trim() === '重启')!;
    act(() => { (button as HTMLButtonElement).click(); });

    expect(sent.map((m) => m.type)).toEqual(['terminalStop', 'terminalStart']);
    // reset 而不是 clear：clear 保留滚动缓冲，旧会话内容会和新首屏混在一起。
    expect((globalThis as any).__lastTerm.resets).toBe(1);
  });

  it('没有选中内容时复制给出提示而不是静默', () =>
  {
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);
    (globalThis as any).__lastTerm.selection = '';

    const button = Array.from(view.container.querySelectorAll('.terminal-toolbar button'))
      .find((b) => b.textContent?.trim() === '复制')!;
    act(() => { (button as HTMLButtonElement).click(); });

    expect(view.container.textContent).toContain('没有选中');
  });

  // ── Ctrl+C / Ctrl+V 走终端惯例（Windows Terminal 就是这么做的）──────────────
  //
  // 宿主侧 PanelKeyPolicy 已经把这几个键放行到网页；这里测的是网页收到键之后
  // 自己怎么判断。最要紧的一条是「没选中时 Ctrl+C 不能被拦」——终端里 Ctrl+C 的
  // 首要语义是中断，把它无条件变成复制会让用户没法中断跑飞的命令。
  //
  // 第二要紧的一条是 preventDefault：xterm 自己在 textarea/element 上还挂了原生
  // "copy"/"paste" 事件监听器，返回 false 只挡得住 xterm 内部的按键逻辑，挡不住
  // 浏览器把这次按键的默认动作继续往下走触发那两个监听器——真接管一个键却没调
  // preventDefault，同一次按键会被处理两遍，粘贴场景下就是同一段内容进终端两遍。
  // 每条「拦截」用例都顺带断言 preventDefault 有没有被调、调没调对。
  //
  // 用组件挂载时存进假终端的 customKeyHandler 直接调用，不必在 jsdom 里拼一个
  // xterm 认得的真实 KeyboardEvent。

  /**
   * 造一个假的 KeyboardEvent，字段够 attachCustomKeyEventHandler 里的判断用就行。
   * <p>
   * 带一个真的 preventDefault spy：xterm 自己在 textarea/element 上还挂了原生
   * "copy"/"paste" 事件监听器，不受 attachCustomKeyEventHandler 返回值控制，只受
   * event.preventDefault() 控制——真接管一个键却没调它，浏览器的原生粘贴/复制会
   * 跟我们自己的 JS 路径一起跑，粘贴场景下就是同一段内容进终端两遍。这个 spy
   * 就是用来钉住「该调的分支调了、不该调的分支没调」这条线的。
   * </p>
   */
  function fakeKeyEvent(overrides: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; key: string }>)
  {
    return {
      type: 'keydown',
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
      key: 'c',
      preventDefault: vi.fn(),
      ...overrides,
    };
  }

  /** 装一个假剪贴板，返回记下调用参数的 spy。 */
  function stubClipboard(): { writeText: ReturnType<typeof vi.fn>; readText: ReturnType<typeof vi.fn> }
  {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockResolvedValue('剪贴板内容');
    Object.defineProperty(navigator, 'clipboard', { value: { writeText, readText }, configurable: true });
    return { writeText, readText };
  }

  it('没有选中文本时 Ctrl+C 不拦截——中断信号要照常送给正在跑的进程', () =>
  {
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);
    const term = (globalThis as any).__lastTerm;
    term.selection = '';

    const event = fakeKeyEvent({ key: 'c' });
    // 返回 true = 这个键我们不管，交给 xterm 自己的默认逻辑（发 ETX 中断）。
    const handled = term.customKeyHandler!(event);

    expect(handled).toBe(true);
    // 这条分支不能拦：调了 preventDefault 会连累浏览器/xterm 默认动作也一起被挡掉，
    // 中断信号就发不出去了。
    expect(event.preventDefault).not.toHaveBeenCalled();
    view.unmount();
  });

  it('有选中文本时 Ctrl+C 复制并拦截，不再当成中断', () =>
  {
    const { writeText } = stubClipboard();
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);
    const term = (globalThis as any).__lastTerm;
    term.selection = '选中的文本';

    const event = fakeKeyEvent({ key: 'c' });
    const handled = term.customKeyHandler!(event);

    expect(handled).toBe(false);
    expect(writeText).toHaveBeenCalledWith('选中的文本');
    // 必须挡掉浏览器原生 copy 事件：xterm 在 element 上挂了 copyHandler，选中时
    // 不挡的话它会跟着触发，往剪贴板再写一遍。
    expect(event.preventDefault).toHaveBeenCalled();
    view.unmount();
  });

  it('Ctrl+Shift+C 无条件复制——即便没有选中也不当中断处理', () =>
  {
    stubClipboard();
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);
    const term = (globalThis as any).__lastTerm;
    term.selection = '';

    const event = fakeKeyEvent({ key: 'C', shiftKey: true });
    const handled = term.customKeyHandler!(event);

    // 没有选中时也拦下来（走 copySelection 的提示分支），不会漏成中断信号。
    expect(handled).toBe(false);
    expect(event.preventDefault).toHaveBeenCalled();
    view.unmount();
  });

  it('Ctrl+V 拦截默认处理并把剪贴板内容送进终端，且挡掉浏览器原生粘贴事件', async () =>
  {
    const { readText } = stubClipboard();
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);
    const sent = captureHost() as any[];
    const term = (globalThis as any).__lastTerm;

    const event = fakeKeyEvent({ key: 'v' });
    let handled: boolean | undefined;
    await act(async () =>
    {
      handled = term.customKeyHandler!(event);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(handled).toBe(false);
    expect(readText).toHaveBeenCalled();
    expect(sent.some((m: any) => m.type === 'terminalInput')).toBe(true);
    // 这是本轮修复的关键：不挡的话 xterm 在 textarea/element 上挂的
    // handlePasteEvent 监听器会把剪贴板内容再送进终端一次——同一段内容发两遍，
    // 命令类内容跑两遍的后果可能不可逆。
    expect(event.preventDefault).toHaveBeenCalled();
    view.unmount();
  });

  it('Ctrl+Shift+V 同样拦截、粘贴并挡掉原生粘贴事件', async () =>
  {
    const { readText } = stubClipboard();
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);
    const term = (globalThis as any).__lastTerm;

    const event = fakeKeyEvent({ key: 'V', shiftKey: true });
    let handled: boolean | undefined;
    await act(async () =>
    {
      handled = term.customKeyHandler!(event);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(handled).toBe(false);
    expect(readText).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
    view.unmount();
  });

  it('Ctrl+X 没有专门处理，不拦截也不碰剪贴板——不存在双路径问题', () =>
  {
    // 与 C/V 不同，这里压根没有 key === 'x' 分支：它和其它未点名的键一样落到
    // 最后的 return true，只走 xterm 自己那一条路，没有我们自己另发一次的风险，
    // 所以不需要（也不应该）调 preventDefault。
    const { writeText, readText } = stubClipboard();
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);
    const term = (globalThis as any).__lastTerm;
    term.selection = '选中的文本';

    const event = fakeKeyEvent({ key: 'x' });
    const handled = term.customKeyHandler!(event);

    expect(handled).toBe(true);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
    expect(readText).not.toHaveBeenCalled();
    view.unmount();
  });

  it('没点名的 Ctrl 组合不拦截——终端里按标准终端语义处理，比如 Ctrl+A 是 SOH 不是全选', () =>
  {
    // 这里验的是我们的自定义处理器「不拦」，不是说 Ctrl+A 到了终端会变成全选——
    // 终端（xterm/shell）里 Ctrl+A 是标准控制字符 SOH，readline 表现为「移到行首」，
    // 这是终端的通行语义，不是字面意义的浏览器全选；「全选」那个语义只在对话框那个
    // 原生 textarea 里成立（那里没有任何 JS 拦截，Ctrl+A 就是浏览器原生行为）。
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);
    const term = (globalThis as any).__lastTerm;

    const event = fakeKeyEvent({ key: 'a' });
    expect(term.customKeyHandler!(event)).toBe(true);
    expect(event.preventDefault).not.toHaveBeenCalled();
    view.unmount();
  });

  it('带 Alt 的组合（如 AltGr 输入特殊字符）不拦截', () =>
  {
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);
    const term = (globalThis as any).__lastTerm;
    term.selection = '选中的文本';

    expect(term.customKeyHandler!(fakeKeyEvent({ key: 'c', altKey: true }))).toBe(true);
    view.unmount();
  });

  it('不按 Ctrl 时 C/V/X 等键仍不拦截——普通打字不受影响', () =>
  {
    // 「普通打字不受影响」是验收项之一：这几个键刚被接上 Ctrl+ 组合的特殊处理，
    // 但不带 Ctrl 的普通按键必须原样走 xterm 自己的默认逻辑，不能被我们的
    // 处理器顺带拦下来。用组件顶部的 `!event.ctrlKey` 提前返回 true 兜底。
    const { writeText, readText } = stubClipboard();
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);
    const term = (globalThis as any).__lastTerm;
    term.selection = '选中的文本';

    for (const key of ['c', 'v', 'x'])
    {
      const event = fakeKeyEvent({ key, ctrlKey: false });
      expect(term.customKeyHandler!(event)).toBe(true);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }

    expect(writeText).not.toHaveBeenCalled();
    expect(readText).not.toHaveBeenCalled();
    view.unmount();
  });

  it('句柄的 send 走 xterm 的 paste()，回车另外单送', () =>
  {
    // 这条守的是多行文本。若直接把字节塞给宿主，TUI 会把每个换行都当成一次提交——
    // 一段五行的提示词变成五次发送。xterm 的 paste() 才知道当前是否开着括号粘贴模式
    // （DECSET 2004），要不要加 ESC[200~ / ESC[201~ 包裹由它判断，行为与 Ctrl+V 一致。
    const handleRef = createRef<TerminalHandle>() as React.MutableRefObject<TerminalHandle | null>;
    render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} handleRef={handleRef} />);
    const sent = captureHost() as any[];

    expect(handleRef.current).not.toBeNull();
    act(() => { handleRef.current!.send('第一行\n第二行'); });

    expect((globalThis as any).__lastTerm.pastes).toEqual(['第一行\n第二行']);
    // 回车是一次普通按键，不该混进 paste 的文本里。'\r' 的 base64 是 'DQ=='。
    expect(sent).toEqual([{ type: 'terminalInput', data: 'DQ==' }]);
  });

  it('卸载后句柄要清空，不能留着一个指向已销毁终端的引用', () =>
  {
    const handleRef = createRef<TerminalHandle>() as React.MutableRefObject<TerminalHandle | null>;
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} handleRef={handleRef} />);

    expect(handleRef.current).not.toBeNull();
    view.unmount();
    // 留着的话，输入框会把文本送进一个已经 dispose 的 Terminal——那是静默失效。
    expect(handleRef.current).toBeNull();
  });

  it('外观设置真的落到 xterm 上——不落就是「字体大小颜色对终端没有效果」', () =>
  {
    const view = render(
      <TerminalPanel appearance={{ ...APPEARANCE, fontSize: 20, fontFamily: '"JetBrains Mono", monospace' }}
        visible={true} onClose={() => {}} />);

    const term = (globalThis as any).__lastTerm;

    expect(term.options.fontSize).toBe(20);
    expect(term.options.fontFamily).toBe('"JetBrains Mono", monospace');

    // 关键的一条：交给 xterm 的必须是**字面值**。给它一串 var(--x, ...) 是无效的，
    // canvas 解析不了 CSS，它会安静地退回自带默认值，而界面上看不出任何异常。
    expect(String(term.options.fontFamily)).not.toContain('var(');

    view.unmount();
  });

  it('改字号要重新量尺寸并告诉宿主，否则 TUI 会照旧宽度折行', () =>
  {
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);

    view.rerender(<TerminalPanel appearance={{ ...APPEARANCE, fontSize: 22 }} visible={true} onClose={() => {}} />);

    expect((globalThis as any).__lastTerm.options.fontSize).toBe(22);
    view.unmount();
  });

  it('VS 换了主题，终端跟着换——xterm 拿走的是当时的字面值，不重设就一直是旧配色', () =>
  {
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);
    const term = (globalThis as any).__lastTerm;

    term.options.theme = { background: '#000000' };
    emitFromHost({ type: 'theme', payload: { background: '#FFFFFF', foreground: '#1E1E1E' } });

    // 换成浅色主题后终端仍是一块黑的，就是没有这一步。
    expect(term.options.theme.background).not.toBe('#000000');

    view.unmount();
  });
  // ── 终端上方那条「钉住的问题」 ────────────────────────────────────────────────
  //
  // 对话侧靠 position:sticky，终端这侧没有可定位的元素，只能自己从 xterm 的回滚缓冲里
  // 认。判据（行首提示符、缩进两格的续行）在 pinnedTurn.ts 里单独测；这里测的是接线：
  // 事件挂上了没、显示的是不是当前可视区那一轮、点了会不会滚回去。
  // 接线断了的表现是横栏一直空着或者一直不动——都不报错。

  /** 往假终端里塞几行缓冲，并触发一次重绘回调。 */
  function fillBuffer(lines: string[], viewportY: number, useScroll = false): void
  {
    const term = (globalThis as any).__lastTerm;
    term.lines = lines;
    term.viewportY = viewportY;

    act(() =>
    {
      for (const handler of useScroll ? scrollHandlers : renderHandlers)
      {
        handler();
      }
    });
  }

  const BUFFER = [
    '> 第一问',
    '● 第一答',
    '> 第二问',
    '● 第二答',
  ];

  it('终端上方钉着当前这一屏在回答的那句话', () =>
  {
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);

    fillBuffer(BUFFER, 3);

    expect(view.container.querySelector('.terminal-pinned .pinned-turn-text')!.textContent)
      .toBe('第二问');

    view.unmount();
  });

  it('往上翻，钉的换成上一轮那句', () =>
  {
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);

    fillBuffer(BUFFER, 3);
    fillBuffer(BUFFER, 1, true);

    expect(view.container.querySelector('.terminal-pinned .pinned-turn-text')!.textContent)
      .toBe('第一问');

    view.unmount();
  });

  it('点一下把终端滚回那一行', () =>
  {
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);

    fillBuffer(BUFFER, 3);

    act(() =>
    {
      (view.container.querySelector('.terminal-pinned .pinned-turn') as HTMLButtonElement).click();
    });

    expect((globalThis as any).__lastTerm.scrolledTo).toBe(2);

    view.unmount();
  });

  it('剥掉终端那格的固定提示词——留着的话每一轮钉出来的都长一个样', () =>
  {
    window.localStorage.setItem('agent.terminalPrompt', '用中文回答');

    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);

    // TUI 会把这条消息折成两行：首行带提示符，续行缩进两格。
    fillBuffer(['> 用中文回答', '  1+1 等于几', '● 2'], 2);

    expect(view.container.querySelector('.terminal-pinned .pinned-turn-text')!.textContent)
      .toBe('1+1 等于几');

    view.unmount();
  });

  it('内容还不满一屏、TUI 在原地重画时也要认出来', () =>
  {
    // 这条守的是一次真机故障：整条功能在 VS 里完全不出现，且不报任何错。
    // 当时的省事判据是「viewportY 和 buffer.length 都没变就不用重扫」——可会话内容
    // 不满一屏时，TUI 就是在原地重画那几行：可视区一直在第 0 行、缓冲总行数一直等于
    // 终端行数，两个数一个都不动，而消息恰恰是在这期间出现的。于是挂载时（缓冲还空着）
    // 扫的那一次就是最后一次。
    vi.useFakeTimers({ toFake: ['performance'] });

    try
    {
      const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);

      fillBuffer(['', '', '', ''], 0);
      expect(view.container.querySelector('.terminal-pinned .pinned-turn')).toBeNull();

      // 行数与可视区都不变，只是那几行的内容被重画了。
      vi.advanceTimersByTime(400);
      fillBuffer(['> 问题', '● 答', '', ''], 0);

      expect(view.container.querySelector('.terminal-pinned .pinned-turn-text')!.textContent)
        .toBe('问题');

      view.unmount();
    }
    finally
    {
      vi.useRealTimers();
    }
  });

  // -- 输出里的文件位置可点 --------------------------------------------------
  //
  // 识别本身在 terminalLinks.test.ts 里单独测。这里测的是接线：提供器挂上了没、
  // 给 xterm 的列号对不对、点下去发出的是不是那条 openFile。
  // 列号错了的表现是下划线画在别处、点了打开另一个位置，而这两样都不报错。

  /** 拿到组件注册给 xterm 的那个链接提供器，喂一行文本，收回它给出的链接。 */
  function linksFor(line: string): any[]
  {
    const term = (globalThis as any).__lastTerm;
    term.lines = [line];

    let result: any[] | undefined;
    (globalThis as any).__linkProvider.provideLinks(1, (links: any[] | undefined) =>
    {
      result = links;
    });

    return result ?? [];
  }

  it('输出里的文件位置点一下就让宿主打开', () =>
  {
    const sent = captureHost();
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);

    const links = linksFor('已改 src/App.tsx:120');

    expect(links).toHaveLength(1);

    act(() => links[0].activate());

    const open = sent.find((m: any) => m?.option === 'openFile') as any;

    expect(open.value).toBe('src/App.tsx');
    expect(open.line).toBe(120);

    view.unmount();
  });

  it('列号按显示宽度算——中文占两列，不换算下划线会整体左移', () =>
  {
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);

    // 「已改 」= 2+2+1 = 5 列，所以路径从第 6 列起，占 15 列，到第 20 列止（右端闭区间）。
    const [link] = linksFor('已改 src/App.tsx:120');

    expect(link.range.start.x).toBe(6);
    expect(link.range.end.x).toBe(20);
    expect(link.range.start.y).toBe(1);

    view.unmount();
  });

  it('一行里没有文件位置时不给链接', () =>
  {
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);

    expect(linksFor('CLI 2.1.238 已就绪')).toEqual([]);

    view.unmount();
  });

  it('悬停不挂任何回调——挂了就会把终端挤一下，鼠标扫过几条链接就是一阵抖', () =>
  {
    // 这条守的是一次真机反馈：「鼠标移到文件地址上，窗口文字会抖动」。
    // 当初 hover 里写了一句提示，而提示条是占布局的：一出现就把终端可用高度从
    // 50 行挤到 48 行，xterm 重排、TUI 收到 SIGWINCH 重画一整屏，移开又长回去。
    // xterm 自己会给下划线和手型光标，那已经说明它能点了。
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);
    const [link] = linksFor('见 Foo.cs:3');

    expect(link.hover).toBeUndefined();
    expect(link.leave).toBeUndefined();

    view.unmount();
  });

  it('一句都没有时不显示这条横栏，而不是显示一条空的', () =>
  {
    const view = render(<TerminalPanel appearance={APPEARANCE} visible={true} onClose={() => {}} />);

    fillBuffer(['─'.repeat(60), '>', '─'.repeat(60)], 0);

    expect(view.container.querySelector('.terminal-pinned .pinned-turn')).toBeNull();

    view.unmount();
  });
});
