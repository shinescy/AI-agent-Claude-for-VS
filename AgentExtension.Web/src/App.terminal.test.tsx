// 终端视图下的输入框与三条栏。
//
// 守的是两次真实反馈：「缺个输入框」，以及「工具栏上所有的操作都对终端没有任何效果」。
//
// 第一次修的时候我把后半句理解成「控件亮着却管不着，那就置灰」——结果是终端一开，
// 强度/权限/品牌/型号**全成了死的**，用户第二次的原话变成「工具栏所有工具都用不了」。
// 置灰把「界面在说谎」换成了「界面什么都不给」，一个都没解决。
//
// 现在的做法是真接上：这三项是 CLI 的启动参数，终端里的进程跑起来改不了，
// 所以宿主在起进程时按当前选择拼命令行，并回报**实际用上的那套**；
// 栏里再改就和它比对，不一致时摆一条「重启终端以应用」。
// 于是控件是活的、显示是真的、要付的代价（丢掉终端里的会话）也摆在明处。
//
// 这些断言必须挂在真实挂载的 App 上：两次的病根都在 App.tsx 的**装配**里，
// 不在任何单个组件中——被跳过的那一格、传下去的那个 prop，组件测试都碰不到。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { LANG_STORAGE_KEY } from './i18n';

// xterm 在 jsdom 里没有布局也没有 canvas，真起一个只会制造噪音。
// 这些用例关心的是**装配**，不是终端本身的渲染。
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    options: Record<string, unknown> = {};
    write() {}
    paste() {}
    onData() { return { dispose() {} }; }
    // 终端上方那条「钉住的问题」要读回滚缓冲、跟着滚动事件走。这些用例不看那条横栏，
    // 给一份空的即可——缺了组件挂载就抛，与横栏无关的用例会成片地红。
    onScroll() { return { dispose() {} }; }
    onRender() { return { dispose() {} }; }
    scrollToLine() {}
    registerLinkProvider(provider: unknown) { (globalThis as any).__linkProvider = provider; return { dispose() {} }; }
    attachCustomKeyEventHandler() {}
    buffer = { active: { viewportY: 0, length: 0, getLine: () => undefined } };
    open() {}
    focus() {}
    reset() {}
    clear() {}
    getSelection() { return ''; }
    dispose() {}
    loadAddon() {}
  },
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class { fit() {} activate() {} dispose() {} },
}));

import App from './App';

beforeEach(() => {
  window.localStorage.setItem(LANG_STORAGE_KEY, 'zh');
});

afterEach(() => {
  window.localStorage.removeItem(LANG_STORAGE_KEY);
});

type DevHost = { emit(data: unknown): void };

/** 宿主消息的注入入口。没有 window.chrome.webview 时由 bridge.ts 自动挂上。 */
function getDevHost(): DevHost
{
  const host = (window as unknown as { __agentDevHost?: DevHost }).__agentDevHost;

  if (!host)
  {
    throw new Error('未找到开发期注入入口 __agentDevHost');
  }

  return host;
}

/**
 * 确认此刻停在终端那一格。
 * <p>
 * 首屏**默认就在终端**（见 panelState 的 initialPanel），所以到这一步不用点任何按钮。
 * 但这一步不能省：下面每个用例的前提都是「现在在终端」，默认哪天改回对话，
 * 这里会当场红掉，而不是让一堆断言以看不懂的方式失败。
 * </p>
 */
function expectTerminalView(): void
{
  expect(document.querySelector('.terminal-panel')!.className).not.toContain('is-hidden');
}

/** 切到对话那一格。「回到对话」有两个（状态栏一个、终端工具栏一个），是同一件事。 */
function goToChat(): void
{
  fireEvent.click(screen.getAllByRole('button', { name: '回到对话' })[0]);
}

/** 切回终端那一格。 */
function goToTerminal(): void
{
  fireEvent.click(screen.getByRole('button', { name: '终端' }));
}

/**
 * 对话那个输入框。
 * <p>
 * 按类取而不是按 placeholder 文案取：两个输入框长期并排挂在树里，而文案会改
 * （2026-08-21 给它加了「@ 引用文件」，这里当场指空）。类名是身份，文案不是。
 * </p>
 */
const CHAT_BOX = '.composer:not(.composer-terminal) .composer-row textarea';

describe('App：终端视图', () =>
{
  it('终端开着时输入框仍在，且换成了送进终端的那个', () =>
  {
    const view = render(<App />);

    expect(view.container.querySelector(CHAT_BOX)).not.toBeNull();

    expectTerminalView();

    // 这一格**必须还有东西**。此前它是空的，界面上就是一片留白，反馈原话是「缺个输入框」。
    // 现在它是两格：上面固定提示词，下面这一次的内容。
    const promptBox = view.container.querySelector('.composer-prompt-row textarea');
    const contentBox = view.container.querySelector('.composer-row textarea');

    expect(promptBox).not.toBeNull();
    expect(contentBox).not.toBeNull();
    expect(contentBox!.getAttribute('placeholder')).toContain('送进终端');
    expect(promptBox!.getAttribute('placeholder')).toContain('提示词');

    // 对话那个输入框**还在树里，但被藏起来了**。
    // 藏而不卸是为了留住没发完的草稿与附件；看不见它就不会打错地方——
    // 它发的是 stream-json 消息，跟终端里那个进程毫无关系。
    const chatBox = view.container.querySelector(CHAT_BOX);
    expect(chatBox).not.toBeNull();
    expect(chatBox!.closest('.composer')!.className).toContain('is-hidden');
  });

  it('三条栏都还在——终端不走覆盖层就是为了留住它们', () =>
  {
    const view = render(<App />);
    expectTerminalView();

    expect(view.container.querySelector('.usage-bar, .usage')).not.toBeNull();
    expect(view.container.querySelector('.status-bar')).not.toBeNull();
    expect(view.container.querySelector('.session-bar')).not.toBeNull();
    expect(screen.getByRole('button', { name: '⋯' })).not.toBeNull();
  });

  it('终端输入框拿到的是全量命令，包括对话那边被滤掉的', () =>
  {
    const view = render(<App />);
    expectTerminalView();

    act(() =>
    {
      getDevHost().emit({
        type: 'event',
        payload: {
          kind: 'SessionStarted',
          content: '',
          toolCall: null, usageData: null, turnResult: null, rateLimitData: null,
          hookName: '', hookPhase: '',
          sessionInfo: {
            sessionId: 's1', model: 'opus', cwd: 'F:/proj',
            permissionMode: 'acceptEdits', cliVersion: '2.1.237',
            tools: [], slashCommands: ['compact', 'color'], terminalSlashCommands: ['color'],
            skills: [], subAgents: [], mcpServers: [], capabilities: [], models: [],
            subscriptionType: 'Claude Max', effortLevel: 'high',
            availableModels: [], effortLevels: [],
            usageWindows: [], usageRawText: '',
          },
        },
      });
    });

    // 补全挂在「具体内容」那一格上——提示词那格是长期不变的模板。
    const box = view.container.querySelector<HTMLTextAreaElement>('.composer-row textarea')!;
    fireEvent.change(box, { target: { value: '/col' } });

    // color 在对话那份补全里是被排除的（CLI 说它「只能在终端用」）。
    // 这里就是终端，它必须补得出来——漏掉它正是「命令感知没了」的具体形态。
    const popup = view.container.querySelector('.slash-popup');
    expect(popup).not.toBeNull();
    expect(popup!.textContent).toContain('color');
  });

  it('终端输入框和对话那个一样能拖高', () =>
  {
    const view = render(<App />);

    // 对话那边本来就有。
    expect(view.container.querySelector('.composer-grip')).not.toBeNull();

    expectTerminalView();

    // 换到终端后这条把手不能消失——它和对话那个占的是同一格，
    // 少了它，终端里想多写两行就只能挤在两行半的框子里。
    expect(view.container.querySelector('.composer-grip')).not.toBeNull();
  });

  it('三条栏里的控件在终端下**照常可用**——置灰过一版，那是错的', () =>
  {
    const view = render(<App />);
    expectTerminalView();

    // 强度滑轨不进禁用态。
    const track = view.container.querySelector('.effort-track');
    expect(track).not.toBeNull();
    expect(track!.className).not.toContain('effort-track-disabled');

    // 状态栏的权限下拉、会话信息栏的品牌下拉同理。
    const selects = Array.from(
      view.container.querySelectorAll<HTMLSelectElement>('.status-bar select.status-select'));
    expect(selects.length).toBeGreaterThanOrEqual(2);
    expect(selects.every((s) => !s.disabled)).toBe(true);

    const brand = view.container.querySelector<HTMLSelectElement>('.session-bar select.status-select');
    expect(brand).not.toBeNull();
    expect(brand!.disabled).toBe(false);
  });

  it('终端还没起进程时不摆「重启以应用」——那时候还不存在「正在用的」', () =>
  {
    const view = render(<App />);
    expectTerminalView();

    // 宿主没回报过 terminalStarted。此时摆一条待办只会让人以为出了错。
    expect(view.container.querySelector('.terminal-drift')).toBeNull();
  });

  it('没亲手选过型号/强度时不算差异——探测回来的是名字，不是取值', () =>
  {
    const view = render(<App />);
    expectTerminalView();

    // CLI 探测回来的当前模型是给人看的名字（「Opus 5 (1M context)」），
    // 它会被写进状态栏用于显示，但**不是** --model 的取值，宿主拿它起进程会被闭集拒掉。
    act(() =>
    {
      getDevHost().emit({
        type: 'event',
        payload: {
          kind: 'SessionStarted',
          content: '',
          toolCall: null, usageData: null, turnResult: null, rateLimitData: null,
          hookName: '', hookPhase: '',
          sessionInfo: {
            sessionId: 's1', model: 'Opus 5 (1M context)', cwd: 'F:/proj',
            permissionMode: 'acceptEdits', cliVersion: '2.1.237',
            tools: [], slashCommands: [], terminalSlashCommands: [],
            skills: [], subAgents: [], mcpServers: [], capabilities: [], models: [],
            subscriptionType: 'Claude Max', effortLevel: 'high',
            availableModels: [], effortLevels: [],
            usageWindows: [], usageRawText: '',
          },
        },
      });

      getDevHost().emit({
        type: 'terminalStarted',
        payload: { model: '', effort: '', permissionMode: 'acceptEdits' },
      });
    });

    // 拿显示名去比，这里会冒出一条「型号 默认 → Opus 5 (1M context)」，
    // 而且**永远撤不掉**：重启多少次宿主都会把这个串拒掉。提示条自己变成了谎言。
    expect(view.container.querySelector('.terminal-drift')).toBeNull();
  });

  it('终端起来之后改栏里的选项，摆出差异和重启入口，而不是假装已生效', () =>
  {
    const view = render(<App />);
    expectTerminalView();

    const permission = view.container.querySelector<HTMLSelectElement>('.status-bar select.status-select')!;
    const launchedMode = permission.value;

    // 宿主回报这一路进程实际起进程时用的权限模式，就是当前这个。
    act(() =>
    {
      getDevHost().emit({
        type: 'terminalStarted',
        payload: { model: '', effort: '', permissionMode: launchedMode },
      });
    });

    // 换成一个**不在 shift+tab 环里**的档位：这种才是真的只能重启。
    // 环里的四档（acceptEdits / plan / auto / manual）由终端面板自己按键转过去。
    fireEvent.change(permission, { target: { value: 'dontAsk' } });

    const drift = view.container.querySelector('.terminal-drift');
    expect(drift).not.toBeNull();

    // 差异要说清**从什么变成什么**，只说「有变化」等于让人自己去猜。
    expect(drift!.textContent).toContain(launchedMode);
    expect(drift!.textContent).toContain('dontAsk');

    // 且必须给得出动作。没有出口的提示条就只是一句抱怨。
    expect(drift!.querySelector('button')).not.toBeNull();
  });

  it('环里的档位不摆重启入口——那句话是错的，它能直接切', () =>
  {
    // 用户的原话：「现在改权限还是提示要重启终端」。TUI 底栏写着当前是哪一档，
    // shift+tab 是个四档的环，转过去就行。
    const view = render(<App />);
    expectTerminalView();

    const permission = view.container.querySelector<HTMLSelectElement>('.status-bar select.status-select')!;

    act(() =>
    {
      getDevHost().emit({
        type: 'terminalStarted',
        payload: { model: '', effort: '', permissionMode: permission.value },
      });
    });

    fireEvent.change(permission, { target: { value: 'plan' } });

    expect(view.container.querySelector('.terminal-drift')).toBeNull();
  });

  // ———————————————————————————————————————————————————————————————
  // 视图切换。守的是 2026-08-21 的反馈：「webview 和命令窗口切换会导致命令窗口内容丢失卡死，
  // 切换按钮也没有随切换变换内容文字」。
  //
  // 病根是主视图那一格用 `terminalOpen ? <TerminalPanel/> : <Transcript/>` 换人，
  // 切走 = 卸载 = `term.dispose()`，xterm 的回滚缓冲当场没；宿主又刻意不杀进程，
  // 于是切回来是「进程活着、屏幕全白、而且永远不会自己填回来」。
  // 真机实测：重开后干等 8 秒仍是空的，把窗口宽度改一下（逼出 SIGWINCH）才整屏回来。

  it('切回对话再切回来，终端组件没有被重建', () =>
  {
    const view = render(<App />);
    expectTerminalView();

    const host = view.container.querySelector('.terminal-host');
    expect(host).not.toBeNull();

    // 「回到对话」有两个：状态栏那个切换按钮，和终端工具栏里那个。两个是同一件事。
    goToChat();
    // 卸载过就再也不是同一个节点了——而同一个节点才意味着同一个 Terminal 实例、
    // 同一份回滚缓冲，以及藏起来这段时间的输出仍有接收方。
    expect(view.container.querySelector('.terminal-host')).toBe(host);

    goToTerminal();
    expect(view.container.querySelector('.terminal-host')).toBe(host);
  });

  it('首屏默认停在终端，不是对话', () =>
  {
    // 2026-08-21 用户要求：默认模式改成终端。
    // 这一条守的是「默认在哪一格」这个决定本身——它只体现在 panelState 的初始值里，
    // 一个字符的改动就能把它翻过去，而界面上不会有任何别的异常。
    const view = render(<App />);

    expect(view.container.querySelector('.terminal-panel')!.className).not.toContain('is-hidden');
    expect(view.container.querySelector('.transcript')!.className).toContain('is-hidden');
    // 终端一露面就该有承载它的那块地方（xterm 挂在这里）。
    expect(view.container.querySelector('.terminal-host')).not.toBeNull();
  });

  it('切走的是藏，不是卸——主视图两边都还在树里', () =>
  {
    const view = render(<App />);
    expectTerminalView();

    expect(view.container.querySelector('.transcript')!.className).toContain('is-hidden');
    expect(view.container.querySelector('.terminal-panel')!.className).not.toContain('is-hidden');

    goToChat();

    expect(view.container.querySelector('.transcript')!.className).not.toContain('is-hidden');
    expect(view.container.querySelector('.terminal-panel')!.className).toContain('is-hidden');
  });

  it('按钮上的字跟着当前在哪一边变', () =>
  {
    render(<App />);

    // 只看状态栏那一个。终端工具栏里也有一个「回到对话」，但它随终端一起藏起来——
    // jsdom 不加载样式表，`display:none` 不生效，按 role 找会把藏着的那个也数进来。
    function statusToggleLabel(): string
    {
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>('.status-bar .status-button'));
      return buttons[0].textContent ?? '';
    }

    // 首屏在终端这边，按钮说的是「点下去会回对话」。
    // 原先它恒是「终端」，再点一下界面纹丝不动——用户从按钮上既看不出自己在哪，
    // 也看不出点了会怎样。
    expect(statusToggleLabel()).toBe('回到对话');

    goToChat();

    expect(statusToggleLabel()).toBe('终端');

    goToTerminal();

    expect(statusToggleLabel()).toBe('回到对话');
  });

  it('同一个按钮点第二下要切回来，而不是原地不动', () =>
  {
    const view = render(<App />);
    expectTerminalView();

    goToChat();

    expect(view.container.querySelector('.transcript')!.className).not.toContain('is-hidden');
  });

  it('两边的草稿切来切去都不丢', () =>
  {
    const view = render(<App />);
    expectTerminalView();

    const termBox = view.container.querySelector<HTMLTextAreaElement>(
      '.composer-terminal .composer-row textarea')!;
    fireEvent.change(termBox, { target: { value: '写了一半的命令' } });

    goToChat();

    const chatBox = view.container.querySelector<HTMLTextAreaElement>(CHAT_BOX)!;
    fireEvent.change(chatBox, { target: { value: '写了一半的问题' } });

    goToTerminal();

    expect(view.container.querySelector<HTMLTextAreaElement>(
      '.composer-terminal .composer-row textarea')!.value).toBe('写了一半的命令');

    goToChat();

    expect(view.container.querySelector<HTMLTextAreaElement>(CHAT_BOX)!.value).toBe('写了一半的问题');
  });

  it('终端那一格的 @ 一路通到宿主：问得出去、答得回来、列得出来', () =>
  {
    // 这条挂在 App 上而不是组件上，守的是**装配**：fileResults 这个 prop 要从 App
    // 分给两个输入框。TS 能保证「传了」，保不了「传的是同一个」——漏接的表现是
    // 终端里敲 @ 什么都不弹，界面上毫无迹象。
    const sent: { type?: string; option?: string; requestId?: string }[] = [];
    let listener: ((event: { data: unknown }) => void) | null = null;
    const previous = window.chrome;

    window.chrome = {
      webview: {
        postMessage: (message: unknown) => { sent.push(message as { type?: string }); },
        addEventListener: (_type: 'message', handler: (event: MessageEvent) => void) =>
        {
          listener = handler as unknown as (event: { data: unknown }) => void;
        },
        removeEventListener: () => {},
      },
    };

    try
    {
      const view = render(<App />);
      expectTerminalView();

      const box = view.container.querySelector<HTMLTextAreaElement>(
        '.composer-terminal .composer-row textarea')!;
      fireEvent.change(box, { target: { value: '@ment' } });

      const query = sent.filter((m) => m.type === 'query' && m.option === 'files').pop();
      expect(query).toBeTruthy();
      expect(listener).not.toBeNull();

      act(() =>
      {
        listener!({
          data: {
            type: 'context',
            payload: { kind: 'files', requestId: query!.requestId, results: ['src/mention.ts'] },
          },
        });
      });

      const listed = Array.from(view.container.querySelectorAll(
        '.composer-terminal .mention-popup .slash-popup-item')).map((n) => n.textContent);

      expect(listed).toEqual(['src/mention.ts']);
    }
    finally
    {
      window.chrome = previous;
    }
  });

});

describe('App：拖进来的文件', () =>
{
  const TERMINAL_BOX = '.composer-terminal .composer-row textarea';

  it('拖进来的文件落到当前露在外面的那一格，而不是两格都写', () =>
  {
    // 这条挂在 App 上而不是组件上，守的是**分发**：droppedFiles 这条消息没有 requestId
    // （不是谁请求来的，是宿主主动报的），只能由 App 决定给谁。两格都接的话，
    // 一次拖拽会同时写进两个草稿——切过去才发现，界面上当场毫无迹象。
    const view = render(<App />);
    expectTerminalView();

    act(() =>
    {
      getDevHost().emit({
        type: 'context',
        payload: { kind: 'droppedFiles', results: ['src/App.tsx'] },
      });
    });

    const terminalBox = view.container.querySelector<HTMLTextAreaElement>(TERMINAL_BOX)!;
    const chatBox = view.container.querySelector<HTMLTextAreaElement>(CHAT_BOX)!;

    expect(terminalBox.value).toBe('@src/App.tsx ');
    expect(chatBox.value).toBe('');
  });

  it('切回对话再拖，就落到对话那一格', () =>
  {
    const view = render(<App />);
    goToChat();

    act(() =>
    {
      getDevHost().emit({
        type: 'context',
        payload: { kind: 'droppedFiles', results: ['docs/readme.md'] },
      });
    });

    const chatBox = view.container.querySelector<HTMLTextAreaElement>(CHAT_BOX)!;
    const terminalBox = view.container.querySelector<HTMLTextAreaElement>(TERMINAL_BOX)!;

    expect(chatBox.value).toBe('@docs/readme.md ');
    expect(terminalBox.value).toBe('');
  });

  it('连拖同一个文件两次，第二次也要插进去', () =>
  {
    // 只比内容不比 seq 的话，第二次什么都不会发生——看起来像拖拽偶尔失灵。
    const view = render(<App />);
    expectTerminalView();

    for (let i = 0; i < 2; i++)
    {
      act(() =>
      {
        getDevHost().emit({
          type: 'context',
          payload: { kind: 'droppedFiles', results: ['a.ts'] },
        });
      });
    }

    const terminalBox = view.container.querySelector<HTMLTextAreaElement>(TERMINAL_BOX)!;
    expect(terminalBox.value).toBe('@a.ts @a.ts ');
  });
});
