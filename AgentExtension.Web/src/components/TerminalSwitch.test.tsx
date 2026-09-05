// 工具栏切型号/强度时，终端到底有没有跟着切。
//
// 这是用户又一次为同一件事提意见：界面显示的和终端里正在跑的不是一回事。
// 前几次是「点了没反应」和「置灰了什么也做不了」，这次是「明明能直接切，
// 却让我重启」。所以这里断言的不是「界面上出现了某句话」，而是
// **有没有真的把 /effort xhigh 送进终端**。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { DEFAULT_APPEARANCE } from '../appearance';

const RULE = '─'.repeat(40);

/** shift+tab。 */
const CYCLE_BYTES = '[Z';

/** 假终端。输入框那几行可以改——判空逻辑全靠它。 */
class FakeTerminal
{
  cols = 80;
  rows = 24;
  options: Record<string, unknown> = {};
  pastes: string[] = [];

  /** 光标那一行往上、到上边框为止的内容。默认是个空输入框。 */
  composerRows: string[] = ['>  '];

  /**
   * TUI 底栏上的权限模式环。顺序抄自 CLI 自己的换档函数：
   * manual → acceptEdits → plan → bypassPermissions → auto → manual。
   */
  modes: string[] = ['manual mode', 'accept edits', 'plan mode', 'bypass permissions', 'auto mode'];

  /** 默认停在 accept edits：下面的用例都拿它当终端起来时那一档。 */
  modeIndex = 1;

  /** 重画慢几拍：按下之后头几次读到的还是上一档。真终端就是这样。 */
  lagReads = 0;
  private lagLeft = 0;
  private prevIndex = 0;

  /** 收到一次 shift+tab 就往前转一格。 */
  advanceMode()
  {
    this.prevIndex = this.modeIndex;
    this.modeIndex = (this.modeIndex + 1) % this.modes.length;
    this.lagLeft = this.lagReads;
  }

  footer()
  {
    let index = this.modeIndex;

    if (this.lagLeft > 0)
    {
      this.lagLeft--;
      index = this.prevIndex;
    }

    return '  ⏵⏵ ' + this.modes[index] + ' on (shift+tab to cycle)';
  }

  get buffer()
  {
    // 屏幕结构：上边框、输入框那几行、底栏。光标停在输入框最后一行上。
    const lines = [RULE, ...this.composerRows, this.footer()];

    return {
      active: {
        baseY: 0,
        cursorY: this.composerRows.length,
        viewportY: 0,
        length: lines.length,
        getLine: (y: number) => lines[y] === undefined
          ? undefined
          : { translateToString: () => lines[y] },
      },
    };
  }

  /** 粘进去之后回车到底生效没有。false 用来复现「命令晾在输入行上」那次实测故障。 */
  submits = true;

  paste(text: string)
  {
    this.pastes.push(text);
    // 模拟真终端：回车生效了输入行就空了；没生效命令就原样躺在那儿。
    this.composerRows = this.submits ? ['>  '] : ['> ' + text];
  }
  write() {}
  getSelection() { return ''; }
  clear() {}
  reset() {}
  onData() { return { dispose() {} }; }
  // 终端上方那条「钉住的问题」要跟着滚动事件走。这些用例不看那条横栏，给空的即可——
  // 缺了组件挂载就抛，与横栏无关的用例会成片地红。**不能在这儿补 buffer 字段**：
  // 下面那个 getter 才是真的，字段会把它整个盖掉，切换判定读到的输入框就永远是空的。
  onScroll() { return { dispose() {} }; }
  onRender() { return { dispose() {} }; }
  scrollToLine() {}
  registerLinkProvider(provider: unknown) { (globalThis as any).__linkProvider = provider; return { dispose() {} }; }
  attachCustomKeyEventHandler() {}
  open() {}
  focus() {}
  dispose() {}
  loadAddon() {}
}

let term: FakeTerminal;

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    constructor() { return (globalThis as any).__fakeTerm; }
  },
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class { fit() {} activate() {} dispose() {} },
}));

import { TerminalPanel } from './TerminalPanel';

const KNOWN_EFFORTS = ['low', 'medium', 'high', 'xhigh'];
const KNOWN_MODELS = ['opus', 'sonnet'];

/**
 * 装一个假宿主，返回它收到的消息。
 * <p>
 * 组件既要能收宿主的消息、又要能被断言「发了什么给宿主」，所以这里把宿主注册的
 * listener 也留下来：有真宿主时消息走 addEventListener 那条分支，
 * window.__agentDevHost 那个开发期入口是不存在的。
 * </p>
 */
function captureHost(): unknown[]
{
  const sent: unknown[] = [];
  listeners.length = 0;
  (window as any).chrome = {
    webview: {
      postMessage: (m: unknown) =>
      {
        sent.push(m);

        // 真终端收到 shift+tab 会换一档并重画底栏；假的也得跟着动，
        // 否则组件读到的永远是同一档，测的就不是它了。
        const message = m as { type?: string; data?: string };

        if (message?.type === 'terminalInput' && message.data === base64(CYCLE_BYTES))
        {
          term.advanceMode();
        }
      },
      addEventListener: (_type: string, fn: (e: unknown) => void) => { listeners.push(fn); },
      removeEventListener: () => {},
    },
  };
  return sent;
}

const listeners: ((e: unknown) => void)[] = [];

function emitFromHost(message: unknown): void
{
  act(() => { listeners.forEach((fn) => fn({ data: message })); });
}

function base64(text: string): string
{
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) { binary += String.fromCharCode(bytes[i]); }
  return btoa(binary);
}

/** 渲染并等到终端「起来了」——startedRef 为真之前一条命令都不会送。 */
async function mount(
  selected: { model: string; effort: string; permissionMode: string },
  known = { models: KNOWN_MODELS, efforts: KNOWN_EFFORTS })
{
  const view = render(
    <TerminalPanel
      appearance={DEFAULT_APPEARANCE}
      visible={true}
      onClose={() => {}}
      selected={selected}
      knownModels={known.models}
      knownEfforts={known.efforts}
    />);

  await act(async () =>
  {
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)));
  });

  return view;
}

/** 让「攒 250ms 再试」那一拍过去。 */
async function settle(ms = 400)
{
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
}

beforeEach(() =>
{
  term = new FakeTerminal();
  (globalThis as any).__fakeTerm = term;
  delete (window as any).chrome;

  // jsdom 不做布局，容器量出来是 0，组件会认为「还没排版好」而不启动终端。
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 });
});

describe('工具栏切换在终端里生效', () =>
{
  it('强度改了就把 /effort 送进终端，而不是叫人重启', async () =>
  {
    const sent = captureHost();
    const view = await mount({ model: '', effort: 'xhigh', permissionMode: 'acceptEdits' });

    emitFromHost({ type: 'terminalStarted', payload: { model: '', effort: '', permissionMode: 'acceptEdits' } });
    await settle();

    expect(term.pastes).toEqual(['/effort xhigh']);

    // 光粘进去不回车等于把命令晾在输入行上——必须连提交那一下一起。
    const inputs = sent.filter((m: any) => m?.type === 'terminalInput');
    expect(inputs.some((m: any) => m.data === base64('\r'))).toBe(true);

    expect(view.container.textContent).not.toContain('只能重启终端');
  });

  it('型号也一样', async () =>
  {
    captureHost();
    await mount({ model: 'sonnet', effort: '', permissionMode: '' });

    emitFromHost({ type: 'terminalStarted', payload: { model: 'opus', effort: '', permissionMode: '' } });
    await settle();

    expect(term.pastes).toEqual(['/model sonnet']);
  });

  it('切过一次就不再重复送', async () =>
  {
    captureHost();
    await mount({ model: '', effort: 'xhigh', permissionMode: '' });

    emitFromHost({ type: 'terminalStarted', payload: { model: '', effort: '', permissionMode: '' } });
    await settle();

    // 再来一轮输出：重试是挂在输出上的，没记住「已经切过」就会一直刷。
    emitFromHost({ type: 'terminalOutput', payload: { data: base64('x') } });
    await settle();

    expect(term.pastes).toEqual(['/effort xhigh']);
  });

  it('终端输入行里有没发完的东西时不抢，并且说出来', async () =>
  {
    captureHost();
    term.composerRows = ['> 帮我看看这段'];

    const view = await mount({ model: '', effort: 'xhigh', permissionMode: '' });

    emitFromHost({ type: 'terminalStarted', payload: { model: '', effort: '', permissionMode: '' } });
    await settle();

    // 抢了的话拼出来是「帮我看看这段/effort xhigh」，回车一按整段当成一句话发给模型——花钱。
    expect(term.pastes).toEqual([]);
    expect(view.container.textContent).toContain('没发完的内容');
    expect(view.container.textContent).toContain('/effort xhigh');
  });

  it('草稿发走之后自动补上，不用用户再点一次', async () =>
  {
    captureHost();
    term.composerRows = ['> 帮我看看这段'];

    const view = await mount({ model: '', effort: 'xhigh', permissionMode: '' });
    emitFromHost({ type: 'terminalStarted', payload: { model: '', effort: '', permissionMode: '' } });
    await settle();
    expect(term.pastes).toEqual([]);

    // 用户把草稿发出去了。终端随之吐出内容，我们借这一下重试。
    term.composerRows = ['>  '];
    emitFromHost({ type: 'terminalOutput', payload: { data: base64('done') } });
    await settle();

    expect(term.pastes).toEqual(['/effort xhigh']);
    expect(view.container.textContent).not.toContain('没发完的内容');
  });

  it('环外的权限档位仍然只能重启', async () =>
  {
    // dontAsk 是真的转不到：CLI 里没有任何一档转得过去，只能靠启动参数进。
    const sent = captureHost();
    const view = await mount({ model: '', effort: '', permissionMode: 'dontAsk' });

    emitFromHost({ type: 'terminalStarted', payload: { model: '', effort: '', permissionMode: 'acceptEdits' } });
    await settle();

    expect(term.pastes).toEqual([]);
    expect(sent.filter((m: any) => m?.data === base64(CYCLE_BYTES))).toEqual([]);
    expect(view.container.textContent).toContain('只能重启终端');
  });

  it('环里的权限档位按 shift+tab 转过去，转到就停', async () =>
  {
    const sent = captureHost();
    const view = await mount({ model: '', effort: '', permissionMode: 'auto' });

    emitFromHost({ type: 'terminalStarted', payload: { model: '', effort: '', permissionMode: 'acceptEdits' } });
    await settle(3500);

    // accept edits → plan → bypass permissions → auto：三下就到，不该多按。
    // 按固定次数是猜的，底栏上写着答案。
    const presses = sent.filter((m: any) => m?.data === base64(CYCLE_BYTES));
    expect(presses.length).toBe(3);
    expect(term.modes[term.modeIndex]).toBe('auto mode');
    expect(view.container.textContent).not.toContain('只能重启终端');
  });

  it('「绕过权限」不瞎按，直接说清为什么非重启不可', async () =>
  {
    // CLI 里这一档只有**起终端时就带着它**才上环（isBypassPermissionsModeAvailable），
    // 从别的档按 shift+tab 永远转不过去。所以一下都不该按——按了也只是把用户的
    // 终端在几档之间转一圈再转回来，白折腾一趟还得出同一个结论。
    const sent = captureHost();
    const view = await mount({ model: '', effort: '', permissionMode: 'bypassPermissions' });

    emitFromHost({ type: 'terminalStarted', payload: { model: '', effort: '', permissionMode: 'acceptEdits' } });
    await settle(2000);

    expect(sent.filter((m: any) => m?.data === base64(CYCLE_BYTES))).toEqual([]);
    expect(term.modes[term.modeIndex]).toBe('accept edits');
    expect(view.container.textContent).toContain('起终端时就带上');
  });

  it('「危险模式」和「绕过权限」是同一档，不该报成漂移', async () =>
  {
    // --dangerously-skip-permissions 起的终端，底栏写的是 bypass permissions。
    // 不认这层等价关系的话，这条漂移提示永远消不掉，点多少次重启都还在。
    const sent = captureHost();
    term.modeIndex = 3;

    const view = await mount({ model: '', effort: '', permissionMode: 'bypassPermissions' });

    emitFromHost({ type: 'terminalStarted', payload: { model: '', effort: '', permissionMode: 'dangerously' } });
    await settle(1500);

    expect(sent.filter((m: any) => m?.data === base64(CYCLE_BYTES))).toEqual([]);
    expect(view.container.textContent).not.toContain('只能重启终端');
  });

  it('重画慢一拍，不能当成「转了一圈回到原处」', async () =>
  {
    // 按完就读一次的话，那一读多半还是按之前那一档，于是第一下就判定转不到、
    // 改口说要重启——而终端其实已经被按走了一格，人和界面都对不上。
    const sent = captureHost();
    term.lagReads = 1;

    const view = await mount({ model: '', effort: '', permissionMode: 'plan' });

    emitFromHost({ type: 'terminalStarted', payload: { model: '', effort: '', permissionMode: 'acceptEdits' } });
    await settle(3000);

    expect(sent.filter((m: any) => m?.data === base64(CYCLE_BYTES)).length).toBe(1);
    expect(term.modes[term.modeIndex]).toBe('plan mode');
    expect(view.container.textContent).not.toContain('只能重启终端');
  });

  it('转不到就转回原处，并改口说要重启', async () =>
  {
    // 把它扔在半路比原地不动更糟：用户看到的模式既不是他选的、也不是他原来的。
    const sent = captureHost();
    term.modes = ['accept edits', 'plan mode', 'auto mode'];
    term.modeIndex = 0;

    const view = await mount({ model: '', effort: '', permissionMode: 'manual' });

    emitFromHost({ type: 'terminalStarted', payload: { model: '', effort: '', permissionMode: 'acceptEdits' } });
    await settle(3000);

    expect(term.modes[term.modeIndex]).toBe('accept edits');
    expect(view.container.textContent).toContain('只能重启终端');

    // 而且要记住这一档：不记的话每来一批输出就重转一轮，底栏会自己一直跳。
    const before = sent.filter((m: any) => m?.data === base64(CYCLE_BYTES)).length;
    emitFromHost({ type: 'terminalOutput', payload: { data: base64('x') } });
    await settle(1500);
    expect(sent.filter((m: any) => m?.data === base64(CYCLE_BYTES)).length).toBe(before);
  });

  it('底栏读不出来时一下都不按', async () =>
  {
    // 弹了对话框、或者正在重画。这时候乱按等于替用户改设置。
    const sent = captureHost();
    term.footer = () => '  正在重画……';

    const view = await mount({ model: '', effort: '', permissionMode: 'plan' });
    emitFromHost({ type: 'terminalStarted', payload: { model: '', effort: '', permissionMode: 'acceptEdits' } });
    await settle(2500);

    expect(sent.filter((m: any) => m?.data === base64(CYCLE_BYTES))).toEqual([]);

    // 而且要说出来。原先这里是直接 return：下拉动了、终端一动不动、
    // 一个字都没有——用户看到的就是「点了没反应」。
    expect(view.container.textContent).toContain('读不出终端现在是哪一档权限');
  });

  it('CLI 没报清单时不拿额度去赌', async () =>
  {
    captureHost();
    const view = await mount(
      { model: '', effort: 'xhigh', permissionMode: '' },
      { models: [], efforts: [] });

    emitFromHost({ type: 'terminalStarted', payload: { model: '', effort: '', permissionMode: '' } });
    await settle();

    // 认不出的 /xxx 会被 TUI 当成一句话交给模型。宁可留一条「重启以应用」。
    expect(term.pastes).toEqual([]);
    expect(view.container.textContent).toContain('只能重启终端');
  });

  it('终端还没起进程时什么都不做', async () =>
  {
    captureHost();
    const view = await mount({ model: 'sonnet', effort: 'xhigh', permissionMode: 'plan' });
    await settle();

    expect(term.pastes).toEqual([]);
    expect(view.container.textContent).not.toContain('只能重启终端');
  });

  it('回车没生效时补一次——命令晾在输入行上等于什么都没发生', async () =>
  {
    // 真机实测踩到过：/effort high 粘进去了，回车却没生效，命令就那么躺着，
    // 界面显示已经切了、终端里其实没切，而且不报错。
    const sent = captureHost();
    term.submits = false;

    await mount({ model: '', effort: 'xhigh', permissionMode: '' });
    emitFromHost({ type: 'terminalStarted', payload: { model: '', effort: '', permissionMode: '' } });
    await settle(1200);

    const enters = sent.filter((m: any) => m?.type === 'terminalInput' && m.data === base64('\r'));
    expect(enters.length).toBe(2);
  });

  it('提交成功就不补第二下——那会替用户答确认框的题', async () =>
  {
    // 降档时 TUI 会弹「Change effort level? 1. Yes 2. No」。那时候多补一次回车
    // 等于替他选了高亮那项。
    const sent = captureHost();

    await mount({ model: '', effort: 'xhigh', permissionMode: '' });
    emitFromHost({ type: 'terminalStarted', payload: { model: '', effort: '', permissionMode: '' } });
    await settle(1200);

    const enters = sent.filter((m: any) => m?.type === 'terminalInput' && m.data === base64('\r'));
    expect(enters.length).toBe(1);
  });

  it('执行之后把「会写成全局默认」这件事说出来', async () =>
  {
    captureHost();
    const view = await mount({ model: '', effort: 'xhigh', permissionMode: '' });

    emitFromHost({ type: 'terminalStarted', payload: { model: '', effort: '', permissionMode: '' } });
    await settle();

    // 用户以为自己只是动了这个面板里的一个下拉，实际 CLI 把它写进了 ~/.claude/settings.json。
    expect(view.container.textContent).toContain('新会话的默认值');
  });
});
