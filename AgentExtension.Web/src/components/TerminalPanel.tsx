import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveTerminalLook, cssVarReader } from '../terminalLook';
import type { Appearance } from '../appearance';
import type { MutableRefObject } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { OUTBOUND } from '../protocol';
import { onHostMessage, sendOpenFile, sendTerminalInput, sendTerminalResize, sendTerminalStart, sendTerminalStop } from '../bridge';
import { PERMISSION_MODES } from '../permissionModes';
import { useT } from '../LangContext';
import { findPinnedTurn } from '../pinnedTurn';
import type { PinnedTurn } from '../pinnedTurn';
import { pinnedLabel } from '../turnGroups';
import { loadPrompt } from '../composerPrompt';
import { PinnedTurnBar } from './PinnedTurnBar';
import { columnOf, findTerminalLinks } from '../terminalLinks';
import { decodeTerminalOutput, encodeTerminalInput } from '../terminalCodec';
import {
  CYCLE_KEY,
  MAX_CYCLE_PRESSES,
  composerIsEmpty,
  isRuleLine,
  normalizePermission,
  planSwitch,
  readPermissionMode,
} from '../terminalSwitch';
import type { LiveSwitch, TerminalLaunchSelection } from '../terminalSwitch';

// 判定逻辑在 terminalSwitch.ts（纯函数好测），这里原样导出，调用点不必跟着改。
export type { TerminalLaunchSelection } from '../terminalSwitch';

// 交互式终端标签：跑一个完整 TUI 的 claude。

/** 交给外面的命令式句柄。 */
export interface TerminalHandle
{
  /** 把一段文本送进终端并回车。 */
  send(text: string): void;

  /** 把一串原始按键字节送进终端，**不追加回车**。 */
  sendKey(data: string): void;

  /** 把键盘焦点交回终端本体。 */
  focus(): void;
}

interface TerminalPanelProps
{
  /** 面板是否可见。 */
  visible: boolean;

  /** 关掉终端、回到转录。 */
  onClose: () => void;

  /** 由 App 持有，输入框通过它把文本送进来。 */
  handleRef?: MutableRefObject<TerminalHandle | null>;

  /** 三条栏里当前选中的那套启动参数。 */
  selected?: TerminalLaunchSelection;

  /** CLI 自己报的可选型号 / 强度档位。 */
  knownModels?: readonly string[];
  knownEfforts?: readonly string[];

  /** 外观设置（字体、字号、文字颜色）。 */
  appearance: Appearance;
}

/** 读出 TUI 输入框里的那几行：从光标所在行往上，一直到输入框的上边框。 */
function readComposerRows(term: Terminal): string[]
{
  const buffer = term.buffer.active;
  const cursorRow = buffer.baseY + buffer.cursorY;
  const rows: string[] = [];

  for (let y = cursorRow; y >= 0 && cursorRow - y < 24; y--)
  {
    const text = buffer.getLine(y)?.translateToString(true) ?? '';

    if (isRuleLine(text))
    {
      return rows;
    }

    rows.push(text);
  }

  return [];
}

/** 读出当前这一屏的所有行。 */
function readViewportRows(term: Terminal): string[]
{
  const buffer = term.buffer.active;
  const rows: string[] = [];

  for (let y = 0; y < term.rows; y++)
  {
    rows.push(buffer.getLine(buffer.baseY + y)?.translateToString(true) ?? '');
  }

  return rows;
}

/** 按一下之后等屏幕重画。 */
function delay(ms: number): Promise<void>
{
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const CYCLE_REDRAW_MS = 250;

export function TerminalPanel(
  { visible, onClose, handleRef, selected, appearance, knownModels, knownEfforts }: TerminalPanelProps)
{
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  const startedRef = useRef(false);
  const [exited, setExited] = useState<{ code: number; message: string } | null>(null);

  const [launched, setLaunched] = useState<TerminalLaunchSelection | null>(null);

  // 建终端那个 effect 只跑一次（重建会丢掉滚动历史），所以它读不到后来的 appearance。
  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;

  const [themeSeq, setThemeSeq] = useState(0);

  const [pinned, setPinned] = useState<PinnedTurn | null>(null);

  const [notice, setNotice] = useState('');

  const t = useT();

  // 终端那个 effect 只挂一次，直接闭包会把链接提示钉死在挂载时那门语言上。
  const tRef = useRef(t);
  tRef.current = t;

  const [blocked, setBlocked] = useState(false);

  const liveRef = useRef<LiveSwitch[]>([]);
  const flushRef = useRef<() => void>(() => undefined);
  const retryRef = useRef(0);

  // 终端那个 effect 只挂一次（见下方注释），attachCustomKeyEventHandler 里要调用的
  // copySelection / paste 得靠 ref 拿最新版本，直接闭包会把它们钉死在挂载时那一帧。
  const copyRef = useRef<() => void>(() => undefined);
  const pasteRef = useRef<() => void>(() => undefined);

  const cycleRef = useRef<string | null>(null);
  const cyclingRef = useRef(false);
  const [unreachableMode, setUnreachableMode] = useState('');

  // 转不过去时的真实原因。没有它的话，「读不出底栏」和「转了一圈没这一档」
  // 会一起缩成同一句「只能重启才生效」，用户没法判断是自己该做点什么还是真得重启。
  const [cycleNote, setCycleNote] = useState('');

  useEffect(() =>
  {
    const host = hostRef.current;

    if (host === null)
    {
      return;
    }

    // 变量必须在这里解析成字面值。
    const look = resolveTerminalLook(appearanceRef.current, cssVarReader());

    const term = new Terminal({
      fontFamily: look.fontFamily,
      fontSize: look.fontSize,
      theme: look.theme,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);

    termRef.current = term;
    fitRef.current = fit;

    // Ctrl+C / Ctrl+V 按终端惯例处理（Windows Terminal 就是这么做的）：
    // - Ctrl+C 有选中文本时复制；没有选中时**不拦**，照常发 ETX 给正在跑的进程——
    //   终端里 Ctrl+C 的首要语义是中断，无条件变成复制会让用户没法中断跑飞的命令。
    // - Ctrl+V 直接粘贴。
    // - Ctrl+Shift+C / Ctrl+Shift+V 无条件复制/粘贴，给习惯这个的人留一条路。
    // 返回 false 表示这个键我们自己处理了，不再交给 xterm 内部的按键逻辑——但这只挡得住
    // xterm 的 _keyDown 分支，挡不住浏览器把这次按键的默认动作继续往下走：xterm 自己在
    // textarea/element 上还挂了原生 "copy"/"paste" 事件监听器（选中时的 copyHandler、
    // 任何时候的 handlePasteEvent），那两个监听器不受 attachCustomKeyEventHandler 的
    // 返回值控制，只受 event.preventDefault() 控制。真接管一个键时必须调
    // preventDefault()，否则同一次按键会走两条路各发一次——粘贴场景下就是同一段内容被
    // 送进终端两遍，命令类内容跑两遍的后果可能不可逆。没有选中的 Ctrl+C 那条分支**不能**
    // 调 preventDefault，也不能返回 false：那条要原样把默认动作交给 xterm 去发中断信号。
    // Ctrl+X 没有专门处理：我们不拦截、不调用任何剪贴板函数，所以不存在双路径问题——
    // 它和其它未点名的按键一样落到最后 `return true`，只走 xterm 自己那一条路。
    term.attachCustomKeyEventHandler((event) =>
    {
      if (event.type !== 'keydown' || !event.ctrlKey || event.altKey)
      {
        return true;
      }

      const key = event.key.toLowerCase();

      if (key === 'c')
      {
        const hasSelection = (term.getSelection() ?? '').length > 0;

        if (!event.shiftKey && !hasSelection)
        {
          return true;
        }

        event.preventDefault();
        copyRef.current();
        return false;
      }

      if (key === 'v')
      {
        event.preventDefault();
        pasteRef.current();
        return false;
      }

      return true;
    });

    const typed = term.onData((data) =>
    {
      sendTerminalInput(encodeTerminalInput(data));
    });

    const RESCAN_MS = 250;
    let lastScan = Number.NEGATIVE_INFINITY;
    let lastKey = '';

    function refreshPinned(force: boolean): void
    {
      const now = performance.now();

      if (!force && now - lastScan < RESCAN_MS)
      {
        return;
      }

      lastScan = now;

      const buffer = term.buffer.active;
      const found = findPinnedTurn(
        (row) => buffer.getLine(row)?.translateToString(true) ?? null,
        buffer.viewportY,
        buffer.length,
      );

      const key = found === null ? '' : found.row + ':' + found.text;

      if (key === lastKey)
      {
        return;
      }

      lastKey = key;
      setPinned(found);
    }

    const scrolled = term.onScroll(() => refreshPinned(true));
    const rendered = term.onRender(() => refreshPinned(false));

    // 输出里的文件位置做成可点的：点一下让宿主在编辑器里打开。
    //
    // 只认这一行，不跨行拼：TUI 折行的位置取决于当时的终端宽度，拼起来会把两段不相干的
    // 文字接成一个假路径，而假路径点下去会把用户的编辑器切走。
    const linked = term.registerLinkProvider({
      provideLinks(row, callback)
      {
        const text = term.buffer.active.getLine(row - 1)?.translateToString(true) ?? '';
        const found = findTerminalLinks(text);

        if (found.length === 0)
        {
          callback(undefined);
          return;
        }

        callback(found.map((hit) => ({
          // xterm 的列号从 1 起、右端闭区间，且按**显示宽度**算——中文占两列，
          // 直接拿下标当列会让下划线整体左移。
          range: {
            start: { x: columnOf(text, hit.start), y: row },
            end: { x: columnOf(text, hit.end) - 1, y: row },
          },
          text: hit.raw,
          activate: () => sendOpenFile(hit.path, hit.line),
          // **不要在这儿挂 hover**：提示条一出现就把终端可用高度挤小，xterm 重排、
          // TUI 收到 SIGWINCH 重画一整屏，移开又长回去——鼠标扫过几条链接就是一阵抖。
          // xterm 自己会给下划线和手型光标，那就够说明它能点了。
        })));
      },
    });

    if (handleRef !== undefined)
    {
      handleRef.current = {
        send(text: string)
        {
          // 走 xterm 自己的 paste()，**不是**把字节直接塞给宿主：paste() 会按终端当前是否开着
          term.paste(text);

          sendTerminalInput(encodeTerminalInput('\r'));
        },
        sendKey(data: string)
        {
          sendTerminalInput(encodeTerminalInput(data));
        },
        focus()
        {
          term.focus();
        },
      };
    }

    return () =>
    {
      if (handleRef !== undefined)
      {
        handleRef.current = null;
      }

      typed.dispose();
      scrolled.dispose();
      rendered.dispose();
      linked.dispose();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;

      // **刻意不发 terminalStop**：关掉工具窗不该杀掉你的终端会话。
    };
  }, []);

  useEffect(() =>
  {
    return onHostMessage((raw) =>
    {
      // 载荷在 **payload 里**，不是平铺在信封顶层。
      const message = raw as { type?: string; payload?: unknown };

      if (message.type === OUTBOUND.TerminalOutput)
      {
        const payload = message.payload as { data?: string } | undefined;

        if (typeof payload?.data === 'string')
        {
          termRef.current?.write(decodeTerminalOutput(payload.data));

          if (liveRef.current.length > 0 || cycleRef.current !== null)
          {
            window.clearTimeout(retryRef.current);
            retryRef.current = window.setTimeout(() => flushRef.current(), 250);
          }
        }

        return;
      }

      if (message.type === OUTBOUND.Theme)
      {
        setThemeSeq((n) => n + 1);
        return;
      }

      if (message.type === OUTBOUND.TerminalStarted)
      {
        const payload = message.payload as Partial<TerminalLaunchSelection> | undefined;

        // 记的是**宿主实际用上的那套**，不是前端以为的那套：被闭集拒掉的取值
        setLaunched({
          model: typeof payload?.model === 'string' ? payload.model : '',
          effort: typeof payload?.effort === 'string' ? payload.effort : '',
          permissionMode: typeof payload?.permissionMode === 'string' ? payload.permissionMode : '',
        });

        return;
      }

      if (message.type === OUTBOUND.TerminalExited)
      {
        const payload = message.payload as { exitCode?: number; message?: string } | undefined;

        setExited({
          code: typeof payload?.exitCode === 'number' ? payload.exitCode : -1,
          message: typeof payload?.message === 'string' ? payload.message : '',
        });
      }
    });
  }, []);

  /** 重新量一遍尺寸，并把新的行列数告诉宿主。 */
  function refit(): void
  {
    const fit = fitRef.current;
    const term = termRef.current;
    const host = hostRef.current;

    if (fit === null || term === null || host === null)
    {
      return;
    }

    // 容器还没布局出来时不能量，理由同下面那个 effect。
    if (host.clientWidth < 8 || host.clientHeight < 8)
    {
      return;
    }

    try
    {
      fit.fit();
    }
    catch
    {
      return;
    }

    if (startedRef.current && term.cols > 0 && term.rows > 0)
    {
      sendTerminalResize(term.cols, term.rows);
    }
  }

  useEffect(() =>
  {
    const term = termRef.current;

    if (term === null)
    {
      return;
    }

    if (!visible)
    {
      return;
    }

    const look = resolveTerminalLook(appearance, cssVarReader());

    term.options.fontFamily = look.fontFamily;
    term.options.fontSize = look.fontSize;
    term.options.theme = look.theme;

    refit();
  }, [appearance, themeSeq, visible]);

  useEffect(() =>
  {
    if (!visible)
    {
      return;
    }

    const term = termRef.current;
    const fit = fitRef.current;

    if (term === null || fit === null)
    {
      return;
    }

    function sync()
    {
      const current = fitRef.current;
      const active = termRef.current;
      const host = hostRef.current;

      if (current === null || active === null || host === null)
      {
        return;
      }

      // 容器还没被布局出来时**不能**量：xterm 会在渲染器没准备好的情况下抛
      if (host.clientWidth < 8 || host.clientHeight < 8)
      {
        return;
      }

      try
      {
        current.fit();
      }
      catch
      {
        return;
      }

      if (active.cols <= 0 || active.rows <= 0)
      {
        return;
      }

      if (startedRef.current)
      {
        sendTerminalResize(active.cols, active.rows);
        return;
      }

      // 拿到**真实尺寸**之后才启动，不用兜底的 80x24 抢跑：
      startedRef.current = true;
      sendTerminalStart(active.cols, active.rows);

      // 焦点要**排到下一个宏任务**再抢：PanelOverlay 挂载时会把焦点收到自己身上，同步 focus() 会被它盖掉。
      window.setTimeout(() => termRef.current?.focus(), 0);
    }

    const frame = requestAnimationFrame(sync);

    const observer = new ResizeObserver(sync);

    if (hostRef.current !== null)
    {
      observer.observe(hostRef.current);
    }

    return () =>
    {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [visible]);

  /** 一闪而过的提示；不用 toast，面板里直接给一行就够。 */
  function flash(text: string): void
  {
    setNotice(text);
    window.setTimeout(() => setNotice((current) => (current === text ? '' : current)), 4000);
  }

  /** 结束当前这一路并重开。 */
  function restart(): void
  {
    const term = termRef.current;

    sendTerminalStop();
    setExited(null);

    if (term === null)
    {
      return;
    }

    term.reset();
    sendTerminalStart(term.cols > 0 ? term.cols : 80, term.rows > 0 ? term.rows : 24);
    term.focus();
    flash(t('已重启终端。'));
  }

  /** 送 Ctrl+C。 */
  function interrupt(): void
  {
    sendTerminalInput(encodeTerminalInput(String.fromCharCode(3)));
    termRef.current?.focus();
  }

  /** 清屏。 */
  function clear(): void
  {
    termRef.current?.clear();
    termRef.current?.focus();
  }

  function copySelection(): void
  {
    const selection = termRef.current?.getSelection() ?? '';

    if (selection.length === 0)
    {
      flash(t('没有选中任何文本。'));
      return;
    }

    navigator.clipboard.writeText(selection).then(
      () => flash(t('已复制选中的文本。')),
      () => flash(t('复制失败：这个环境不允许写剪贴板。')));
  }

  function paste(): void
  {
    navigator.clipboard.readText().then(
      (text) =>
      {
        if (text.length === 0)
        {
          flash(t('剪贴板是空的。'));
          return;
        }

        sendTerminalInput(encodeTerminalInput(text));
        termRef.current?.focus();
      },
      () => flash(t('粘贴失败：这个环境不允许读剪贴板，用 Ctrl+V 试试。')));
  }

  // 挂载时那个 effect 里的 attachCustomKeyEventHandler 靠这两个 ref 拿到每次渲染的最新版本。
  copyRef.current = copySelection;
  pasteRef.current = paste;

  const plan = planSwitch(
    selected,
    launched,
    { models: knownModels ?? [], efforts: knownEfforts ?? [] },
    t,
    unreachableMode);

  liveRef.current = plan.live;
  cycleRef.current = plan.cycle;
  flushRef.current = flush;

  /** 读终端现在这一档；重画到一半时会读空，多读两次再认输。 */
  async function readModeSettled(): Promise<string | null>
  {
    for (let i = 0; i < 3; i++)
    {
      const term = termRef.current;

      if (term === null)
      {
        return null;
      }

      const mode = readPermissionMode(readViewportRows(term));

      if (mode !== null)
      {
        return mode;
      }

      await delay(CYCLE_REDRAW_MS);
    }

    return null;
  }

/**
   * 按一下之后等底栏真的换了字样。
   *
   * 不能按完就读一次了事：TUI 重画有延迟，那一读多半还是按之前那一档，
   * 于是「和起点相同」被当成转了一圈，第一下就收工。等到它变，或者等够了认输。
   */
  async function readModeAfterPress(from: string): Promise<string | null>
  {
    for (let i = 0; i < 4; i++)
    {
      await delay(CYCLE_REDRAW_MS);

      const term = termRef.current;

      if (term === null)
      {
        return null;
      }

      const mode = readPermissionMode(readViewportRows(term));

      if (mode !== null && mode !== from)
      {
        return mode;
      }
    }

    return null;
  }

  /** 按 shift+tab 把权限模式转到目标档。 */
  async function runCycle(target: string): Promise<void>
  {
    if (cyclingRef.current || termRef.current === null)
    {
      return;
    }

    // 底栏读出来的是 bypassPermissions，下拉里选的可能是「危险模式」，同一档两个名字。
    const want = normalizePermission(target);

    cyclingRef.current = true;

    try
    {
      const start = await readModeSettled();

      if (start === null)
      {
        // 原先这里直接 return：界面上什么都不发生，也没有一个字说为什么——
        // 用户看到的就是「下拉动了，终端没动」。
        giveUp(target, t('读不出终端现在是哪一档权限（底栏没露出来，或者有对话框挡着），没敢替你按 shift+tab。'));
        return;
      }

      if (start === want)
      {
        applyCycled(target);
        return;
      }

      let here = start;

      for (let i = 0; i < MAX_CYCLE_PRESSES; i++)
      {
        sendTerminalInput(encodeTerminalInput(CYCLE_KEY));

        const now = await readModeAfterPress(here);

        if (now === null)
        {
          // 没换档：要么这一下没被终端收到，要么底栏被对话框挡住了。
          // 分不清是哪一种，但两种都不该继续按——再按下去那一下可能落进对话框里。
          giveUp(target, t('按了 shift+tab 之后底栏没变（这一下可能没被终端收到，或者有对话框挡着），没有继续按下去。'));
          return;
        }

        if (now === want)
        {
          applyCycled(target);
          flash(t('已在终端里按 shift+tab 切到「{mode}」。', { mode: describeMode(target) }));
          return;
        }

        if (now === start)
        {
          break;
        }

        here = now;
      }

      giveUp(target, t('在终端里按 shift+tab 转了一圈也没转到「{mode}」，这一档只能重启终端才进得去。',
        { mode: describeMode(target) }));
    }
    finally
    {
      cyclingRef.current = false;
    }
  }

  /** 转不过去：记下来别再重试，并把真正的原因说出来。 */
  function giveUp(target: string, why: string): void
  {
    setUnreachableMode(target);
    setCycleNote(why);
  }

  /** 记下终端现在真的在这一档上，漂移提示随之消失。 */
  function applyCycled(mode: string): void
  {
    setLaunched((current) => current === null
      ? current
      : { ...current, permissionMode: mode });
  }

  /** 权限模式的中文名。 */
  function describeMode(value: string): string
  {
    const found = PERMISSION_MODES.find((mode) => mode.value === value);

    return found === undefined ? value : t(found.label);
  }

  /** 把一条待切换的命令送进终端。 */
  function flush(): void
  {
    const term = termRef.current;
    const items = liveRef.current;

    if (term === null || !startedRef.current || exited !== null)
    {
      setBlocked(false);
      return;
    }

    if (cycleRef.current !== null)
    {
      void runCycle(cycleRef.current);
    }

    if (items.length === 0)
    {
      setBlocked(false);
      return;
    }

    if (!composerIsEmpty(readComposerRows(term)))
    {
      setBlocked(true);
      return;
    }

    setBlocked(false);

    const next = items[0];

    term.paste(next.command);
    sendTerminalInput(encodeTerminalInput('\r'));

    setLaunched((current) => current === null
      ? current
      : { ...current, [next.field]: next.value });

    window.setTimeout(() => resubmitIfStuck(next.command), 700);

    // 顺带把副作用点出来：这两条命令**可能**把新值写进 ~/.claude/settings.json 当全局默认，
    flash(t('已在终端里执行 {cmd}；是否存成新会话的默认值，看终端里那行回复。', { cmd: next.command }));
  }

  /** 命令还原样躺在输入行上，就说明那一下回车没生效，补一次。 */
  function resubmitIfStuck(command: string): void
  {
    const term = termRef.current;

    if (term === null)
    {
      return;
    }

    if (readComposerRows(term).some((row) => row.indexOf(command) >= 0))
    {
      sendTerminalInput(encodeTerminalInput('\r'));
    }
  }

  const liveKey = plan.live.map((item) => item.command).join('|');

  useEffect(() =>
  {
    flushRef.current();
  }, [liveKey, plan.cycle, launched]);

  useEffect(() =>
  {
    setUnreachableMode('');
    setCycleNote('');
  }, [selected?.permissionMode]);

  const pinnedText = useMemo(
    () => (pinned === null ? '' : pinnedLabel(pinned.text, loadPrompt('terminal'))),
    [pinned],
  );

  return (
    <div className={visible ? 'terminal-panel' : 'terminal-panel is-hidden'}>
      <div className="terminal-toolbar">
        <button type="button" onClick={restart} title={t('结束当前这一路 claude 并重开一个')}>
          {t('重启')}
        </button>
        <button type="button" onClick={interrupt} title={t('发送 Ctrl+C 中断当前命令')}>
          {t('中断')}
        </button>
        <button type="button" onClick={clear} title={t('清空屏幕（不影响正在跑的进程）')}>
          {t('清屏')}
        </button>
        <button type="button" onClick={copySelection} title={t('复制选中的文本')}>
          {t('复制')}
        </button>
        <button type="button" onClick={paste} title={t('把剪贴板内容粘贴进终端')}>
          {t('粘贴')}
        </button>

        <span className="terminal-toolbar-spacer" />

        <button type="button" onClick={onClose} title={t('回到对话（终端会话继续在后台跑）')}>
          {t('回到对话')}
        </button>

        {/* 说明压缩成一句挂在标题上：它只需要在第一次看时说清楚，
            长期占着两行会把终端可视区吃掉，而终端的高度直接决定 TUI 能画几行。 */}
        <span
          className="terminal-hint"
          title={t('这一路 claude 跑的是完整终端界面：起它时从上面这条会话分叉一份，带着上下文开场，之后两边各聊各的。面板里用不了的命令（云端会话、后台任务、账号设置等）在这里都能用。')}
        >
          {t('独立会话')}
        </span>
      </div>

      {/* 型号/强度能直接切，但这一次没送出去：终端输入行里有用户还没发完的东西。
          等他发出去或清掉，收到下一批输出时会自动补上，不用他做什么——但得让他知道
          现在下拉和终端不是一回事，否则又变成「界面说了不算」。 */}
      {blocked && plan.live.length > 0 && (
        <div className="terminal-drift" role="status">
          <span className="terminal-drift-text">
            {t('终端输入行里还有没发完的内容，{cmd} 先没送进去；发出去或清空之后会自动切。',
              { cmd: plan.live[0].command })}
          </span>
        </div>
      )}

      {/* 只剩下真的没法直接切的那些（权限模式；以及切回「默认」这种 TUI 里无从表达的）。
          不自动重启：重启会丢掉终端里正在进行的会话，那是用户的东西，不能替他决定。 */}
      {plan.restart.length > 0 && (
        <div className="terminal-drift" role="status">
          <span className="terminal-drift-text">
            {(cycleNote === '' ? '' : cycleNote + ' ')
              + t('这几项只能重启终端才生效：') + plan.restart.join('，')}
          </span>
          <button type="button" onClick={restart} title={t('重开一路 claude 并用当前参数（终端里正在进行的会话会丢）')}>
            {t('重启终端以应用')}
          </button>
        </div>
      )}

      {/* 终端本体这一块单独包一层：提示条要浮在**终端**上面，得有个只罩住终端的定位参照。
          直接挂在整个面板上的话，它会飘到最顶上把工具栏按钮盖掉。 */}
      <div className="terminal-body">
        {notice !== '' && <div className="terminal-notice" role="status">{notice}</div>}

        {/* 这一格**一直占着位**，哪怕还没有可钉的东西（那时里面是空的）。
            让它随内容出现/消失的话，终端的可用高度会在会话中途变一次，xterm 跟着重排、
            TUI 收到 SIGWINCH 重画一整屏——为一条横栏搅动整个终端不值当。 */}
        <div className="terminal-pinned">
          {pinnedText !== '' && (
            <PinnedTurnBar
              text={pinnedText}
              onReveal={() =>
              {
                if (pinned !== null)
                {
                  termRef.current?.scrollToLine(pinned.row);
                }
              }}
            />
          )}
        </div>

        <div className="terminal-host" ref={hostRef} />

        {exited !== null && (
          <div className="terminal-exited" role="status">
            {exited.message.length > 0
              ? exited.message
              : t('终端里的进程已退出（退出码 {n}）。点「重启」可以重开一个。').replace('{n}', String(exited.code))}
          </div>
        )}
      </div>
    </div>
  );
}
