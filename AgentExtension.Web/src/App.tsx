// 应用根组件：接线消息桥、转录状态与正式的聊天界面。

import { useEffect, useReducer, useRef, useState } from 'react';
import { OUTBOUND } from './protocol';
import type { Envelope, AgentEvent, TabListPayload, UsageWindow } from './types';
import { initialState, reducer } from './state';
import { onHostMessage, notifyReady, sendPrompt, sendPermissionMode, sendModel, sendEffort, openPanel, runPanelAction, refreshUsage, sendResumeSession, sendNewSession, sendOpenFile, sendRestoreFile, sendEscapeUnhandled, sendInterrupt, sendExportTranscript, sendTabCreate, sendTabActivate, sendTabClose, sendUiPrefs } from './bridge';
import { applyTheme } from './theme';
import { DEFAULT_PERMISSION_MODE } from './permissionModes';
import { DEFAULT_BRAND, DEFAULT_MODEL, resolveModelForBrand } from './models';
import { applyAppearance, loadAppearance, saveAppearance, sanitizeAppearance } from './appearance';
import type { Appearance } from './appearance';
import { loadLang, saveLang, translate, isLang } from './i18n';
import type { Lang } from './i18n';
import { LangContext } from './LangContext';
import { initialPanel, panelReducer } from './panelState';
import type { PanelResultPayload } from './panelState';
import { panelIdForCommand, isFrontendOnlyPanel } from './panelCommands';
import { withKnownTerminalOnly } from './commandCatalog';
import { fallbackFor, rejectionNoteFor } from './commandFallbacks';
import type { Fallback } from './commandFallbacks';
import { Transcript } from './components/Transcript';
import { StatusBar } from './components/StatusBar';
import { Composer } from './components/Composer';
import type { ComposerInjection, Attachment } from './components/Composer';
import { PanelOverlay } from './components/PanelOverlay';
import { TerminalPanel } from './components/TerminalPanel';
import type { TerminalHandle } from './components/TerminalPanel';
import { TerminalComposer } from './components/TerminalComposer';
import { PluginPanel, PLUGIN_TABS } from './components/PluginPanel';
import { McpPanel } from './components/McpPanel';
import type { McpPanelHandle } from './components/McpPanel';
import { AgentsPanel } from './components/AgentsPanel';
import { DoctorPanel } from './components/DoctorPanel';
import { StatusPanel } from './components/StatusPanel';
import { SessionsPanel } from './components/SessionsPanel';
import { MemoryPanel } from './components/MemoryPanel';
import { CommandsPanel } from './components/CommandsPanel';
import { FileHistoryPanel } from './components/FileHistoryPanel';
import { PermissionsPanel } from './components/PermissionsPanel';
import { SettingsFilesPanel } from './components/SettingsFilesPanel';
import { UsageBar } from './components/UsageBar';
import { SessionInfoBar } from './components/SessionInfoBar';
import { TabStrip } from './components/TabStrip';

/** 面板请求无回应的等待上限。 */
const PANEL_REQUEST_TIMEOUT_MS = 180000;

/** 导出转录时段与段之间的空行。 */
const BLANK_LINE = '\n\n';

/** 「⋯」菜单里列出的面板，顺序即展示顺序。 */
// 「终端」放在最前：它是本管线用不了的那些命令的唯一出口，
const PANEL_MENU_IDS = ['terminal', 'sessions', 'fileHistory', 'plugin', 'mcp', 'agents', 'memory', 'permissions', 'settingsFiles', 'commands', 'doctor', 'status'];

/** 前端面板的标题。 */
const FRONTEND_PANEL_TITLES: Record<string, string> = {
  status: '状态',
  commands: '命令',
  terminal: '终端',
};

/** 面板 id 到标题的查表，未实现的面板此前直接显示内部 id，用户会误以为坏了。 */
const PANEL_TITLES: Record<string, string> = {
  plugin: '插件',
  pluginMarket: '插件市场',
  pluginUpdates: '插件更新',
  mcp: 'MCP 服务器',
  agents: '后台代理',
  doctor: '健康检查',
  sessions: '会话历史',
  memory: '记忆',
  fileHistory: '文件回滚',
  permissions: '权限',
  settingsFiles: '设置文件',
};

function App()
{
  const [state, dispatch] = useReducer(reducer, initialState);

  const [panel, dispatchPanel] = useReducer(panelReducer, initialPanel);

  const panelRequestSeq = useRef(0);

  const panelTimeoutRef = useRef<number | null>(null);

  const pendingPanelRequestIdRef = useRef('');

  const mcpPanelRef = useRef<McpPanelHandle>(null);

  function disarmPanelTimeout()
  {
    if (panelTimeoutRef.current !== null)
    {
      window.clearTimeout(panelTimeoutRef.current);
      panelTimeoutRef.current = null;
    }
  }

  function armPanelTimeout(requestId: string)
  {
    disarmPanelTimeout();
    pendingPanelRequestIdRef.current = requestId;
    panelTimeoutRef.current = window.setTimeout(() =>
    {
      dispatchPanel({ type: 'timeout', requestId });
    }, PANEL_REQUEST_TIMEOUT_MS);
  }

  /** 回包到达时是否该拆表：requestId 与当前挂着表的那个相符，或任一侧为空。 */
  function isPanelReplyCurrent(requestId: string | undefined): boolean
  {
    const incoming = requestId ?? '';
    const pending = pendingPanelRequestIdRef.current;
    return incoming === '' || pending === '' || incoming === pending;
  }

  function nextPanelRequestId(): string
  {
    panelRequestSeq.current += 1;
    return String(panelRequestSeq.current);
  }

  /** 打开面板：清空重来的那种，用于首次打开/切换面板。 */
  function openPanelTracked(panelId: string)
  {
    const requestId = nextPanelRequestId();
    dispatchPanel({ type: 'open', panelId, requestId });

    if (isFrontendOnlyPanel(panelId))
    {
      dispatchPanel({
        type: 'data',
        payload: {
          panelId, items: [], error: '', rawText: '',
          showsRawText: false, restartHint: false, requestId,
        },
      });
      return;
    }

    openPanel(panelId, requestId);
    armPanelTimeout(requestId);
  }

  /** 重新取数但不清空已有条目，用于刷新按钮。 */
  function refreshPanelTracked(panelId: string)
  {
    const requestId = nextPanelRequestId();
    dispatchPanel({ type: 'loading', requestId });
    openPanel(panelId, requestId);
    armPanelTimeout(requestId);
  }

  /** 执行一条面板动作。 */
  function runPanelActionTracked(panelId: string, actionId: string, values: string[])
  {
    const requestId = nextPanelRequestId();
    dispatchPanel({ type: 'loading', requestId });
    runPanelAction(panelId, actionId, values, requestId);
    armPanelTimeout(requestId);
  }

  const [permissionMode, setPermissionMode] = useState(DEFAULT_PERMISSION_MODE);

  const [model, setModel] = useState(DEFAULT_MODEL);

  const [brand, setBrand] = useState(DEFAULT_BRAND);

  const [effort, setEffort] = useState('');

  // tab 条由宿主全权判定（未读与忙都是宿主标的），前端只负责画和派发。
  const [tabList, setTabList] = useState<TabListPayload>({ tabs: [], activeId: '' });

  // 真正**发给过宿主**的那两个值。
  const [sentModel, setSentModel] = useState('');
  const [sentEffort, setSentEffort] = useState('');

  const userPickedModel = useRef(false);
  const userPickedEffort = useRef(false);

  const probedModel = state.session?.model ?? '';
  const probedEffort = state.session?.effortLevel ?? '';

  useEffect(() =>
  {
    if (!userPickedModel.current && probedModel)
    {
      setModel(probedModel);
    }
  }, [probedModel]);

  useEffect(() =>
  {
    if (!userPickedEffort.current && probedEffort)
    {
      setEffort(probedEffort);
    }
  }, [probedEffort]);

  const wasBusy = useRef(false);

  useEffect(() =>
  {
    // 只在一轮说完后探一次：探测会被 CLI 记进转录，空转就是往里灌噪音。
    if (wasBusy.current && !state.busy)
    {
      refreshUsage();
    }

    wasBusy.current = state.busy;
  }, [state.busy]);

  const [appearance, setAppearance] = useState<Appearance>(() => loadAppearance());

  const [lang, setLang] = useState<Lang>(() => loadLang());

  function handleLangChange(next: Lang)
  {
    setLang(next);
    saveLang(next);
    sendUiPrefs(next, appearance);
  }

  /** 外观变了：本地照旧应用 + 存档，另外广播给其余 tab（设计文档 §9：外观是全局设置）。 */
  function handleAppearanceChange(next: Appearance)
  {
    setAppearance(next);
    sendUiPrefs(lang, next);
  }

  /** 面板标题要跟着语言走，而 PANEL_TITLES 存的是中文原文（同时也是查表的键）。 */
  function panelTitle(panelId: string): string
  {
    const zh = PANEL_TITLES[panelId] ?? FRONTEND_PANEL_TITLES[panelId];
    return zh === undefined ? panelId : translate(lang, zh);
  }

  useEffect(() =>
  {
    applyAppearance(appearance, document.documentElement);
    saveAppearance(appearance);
  }, [appearance]);

  const explainedRejectionRef = useRef(0);

  useEffect(() =>
  {
    const rejection = state.lastUnavailable;

    if (rejection === null || rejection.seq === explainedRejectionRef.current)
    {
      return;
    }

    explainedRejectionRef.current = rejection.seq;
    postLocalNotice(rejectionNoteFor(rejection.command));
  }, [state.lastUnavailable]);

  const busyRef = useRef(false);
  busyRef.current = state.busy;

  useEffect(() =>
  {
    function onKeyDown(event: KeyboardEvent)
    {
      if (event.key !== 'Escape' || event.defaultPrevented)
      {
        return;
      }

      // 顺序不能反：弹层与选项框都调了 preventDefault，走到这里说明网页的界面元素
      if (busyRef.current)
      {
        sendInterrupt();
        return;
      }

      sendEscapeUnhandled();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const [injection, setInjection] = useState<ComposerInjection | null>(null);

  /** 终端是否正占着主视图。 */
  const terminalOpen = panel !== null && panel.panelId === 'terminal';

  // 对话那一路要标「仅终端」的命令：实测学来的那份（撞过 CLI 的拒绝）＋事先测好的 TUI 目录。
  const unavailableForDisplay = withKnownTerminalOnly(
    state.unavailableCommands, state.session?.terminalSlashCommands ?? []);

  const terminalHandleRef = useRef<TerminalHandle | null>(null);
  const injectionSeq = useRef(0);

  const [fileResults, setFileResults] = useState<{ requestId: string; results: string[] } | null>(null);
  const [droppedFiles, setDroppedFiles] = useState<{ paths: string[]; seq: number } | null>(null);
  const droppedSeq = useRef(0);

  useEffect(() =>
  {
    const unsubscribe = onHostMessage((data) =>
    {
      const message = data as Envelope<unknown>;
      if (!message || typeof message.type !== 'string')
      {
        return;
      }

      switch (message.type)
      {
        case OUTBOUND.Event:
        {
          dispatch({ type: 'agentEvent', event: message.payload as AgentEvent });
          break;
        }
        case OUTBOUND.Replay:
        {
          dispatch({ type: 'replay', events: message.payload as AgentEvent[] });
          break;
        }
        case OUTBOUND.Theme:
        {
          applyTheme(message.payload as Record<string, string>);
          break;
        }
        case OUTBOUND.PanelData:
        {
          const payload = message.payload as PanelResultPayload;

          if (isPanelReplyCurrent(payload.requestId))
          {
            disarmPanelTimeout();
          }
          dispatchPanel({ type: 'data', payload });
          break;
        }
        case OUTBOUND.Tabs:
        {
          // 整条替换。宿主每次推的都是完整列表，累加会留下已经关掉的 tab。
          const tabsPayload = message.payload as TabListPayload;
          setTabList(tabsPayload);

          // 键盘切换来的：等这一帧画完，把焦点放到新激活的 tab 上。
          if (tabsPayload.focusStrip)
          {
            const activeId = tabsPayload.activeId;
            requestAnimationFrame(() =>
            {
              document.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`)?.focus();
            });
          }
          break;
        }
        case OUTBOUND.Usage:
        {
          // 别的 tab 广播来的额度快照，只合并进 session，不碰其它字段。
          const usage = message.payload as { usageWindows?: UsageWindow[]; usageRawText?: string };
          dispatch({
            type: 'usage',
            usageWindows: usage?.usageWindows ?? [],
            usageRawText: usage?.usageRawText ?? '',
          });
          break;
        }
        case OUTBOUND.UiPrefs:
        {
          // 别的 tab 广播过来的语言/外观：只应用，不再存档——发起方本地已经存过了，
          // localStorage 同源共享；这里也绝不能再 sendUiPrefs 一遍，否则两个 tab 来回广播成环。
          const prefs = message.payload as { lang?: unknown; appearance?: Partial<Appearance> };

          if (isLang(prefs?.lang))
          {
            setLang(prefs.lang);
          }

          if (prefs?.appearance)
          {
            setAppearance(sanitizeAppearance(prefs.appearance));
          }
          break;
        }
        case OUTBOUND.Context:
        {
          const context = message.payload as { kind: string; text?: string; requestId?: string; results?: string[] };

          if (context && context.kind === 'files')
          {
            setFileResults({ requestId: context.requestId ?? '', results: context.results ?? [] });
            break;
          }

          if (context && context.kind === 'droppedFiles')
          {
            droppedSeq.current += 1;
            setDroppedFiles({ paths: context.results ?? [], seq: droppedSeq.current });
            break;
          }

          if (context && context.kind === 'fileContent')
          {
            break;
          }

          if (context && context.text)
          {
            injectionSeq.current += 1;
            setInjection({ text: context.text, seq: injectionSeq.current });
          }
          break;
        }
        default:
        {
          break;
        }
      }
    });

    notifyReady();

    return unsubscribe;
  }, []);

  /** 在转录里写一条本地说明。 */
  function postLocalNotice(zh: string, count?: number)
  {
    const text = translate(lang, zh);

    dispatch({
      type: 'agentEvent',
      event: {
        kind: 'Notice',
        content: count === undefined ? text : text.replace('{n}', String(count)),
      } as AgentEvent,
    });
  }

  /** 写剪贴板，**成功才报成功**。 */
  function copyToClipboard(text: string, successNote: string, count?: number)
  {
    navigator.clipboard.writeText(text).then(
      () => postLocalNotice(successNote, count),
      () => postLocalNotice('复制到剪贴板失败（浏览器拒绝了写剪贴板）。用 /export 可以把转录写成文件。'));
  }

  /** 把转录拼成 Markdown。 */
  function transcriptAsMarkdown(): string
  {
    const parts = state.blocks
      .filter((block) => block.kind === 'user' || block.kind === 'assistant' || block.kind === 'notice')
      .map((block) =>
      {
        const prefix = block.kind === 'user' ? '## ' : block.kind === 'notice' ? '> ' : '';
        return `${prefix}${block.text}`;
      });

    return parts.join(BLANK_LINE);
  }

  /** 执行落点里的动作。 */
  function runFallbackAction(fallback: Fallback)
  {
    switch (fallback.action)
    {
      case 'copyLast':
      {
        const replies = state.blocks.filter(
          (block) => block.kind === 'assistant' && block.text.trim() !== '');
        const index = fallback.arg ?? 1;
        const target = replies[replies.length - index];

        if (!target)
        {
          if (replies.length === 0)
          {
            postLocalNotice('还没有可复制的回复。');
          }
          else
          {
            postLocalNotice('没有那么多条回复：当前只有 {n} 条。', replies.length);
          }

          return;
        }

        // 回执由 copyToClipboard 在**写成功之后**发，不落到末尾那条通用回执上。
        copyToClipboard(target.text, fallback.note, index);
        return;
      }

      case 'copyTranscript':
      {
        const markdown = transcriptAsMarkdown();

        if (markdown === '')
        {
          postLocalNotice('转录还是空的，没有可导出的内容。');
          return;
        }

        copyToClipboard(markdown, fallback.note);
        return;
      }

      case 'exportTranscript':
      {
        const markdown = transcriptAsMarkdown();

        if (markdown === '')
        {
          postLocalNotice('转录还是空的，没有可导出的内容。');
          return;
        }

        sendExportTranscript(markdown);
        break;
      }

      case 'planMode':
        handleModeChange('plan');
        break;

      case 'interrupt':
        sendInterrupt();
        break;
    }

    postLocalNotice(fallback.note);
  }

  function handleSend(text: string, attachments: Attachment[])
  {
    const panelId = panelIdForCommand(text);

    if (panelId !== null && attachments.length === 0)
    {
      openPanelTracked(panelId);
      return;
    }

    // 其余被 CLI 拒的命令：按落点表处理，绝不让它撞上那句
    const fallback = attachments.length === 0 ? fallbackFor(text) : null;

    if (fallback !== null)
    {
      if (fallback.action !== undefined)
      {
        runFallbackAction(fallback);
      }
      else
      {
        if (fallback.panelId !== undefined)
        {
          openPanelTracked(fallback.panelId);
        }

        postLocalNotice(fallback.note);
      }

      return;
    }

    const shown = attachments.length > 0
      ? `${text}${text ? '\n\n' : ''}[已附 ${attachments.length} 张图片]`
      : text;

    dispatch({ type: 'userSent', text: shown });
    sendPrompt(text, attachments.map((a) => ({ mediaType: a.mediaType, data: a.data })));
  }

  /** 从状态栏 `⋯` 菜单打开面板，走与 handleSend 截获路径相同的两步。 */
  function handleOpenPanel(panelId: string)
  {
    openPanelTracked(panelId);
  }

  /** 终端与对话之间来回切。 */
  function handleToggleTerminal()
  {
    if (terminalOpen)
    {
      disarmPanelTimeout();
      pendingPanelRequestIdRef.current = '';
      dispatchPanel({ type: 'close' });
      return;
    }

    openPanelTracked('terminal');
  }

  function handleModeChange(mode: string)
  {
    setPermissionMode(mode);
    sendPermissionMode(mode);
  }

  function handleModelChange(next: string)
  {
    userPickedModel.current = true;
    setModel(next);
    setSentModel(next);
    sendModel(next);
  }

  function handleEffortChange(next: string)
  {
    userPickedEffort.current = true;
    setEffort(next);
    setSentEffort(next);
    sendEffort(next);
  }

  function handleBrandChange(nextBrand: string)
  {
    setBrand(nextBrand);

    // 原型号在新品牌里不存在时会被换掉，此时必须一并通知宿主，
    const nextModel = resolveModelForBrand(nextBrand, model);
    if (nextModel !== model)
    {
      setModel(nextModel);
      setSentModel(nextModel);
      sendModel(nextModel);
    }
  }

  return (
    <LangContext.Provider value={lang}>
    <div className="app">
      {/* tab 条放最顶上。它画在网页里，所以每个 tab 的前端都会各画一条，
          但同一时刻只有激活那块 WebView 是可见的（宿主用 Visibility 换人）。 */}
      <TabStrip
        tabs={tabList.tabs}
        activeId={tabList.activeId}
        onActivate={(id, fromKeyboard) => sendTabActivate(id, fromKeyboard)}
        onClose={(id) => sendTabClose(id)}
        onCreate={() => sendTabCreate()}
      />

      {/* 窗口顶部：额度用量。放最显眼的位置——它是订阅制下唯一有意义的用量指标，
          而轮次结束行里那个金额是按 API 标价折算的等价成本，并不据此扣费。 */}
      <UsageBar
        windows={state.session?.usageWindows ?? []}
        onRefresh={() => refreshUsage()}
      />

      {/* selected：三条栏里这三项与终端进程的当前状态之间可能不一致，由终端面板负责消解。
          型号与强度**能直接切**——TUI 自己有 /model 和 /effort，实测即刻生效（见
          terminalSwitch.ts 的文件头）；只有权限模式没有对应命令，才需要重启。
          原先三项一律说「重启才生效」，那是把对话那条 --print 管线的结论整条搬了过来。 */}
      {/* 两者都留在树里，靠 visible/hidden 换人，**不卸载**。
          终端卸载 = 丢内容：xterm 的回滚缓冲活在 Terminal 实例里，`term.dispose()` 一调就没了；
          而藏起来的这段时间宿主照发输出，卸载后没有接收方，那批字节也一并丢掉。
          宿主刻意不杀进程，于是重开时是「进程活着、屏幕全白、且永远不会自己填回来」——
          看着就是卡死。实测（2026-08-21，CLI 2.1.238）：重开后干等 8 秒仍是空的，
          只有把窗口宽度改一下（SIGWINCH 逼它重绘）才整屏回来，证明进程一直好好的。
          转录虽然有 reducer 兜着内容，但卸载会丢滚动位置，切回来直接跳到顶部。
          终端**一开始就挂**（首屏默认就在终端，见 panelState 的 initialPanel）。
          藏着时挂上并不会起进程：TUI 那一路要等拿到真实尺寸才 sendTerminalStart，
          而藏着的容器量不出尺寸（见 TerminalPanel 的启动 effect 守卫）。 */}
      <TerminalPanel
        selected={{ model: sentModel, effort: sentEffort, permissionMode }}
        knownModels={state.session?.availableModels ?? []}
        knownEfforts={state.session?.effortLevels ?? []}
        appearance={appearance}
        visible={terminalOpen}
        handleRef={terminalHandleRef}
        onClose={handleToggleTerminal}
      />
      <Transcript
        blocks={state.blocks}
        hidden={terminalOpen}
        onRunCommand={(text) => handleSend(text, [])}
      />
      <StatusBar
        effort={effort}
        onEffortChange={handleEffortChange}
        effortLevels={state.session?.effortLevels ?? []}
        permissionMode={permissionMode}
        onPermissionModeChange={handleModeChange}
        appearance={appearance}
        onAppearanceChange={handleAppearanceChange}
        busy={state.busy}
        onOpenPanel={handleOpenPanel}
        terminalOpen={terminalOpen}
        onToggleTerminal={handleToggleTerminal}
        panelMenu={PANEL_MENU_IDS.map((id) => ({ id, label: panelTitle(id) }))}
        lang={lang}
        onLangChange={handleLangChange}
      />
      {/* 输入框这一格按当前视图换人，而**不是**空着。
          原先终端开着时这里是空的，理由写的是「两个输入口并排会让人不知道该打哪个」——
          这个判断错了：TUI 自己的 `❯` 只有一个字符宽、悬在一片黑里，看不出能敲字，
          而下面这一格是空的，真机反馈就是「缺个输入框」。
          终端输入框送出去的内容走 xterm 的 paste()，和按 Ctrl+V 同一条路，不是另开一条通道。 */}
      <TerminalComposer
        handleRef={terminalHandleRef}
        commands={state.terminalCommands}
        fileResults={fileResults}
        droppedFiles={droppedFiles}
        hidden={!terminalOpen}
      />
      <Composer
        busy={state.busy}
        slashCommands={state.slashCommands}
        unavailableCommands={unavailableForDisplay}
        hidden={terminalOpen}
        onSend={handleSend}
        injection={injection}
        fileResults={fileResults}
        droppedFiles={droppedFiles}
      />
      {/* 输入框底部：品牌 / 型号 + 会话信息 + 进 status 面板的入口。
          品牌与型号从上面那条状态栏挪下来——那一行在英文下放不下会换行、高度乱跳。
          长列表留给面板，挤在这一行里只会把关键信息推出可视区。 */}
      <SessionInfoBar
        session={state.session}
        brand={brand}
        onBrandChange={handleBrandChange}
        selectedModel={model}
        onModelChange={handleModelChange}
        reportedModels={state.session?.models ?? []}
        availableModels={state.session?.availableModels ?? []}
        busy={state.busy}
        onOpenStatus={() => openPanelTracked('status')}
      />
      {/* 终端**不走覆盖层**。覆盖层是 position:absolute; inset:0，会把额度栏、状态栏、
          会话信息栏连同「⋯」菜单一起盖掉；而终端是要长时间待着的视图，
          那三条栏和菜单在终端里同样有用（额度、权限模式、模型、外观、语言）。
          所以终端占「转录」那一格，其余面板照旧用覆盖层。 */}
      {panel !== null && !terminalOpen && (
        <PanelOverlay
          title={panelTitle(panel.panelId)}
          loading={panel.loading}
          error={panel.error}
          rawText={panel.panelId === 'doctor' ? '' : panel.rawText}
          // 出错时下面那份列表是上一次取到的（reducer 有意保留），必须标出来是旧的。
          staleItems={panel.error !== '' && panel.items.length > 0}
          showsRawText={panel.showsRawText}
          onClose={() => {
            disarmPanelTimeout();
            pendingPanelRequestIdRef.current = '';
            dispatchPanel({ type: 'close' });
          }}
          // status 面板没有宿主取数，它的「刷新」就是重探额度（其余字段来自握手，不会变）。
          onRefresh={() => {
            if (isFrontendOnlyPanel(panel.panelId))
            {
              refreshUsage();
              return;
            }

            refreshPanelTracked(panel.panelId);
          }}
          onEscapeCapture={panel.panelId === 'mcp'
            ? () => mcpPanelRef.current?.handleEscape() ?? false
            : undefined}
        >
          {/* 三个插件 tab 共用同一个组件：它们的区别只在取数命令与可执行动作，
              而那两样都在 C# 侧的目录里，前端只需要把当前 panelId 交给它。 */}
          {PLUGIN_TABS.some((tab) => tab.panelId === panel.panelId) && (
            <PluginPanel
              panelId={panel.panelId}
              items={panel.items}
              error={panel.error}
              loading={panel.loading}
              restartHint={panel.restartHint}
              onAction={(actionId, values) => runPanelActionTracked(panel.panelId, actionId, values)}
              onDismissRestart={() => dispatchPanel({ type: 'dismissRestart' })}
              onSwitchPanel={(nextPanelId) => openPanelTracked(nextPanelId)}
            />
          )}
          {panel.panelId === 'mcp' && (
            <McpPanel
              ref={mcpPanelRef}
              items={panel.items}
              error={panel.error}
              loading={panel.loading}
              onAction={(actionId, values) => runPanelActionTracked(panel.panelId, actionId, values)}
            />
          )}
          {panel.panelId === 'agents' && (
            <AgentsPanel items={panel.items} error={panel.error} loading={panel.loading} />
          )}
          {panel.panelId === 'doctor' && <DoctorPanel rawText={panel.rawText} />}
          {panel.panelId === 'status' && <StatusPanel session={state.session} />}
          {panel.panelId === 'sessions' && (
            <SessionsPanel
              items={panel.items}
              currentSessionId={state.session?.sessionId ?? ''}
              error={panel.error}
              loading={panel.loading}
              onResume={(sessionId, fork) => {
                disarmPanelTimeout();
                pendingPanelRequestIdRef.current = '';
                dispatchPanel({ type: 'close' });
                sendResumeSession(sessionId, fork);
              }}
              onNewSession={() => {
                disarmPanelTimeout();
                pendingPanelRequestIdRef.current = '';
                dispatchPanel({ type: 'close' });
                sendNewSession();
              }}
            />
          )}
          {panel.panelId === 'memory' && (
            <MemoryPanel
              items={panel.items}
              error={panel.error}
              loading={panel.loading}
              onOpenFile={(path) => sendOpenFile(path, 1)}
            />
          )}
          {panel.panelId === 'fileHistory' && (
            <FileHistoryPanel
              items={panel.items}
              error={panel.error}
              loading={panel.loading}
              onRestore={(itemId) => {
                sendRestoreFile(itemId);
                refreshPanelTracked('fileHistory');
              }}
            />
          )}
          {panel.panelId === 'permissions' && (
            <PermissionsPanel
              items={panel.items}
              error={panel.error}
              loading={panel.loading}
              onOpenFile={(path) => sendOpenFile(path, 1)}
            />
          )}
          {panel.panelId === 'settingsFiles' && (
            <SettingsFilesPanel
              items={panel.items}
              error={panel.error}
              loading={panel.loading}
              onOpenFile={(path) => sendOpenFile(path, 1)}
            />
          )}
          {panel.panelId === 'commands' && (
            <CommandsPanel
              session={state.session}
              unavailableCommands={unavailableForDisplay}
            />
          )}
        </PanelOverlay>
      )}
    </div>
    </LangContext.Provider>
  );
}

export default App;
