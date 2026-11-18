// 应用根组件：接线消息桥、转录状态与正式的聊天界面。

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { OUTBOUND } from './protocol';
import type { Envelope, AgentEvent, TabListPayload, UsageWindow } from './types';
import { initialState, reducer } from './state';
import { onHostMessage, notifyReady, sendPrompt, sendPermissionMode, sendModel, sendEffort, sendRemoteControl, openPanel, runPanelAction, refreshUsage, sendResumeSession, sendTeleportSession, sendOpenWebLink, sendNewSession, sendOpenFile, sendRestoreFile, sendEscapeUnhandled, sendInterrupt, sendExportTranscript, sendTabCreate, sendTabActivate, sendTabClose, sendUiPrefs, sendClientDiag, sendUltracode } from './bridge';
import { isUltracodeVisible, modelSupportsEffort, sliderEffortLevels, ultracodeShownOn } from './ultracode';
import { describePhases, formatBoot, longTaskSupported, markPhase, sampleBoot } from './bootTiming';
import { applyTheme } from './theme';
import { DEFAULT_PERMISSION_MODE } from './permissionModes';
import {
  DEFAULT_BRAND, DEFAULT_MODEL, buildModelOptions, friendlyModelName, matchModelValue, resolveModelForBrand,
} from './models';
import { buildEffortOptions, effortLevelsForModel } from './efforts';
import type { MenuHost } from './commandMenu';
import { AccountDialog } from './components/AccountDialog';
import { LoginDialog } from './components/LoginDialog';
import { LogoutDialog } from './components/LogoutDialog';
import { SideQuestionDialog } from './components/SideQuestionDialog';
import { SkillsDialog } from './components/SkillsDialog';
import { ToolsDialog } from './components/ToolsDialog';
import { PermissionRulesDialog } from './components/PermissionRulesDialog';
import { MemoryDialog } from './components/MemoryDialog';
import { FeedbackDialog } from './components/FeedbackDialog';
import { DesignLoginDialog } from './components/DesignLoginDialog';
import { HooksDialog } from './components/HooksDialog';
import { ChromeDialog } from './components/ChromeDialog';
import { SandboxDialog } from './components/SandboxDialog';
import { BackgroundContext, backgroundableToolIds } from './backgroundable';
import type { BackgroundAction } from './backgroundable';
import { sendBackground, sendReloadPlugins } from './bridge';
import type { SideQa } from './components/SideQuestionDialog';
import { BookmarksPanel } from './components/BookmarksPanel';
import { loadBookmarks, saveBookmarks, toggleBookmark } from './bookmarks';
import type { Bookmark } from './bookmarks';
import type { Block } from './state';
import { AgentMapDialog } from './components/AgentMapDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { buildAgentMap } from './agentMap';
import { applyAppearance, loadAppearance, saveAppearance, sanitizeAppearance } from './appearance';
import type { Appearance } from './appearance';
import { loadLang, saveLang, translate, isLang } from './i18n';
import type { Lang } from './i18n';
import { LangContext } from './LangContext';
import { remainingRatio } from './contextMeter';
import { initialPanel, panelReducer } from './panelState';
import type { PanelResultPayload } from './panelState';
import { panelIdForCommand, isFrontendOnlyPanel } from './panelCommands';
import { withKnownTerminalOnly } from './commandCatalog';
import { fallbackFor, rejectionNoteFor } from './commandFallbacks';
import type { Fallback } from './commandFallbacks';
import { Transcript } from './components/Transcript';
import { StatusBar } from './components/StatusBar';
import { ContextRing } from './components/ContextRing';
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
import { ModelPicker } from './components/ModelPicker';
import { SessionManager } from './components/SessionManager';
import type { CloudSessionsView, SessionManagerHandle } from './components/SessionManager';
import { MemoryPanel } from './components/MemoryPanel';
import { CommandsPanel } from './components/CommandsPanel';
import { FileHistoryPanel } from './components/FileHistoryPanel';
import { SettingsFilesPanel } from './components/SettingsFilesPanel';
import { UsageBar } from './components/UsageBar';
import { SessionInfoBar } from './components/SessionInfoBar';
import { TabStrip } from './components/TabStrip';
import { SessionPicker } from './components/SessionPicker';
import type { AnchorRect } from './components/SessionPicker';
import type { PanelItemView } from './panelState';

/** 面板请求无回应的等待上限。 */
const PANEL_REQUEST_TIMEOUT_MS = 180000;

/** 会话小弹层取数的请求号前缀，与面板的纯数字请求号区分开。 */
const SESSION_PICKER_REQUEST_PREFIX = 'sp-';

/** 网页会话列表的请求前缀；与面板、会话小弹层各走各的。 */
const CLOUD_SESSIONS_REQUEST_PREFIX = 'cs-';

/** 等网页会话的上限：宿主等 CLI 最多 45 秒，这里多留一点。 */
const CLOUD_SESSIONS_TIMEOUT_MS = 60000;

const CLOUD_SESSIONS_TIMEOUT_TEXT = '读取网页会话超时，请点「刷新」重试。';

/** 取数超时的说明（中文键，显示时再翻译）。 */
const SESSION_PICKER_TIMEOUT_TEXT = '读取会话列表超时，请重试。';

/** 会话小弹层的状态。 */
interface SessionPickerState {
  loading: boolean;
  items: PanelItemView[];
  error: string;
  /** 触发按钮的位置；从命令菜单打开时为 null。 */
  anchor: AnchorRect | null;
}

/** 导出转录时段与段之间的空行。 */
const BLANK_LINE = '\n\n';

/** 专注视图开关的存储键。 */
const FOCUS_VIEW_KEY = 'agentext.focusView';

/** 「⋯」菜单里列出的面板，顺序即展示顺序。 */
// 「终端」放在最前：它是本管线用不了的那些命令的唯一出口，
// 状态、MCP、子代理不在这里：底栏各有入口，/mcp、/agents 也能开
const PANEL_MENU_IDS = ['terminal', 'sessions', 'fileHistory', 'plugin', 'skills', 'tools', 'memory', 'permissionRules', 'settingsFiles', 'commands', 'doctor'];

/** 面板菜单里打开弹窗而不是面板的那几项。 */
const DIALOG_MENU_TITLES: Record<string, string> = {
  permissionRules: '权限规则',
  skills: '技能',
  tools: '工具',
};

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
  sessions: '会话管理',
  cloudSessions: 'Web 会话',
  memory: '记忆',
  fileHistory: '文件回滚',
  settingsFiles: '设置文件',
};

function App()
{
  markPhase('App渲染');

  const [state, dispatch] = useReducer(reducer, initialState);

  const [panel, dispatchPanel] = useReducer(panelReducer, initialPanel);

  const panelRequestSeq = useRef(0);

  const panelTimeoutRef = useRef<number | null>(null);

  const pendingPanelRequestIdRef = useRef('');

  const mcpPanelRef = useRef<McpPanelHandle>(null);
  const sessionManagerRef = useRef<SessionManagerHandle>(null);

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
  // 远程控制开没开以 CLI 回话为准；「发出去了还没回话」也记在 reducer 里
  const remotePending = state.remoteControl.pending;
  const remoteControl = state.remoteControl.state === 'connected';

  const [model, setModel] = useState(DEFAULT_MODEL);

  const [brand, setBrand] = useState(DEFAULT_BRAND);

  const [effort, setEffort] = useState('');

  // 刚点过 Ultracode 开关的乐观值；CLI 报了真实状态就让位。
  const [ultracodeOptimistic, setUltracodeOptimistic] = useState<boolean | null>(null);

  useEffect(() =>
  {
    if (state.ultracode.on !== null)
    {
      setUltracodeOptimistic(null);
    }
  }, [state.ultracode]);

  const ultracodeVisible = isUltracodeVisible(
    state.ultracode,
    state.session?.effortLevels ?? [],
    modelSupportsEffort(model, state.session?.models ?? []));
  const ultracodeOn = ultracodeVisible && ultracodeShownOn(state.ultracode, ultracodeOptimistic);

  function handleUltracodeChange(on: boolean)
  {
    setUltracodeOptimistic(on);
    sendUltracode(on);
  }

  // 「账号与用量」小弹窗是否开着。
  const [accountOpen, setAccountOpen] = useState(false);

  // 「设置」小弹窗是否开着。
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 「登录」小弹窗是否开着。
  const [loginOpen, setLoginOpen] = useState(false);

  // 「退出登录」确认框是否开着。
  const [logoutOpen, setLogoutOpen] = useState(false);

  // 侧问侧栏：null 是关着；text 是要问的话，seq 每来一次 /btw 加一。
  const [sideQuestion, setSideQuestionState] = useState<{ text: string; seq: number } | null>(null);
  const [sideThread, setSideThread] = useState<SideQa[]>([]);

  // 书签侧栏是否开着；与侧问同一个位置，开一个关另一个。
  const [bookmarksOpen, setBookmarksOpen] = useState(false);

  /** 打开侧问侧栏；text 非空就接着问。 */
  function setSideQuestion(text: string | null)
  {
    if (text === null)
    {
      setSideQuestionState(null);
      return;
    }

    setBookmarksOpen(false);
    setSideQuestionState((prev) => ({ text, seq: (prev?.seq ?? 0) + 1 }));
  }

  /** 打开书签侧栏，顺手关掉侧问。 */
  function openBookmarks()
  {
    setSideQuestionState(null);
    setBookmarksOpen(true);
  }

  // 专注视图：藏起工具调用与思考；按机器记住。
  const [focusView, setFocusView] = useState(() => localStorage.getItem(FOCUS_VIEW_KEY) === '1');

  function toggleFocusView()
  {
    setFocusView((prev) =>
    {
      const next = !prev;
      localStorage.setItem(FOCUS_VIEW_KEY, next ? '1' : '0');
      return next;
    });
  }

  // 书签按会话存；换了会话就换一份。
  const sessionId = state.session?.sessionId ?? '';
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  useEffect(() =>
  {
    setBookmarks(loadBookmarks(sessionId));
  }, [sessionId]);

  const bookmarkedIds = useMemo(() => new Set(bookmarks.map((item) => item.id)), [bookmarks]);

  // 引用稳定：转录块是 memo 的，回调一变就整片重画。
  const handleToggleBookmark = useCallback((block: Block) =>
  {
    setBookmarks((prev) =>
    {
      const next = toggleBookmark(prev, block.at, block.text, Date.now());
      saveBookmarks(sessionIdRef.current, next);
      return next;
    });
  }, []);

  function removeBookmark(id: string)
  {
    setBookmarks((prev) =>
    {
      const next = prev.filter((item) => item.id !== id);
      saveBookmarks(sessionIdRef.current, next);
      return next;
    });
  }

  /** 滚到书签那条回复并闪一下；找不到返回 false。 */
  function revealBookmark(id: string): boolean
  {
    const target = document.getElementById(id);

    if (target === null)
    {
      return false;
    }

    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    target.classList.remove('is-flash');
    void target.offsetWidth;
    target.classList.add('is-flash');
    return true;
  }

  // 「技能」弹窗是否开着。
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  // 「权限规则」弹窗是否开着。
  const [rulesOpen, setRulesOpen] = useState(false);

  // 「记忆」「沙箱」弹窗是否开着。
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [sandboxOpen, setSandboxOpen] = useState(false);

  // 反馈弹窗：null 是关着，字符串是预填内容。
  const [feedbackText, setFeedbackText] = useState<string | null>(null);

  // 「Claude Design 登录」弹窗是否开着。
  const [designOpen, setDesignOpen] = useState(false);

  // 「钩子」弹窗是否开着。
  const [hooksOpen, setHooksOpen] = useState(false);

  // 「Chrome」弹窗是否开着。
  const [chromeOpen, setChromeOpen] = useState(false);

  // 重载插件、转后台的结果写进转录；监听只挂一次，提示函数走 ref 拿最新语言。
  const noticeRef = useRef<(zh: string, count?: number) => void>(() => undefined);

  useEffect(() =>
  {
    const off = onHostMessage((data) =>
    {
      const message = data as {
        type?: string;
        payload?: {
          kind?: string; error?: string; errorCount?: number; moved?: boolean; otherTabs?: number; otherFailed?: number;
          toolUseId?: string;
        };
      };
      const payload = message?.type === 'context' ? message.payload : undefined;

      if (payload?.kind === 'reloadPlugins')
      {
        if (payload.error)
        {
          noticeRef.current(`重载插件失败：${payload.error}`);
        }
        else if ((payload.errorCount ?? 0) > 0)
        {
          noticeRef.current('插件已重载，其中 {n} 个加载出错，可在「诊断」面板里看详情。', payload.errorCount);
        }
        else
        {
          noticeRef.current('插件已重载。');
        }

        if ((payload.otherTabs ?? 0) > 0)
        {
          noticeRef.current((payload.otherFailed ?? 0) > 0
            ? `其他 ${payload.otherTabs} 个标签页也已重载，其中 ${payload.otherFailed} 个失败。`
            : '其他 {n} 个标签页也已一并重载。', payload.otherTabs);
        }
      }

      if (payload?.kind === 'background')
      {
        if (payload.error)
        {
          noticeRef.current(`转后台失败：${payload.error}`);
        }
        else
        {
          noticeRef.current(payload.moved ? '已转到后台运行。' : '没能转到后台：它可能刚好跑完了。');
        }

        // 没转成：让卡片上的按钮恢复可点
        if ((payload.error || !payload.moved) && payload.toolUseId)
        {
          const id = payload.toolUseId;
          setBackgroundFailed((previous) => ({ id, seq: (previous?.seq ?? 0) + 1 }));
        }
      }
    });

    return off;
  }, []);

  /** 直接打开原生弹窗的命令，整条输入恰好是它才截获。 */
  function dialogForCommand(command: string): (() => void) | null
  {
    switch (command)
    {
      case '/skills': return () => setSkillsOpen(true);
      case '/memory': return () => setMemoryOpen(true);
      case '/sandbox': return () => setSandboxOpen(true);
      case '/design-login': return () => setDesignOpen(true);
      case '/hooks': return () => setHooksOpen(true);
      case '/chrome': return () => setChromeOpen(true);
      case '/reload-plugins': return reloadPlugins;
      case '/background':
      case '/bg': return moveToBackground;
      default: return null;
    }
  }

  /** 重载插件，结果写进转录。 */
  function reloadPlugins()
  {
    postLocalNotice('正在重载插件…');
    sendReloadPlugins(`reload-${Date.now()}`);
  }

  // 工具卡片上的「转到后台」。按 id 串做 memo：流式文字每来一段都会换 blocks，
  // 但可转后台的那几个 id 不变时卡片不必重画。
  const [backgroundFailed, setBackgroundFailed] = useState<{ id: string; seq: number } | null>(null);
  const backgroundIds = state.busy ? backgroundableToolIds(state.blocks) : [];
  const backgroundKey = backgroundIds.join('|');

  const backgroundAction = useMemo<BackgroundAction>(() => ({
    ids: new Set(backgroundKey === '' ? [] : backgroundKey.split('|')),
    run: (toolUseId: string) => sendBackground(toolUseId, `bg-${toolUseId}`),
    failed: backgroundFailed,
  }), [backgroundKey, backgroundFailed]);

  /** 把还在跑的命令或子代理转到后台。 */
  function moveToBackground()
  {
    const ids = backgroundableToolIds(state.blocks);

    if (ids.length === 0)
    {
      postLocalNotice('现在没有正在跑、可以转后台的命令或子代理。');
      return;
    }

    for (const id of ids)
    {
      sendBackground(id, `bg-${id}`);
    }
  }

  // 「代理图」小弹窗是否开着。
  const [agentMapOpen, setAgentMapOpen] = useState(false);
  const agentMap = useMemo(() => buildAgentMap(state.blocks, state.busy), [state.blocks, state.busy]);

  function openAccount()
  {
    setAccountOpen(true);
    refreshUsage();
  }

  // 会话小弹层：null 是关着。
  const [sessionPicker, setSessionPicker] = useState<SessionPickerState | null>(null);

  const sessionPickerSeq = useRef(0);
  const sessionPickerRequestRef = useRef('');
  const sessionPickerTimeoutRef = useRef<number | null>(null);

  function disarmSessionPickerTimeout()
  {
    if (sessionPickerTimeoutRef.current !== null)
    {
      window.clearTimeout(sessionPickerTimeoutRef.current);
      sessionPickerTimeoutRef.current = null;
    }
  }

  /** 打开会话小弹层并重新取数；每次都取，宿主的接回校验认最近一次。 */
  function openSessionPicker(anchor: AnchorRect | null = null)
  {
    sessionPickerSeq.current += 1;
    const requestId = SESSION_PICKER_REQUEST_PREFIX + sessionPickerSeq.current;

    sessionPickerRequestRef.current = requestId;
    setSessionPicker({ loading: true, items: [], error: '', anchor });
    openPanel('sessions', requestId);

    disarmSessionPickerTimeout();
    sessionPickerTimeoutRef.current = window.setTimeout(() =>
    {
      if (sessionPickerRequestRef.current === requestId)
      {
        setSessionPicker((prev) => (prev === null || !prev.loading
          ? prev
          : { ...prev, loading: false, error: SESSION_PICKER_TIMEOUT_TEXT }));
      }
    }, PANEL_REQUEST_TIMEOUT_MS);
  }

  // 会话管理弹窗里「Web」页签的数据
  const [cloudSessions, setCloudSessions] = useState<CloudSessionsView>({ loading: false, items: [], error: '' });
  const cloudSeq = useRef(0);
  const cloudRequestRef = useRef('');
  const cloudTimeoutRef = useRef<number | null>(null);

  function disarmCloudTimeout()
  {
    if (cloudTimeoutRef.current !== null)
    {
      window.clearTimeout(cloudTimeoutRef.current);
      cloudTimeoutRef.current = null;
    }
  }

  /** 让宿主去读一次网页会话。 */
  function loadCloudSessions()
  {
    cloudSeq.current += 1;
    const requestId = CLOUD_SESSIONS_REQUEST_PREFIX + cloudSeq.current;

    cloudRequestRef.current = requestId;
    setCloudSessions((prev) => ({ ...prev, loading: true, error: '' }));
    openPanel('cloudSessions', requestId);

    disarmCloudTimeout();
    cloudTimeoutRef.current = window.setTimeout(() =>
    {
      if (cloudRequestRef.current === requestId)
      {
        setCloudSessions((prev) => (prev.loading
          ? { ...prev, loading: false, error: CLOUD_SESSIONS_TIMEOUT_TEXT }
          : prev));
      }
    }, CLOUD_SESSIONS_TIMEOUT_MS);
  }

  /** 弹层里的改名 / 存档：回包仍是一份新列表，沿用弹层的请求前缀。 */
  function runSessionPickerAction(actionId: string, values: string[])
  {
    sessionPickerSeq.current += 1;
    const requestId = SESSION_PICKER_REQUEST_PREFIX + sessionPickerSeq.current;

    sessionPickerRequestRef.current = requestId;
    setSessionPicker((prev) => (prev === null ? prev : { ...prev, error: '' }));
    runPanelAction('sessions', actionId, values, requestId);
  }

  function closeSessionPicker()
  {
    disarmSessionPickerTimeout();
    sessionPickerRequestRef.current = '';
    setSessionPicker(null);
  }

  // tab 条由宿主全权判定（未读与忙都是宿主标的），前端只负责画和派发。
  const [tabList, setTabList] = useState<TabListPayload>({ tabs: [], activeId: '' });

  // 真正**发给过宿主**的那两个值。
  const [sentModel, setSentModel] = useState('');
  const [sentEffort, setSentEffort] = useState('');

  // 终端转录里读到的实际型号；没回过话为空。
  const [terminalModel, setTerminalModel] = useState('');

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
    const zh = PANEL_TITLES[panelId] ?? FRONTEND_PANEL_TITLES[panelId] ?? DIALOG_MENU_TITLES[panelId];
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
  const [activeFile, setActiveFile] = useState<{ path: string; name: string } | null>(null);
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
          // 回放＝会话换了或页面重建：开关是会话级的，乐观值作废。
          setUltracodeOptimistic(null);
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

          // 会话小弹层自己的请求：不进面板状态，也不碰面板的超时表。
          if ((payload.requestId ?? '').startsWith(SESSION_PICKER_REQUEST_PREFIX))
          {
            if (payload.requestId === sessionPickerRequestRef.current)
            {
              disarmSessionPickerTimeout();
              // 动作被拒时回包不带列表，别把已有的列表清空
              setSessionPicker((prev) => (prev === null
                ? prev
                : {
                  ...prev,
                  loading: false,
                  items: (payload.items ?? []).length === 0 && (payload.error ?? '') !== '' ? prev.items : (payload.items ?? []),
                  error: payload.error ?? '',
                }));
            }
            break;
          }

          // 网页会话列表的请求：同样不进面板状态。
          if ((payload.requestId ?? '').startsWith(CLOUD_SESSIONS_REQUEST_PREFIX))
          {
            if (payload.requestId === cloudRequestRef.current)
            {
              disarmCloudTimeout();
              setCloudSessions({ loading: false, items: payload.items ?? [], error: payload.error ?? '' });
            }
            break;
          }

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
          const usage = message.payload as {
            usageWindows?: UsageWindow[]; usageRawText?: string; usageCheckedAtUnixMs?: number;
          };
          dispatch({
            type: 'usage',
            usageWindows: usage?.usageWindows ?? [],
            usageRawText: usage?.usageRawText ?? '',
            usageCheckedAtUnixMs: usage?.usageCheckedAtUnixMs ?? 0,
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
        case OUTBOUND.ActiveFile:
        {
          const file = message.payload as { path?: string; name?: string } | null;
          setActiveFile(file && file.path ? { path: file.path, name: file.name ?? file.path } : null);
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
    sendClientDiag(formatBoot(sampleBoot()) + ' ' + describePhases()
      + (longTaskSupported() ? '' : ' （不支持长任务统计）'));

    return unsubscribe;
  }, []);

  /** 在转录里写一条本地说明。 */
  noticeRef.current = postLocalNotice;

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
      case 'login':
        setLoginOpen(true);
        return;

      case 'logout':
        setLogoutOpen(true);
        return;

      case 'btw':
        setSideQuestion('');
        return;

      case 'sandbox':
        setSandboxOpen(true);
        return;

      case 'feedback':
        setFeedbackText('');
        return;

      case 'designLogin':
        setDesignOpen(true);
        return;

      case 'hooks':
        setHooksOpen(true);
        return;

      case 'chrome':
        setChromeOpen(true);
        return;

      case 'permissionRules':
        setRulesOpen(true);

        if (fallback.note !== '')
        {
          postLocalNotice(fallback.note);
        }

        return;

      case 'reloadPlugins':
        reloadPlugins();
        return;

      case 'background':
        moveToBackground();
        return;

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

    // /resume 走小弹层；整屏面板留给 /sessions 与弹层里的「全部会话…」。
    if (attachments.length === 0 && text.trim() === '/resume')
    {
      openSessionPicker();
      return;
    }

    // 有原生弹窗或动作的命令（技能、权限、记忆、沙箱、重载插件、转后台）
    const dialogAction = attachments.length === 0 ? dialogForCommand(text.trim()) : null;

    if (dialogAction !== null)
    {
      dialogAction();
      return;
    }

    if (panelId !== null && attachments.length === 0)
    {
      openPanelTracked(panelId);
      return;
    }

    // /btw 带的话直接拿去问，不进对话。
    const btw = attachments.length === 0 ? /^\/btw(?:\s+([\s\S]+))?$/.exec(text.trim()) : null;

    if (btw !== null)
    {
      setSideQuestion(btw[1] ?? '');
      return;
    }

    // /bug、/feedback 先进反馈弹窗确认，绝不直接发出去。
    const bug = attachments.length === 0 ? /^\/(?:bug|feedback)(?:\s+([\s\S]+))?$/.exec(text.trim()) : null;

    if (bug !== null)
    {
      setFeedbackText(bug[1] ?? '');
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

    dispatch({ type: 'userSent', text: shown, images: attachments.map((a) => a.preview) });
    sendPrompt(text, attachments.map((a) => ({ mediaType: a.mediaType, data: a.data })));
  }

  /** 从状态栏 `⋯` 菜单打开面板，走与 handleSend 截获路径相同的两步。 */
  function handleOpenPanel(panelId: string)
  {
    if (panelId === 'permissionRules')
    {
      setRulesOpen(true);
      return;
    }

    if (panelId === 'skills')
    {
      setSkillsOpen(true);
      return;
    }

    if (panelId === 'tools')
    {
      setToolsOpen(true);
      return;
    }

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

  function handleRemoteControlChange(on: boolean)
  {
    dispatch({ type: 'remoteRequested' });
    sendRemoteControl(on);
  }

  // 收到对这次点按的回话才收起「连接中」（在 reducer 里）；宿主最多等 30 秒，这里多留几秒兜底
  useEffect(() =>
  {
    if (!remotePending)
    {
      return;
    }

    const timer = window.setTimeout(() => dispatch({ type: 'remoteRequestExpired' }), 35000);
    return () => window.clearTimeout(timer);
  }, [remotePending]);

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

  // 命令菜单背后做事的一方：全部走原生界面，不往对话里发命令。
  const menuHost: MenuHost = {
    openPanel: openPanelTracked,
    runAction: (actionId) =>
    {
      if (actionId === 'newSession')
      {
        sendNewSession();
        return;
      }

      if (actionId === 'account')
      {
        openAccount();
        return;
      }

      if (actionId === 'login')
      {
        setLoginOpen(true);
        return;
      }

      if (actionId === 'logout')
      {
        setLogoutOpen(true);
        return;
      }

      if (actionId === 'btw')
      {
        setSideQuestion('');
        return;
      }

      if (actionId === 'bookmarks')
      {
        openBookmarks();
        return;
      }

      if (actionId === 'focusView')
      {
        toggleFocusView();
        return;
      }

      if (actionId === 'skills')
      {
        setSkillsOpen(true);
        return;
      }

      if (actionId === 'permissionRules')
      {
        setRulesOpen(true);
        return;
      }

      if (actionId === 'feedback')
      {
        setFeedbackText('');
        return;
      }

      const byAction: Record<string, string> = {
        memory: '/memory', sandbox: '/sandbox', reloadPlugins: '/reload-plugins', background: '/background',
        designLogin: '/design-login', hooks: '/hooks', chrome: '/chrome',
      };
      const command = byAction[actionId];
      const run = command ? dialogForCommand(command) : null;

      if (run !== null)
      {
        run();
        return;
      }

      if (actionId === 'sessions')
      {
        openSessionPicker();
        return;
      }

      if (actionId === 'export')
      {
        const fallback = fallbackFor('/export');

        if (fallback !== null)
        {
          runFallbackAction(fallback);
        }
      }
    },
    choices: (submenuId) =>
    {
      if (submenuId === 'model')
      {
        const options = buildModelOptions(
          state.session?.availableModels ?? [], state.session?.models ?? [], model);
        // 当前值可能是全名（claude-fable-5-2）而清单里是别名（fable），要对上才能打勾。
        const currentValue = matchModelValue(
          options.map((option) => option.value), model, state.session?.models ?? []);
        const modelChoices = options.map((option) => ({
          value: option.value,
          label: translate(lang, option.label),
          description: [option.value, translate(lang, option.hint)].filter((part) => part !== '').join(' — '),
          current: option.value === currentValue,
        }));
        return modelChoices;
      }

      // 与滑轨同一份：当前模型报的档位；不支持调强度时子菜单为空
      const modelLevels = effortLevelsForModel(state.session?.models ?? [], model, state.session?.effortLevels ?? []);
      const effortLevels = modelLevels === null ? [] : sliderEffortLevels(modelLevels, ultracodeVisible, effort);
      const effortOptions = modelLevels === null ? [] : buildEffortOptions(effortLevels);
      const effortChoices = effortOptions.map((option) => ({
        value: option.value,
        label: translate(lang, option.label),
        description: translate(lang, option.description),
        current: option.value === effort,
      }));
      return effortChoices;
    },
    pick: (submenuId, value) =>
    {
      if (submenuId === 'model')
      {
        handleModelChange(value);
        return;
      }

      handleEffortChange(value);
    },
    ultracode: {
      visible: ultracodeVisible,
      on: ultracodeOn,
      toggle: () => handleUltracodeChange(!ultracodeOn),
    },
  };

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
        onOpenHistory={(anchor) => openSessionPicker(anchor)}
        onOpenManager={() => openPanelTracked('sessions')}
      />

      {/* 窗口顶部：额度用量。放最显眼的位置——它是订阅制下唯一有意义的用量指标，
          而轮次结束行里那个金额是按 API 标价折算的等价成本，并不据此扣费。 */}
      <UsageBar
        windows={state.session?.usageWindows ?? []}
        checkedAtMs={state.session?.usageCheckedAtUnixMs ?? 0}
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
          终端**一开始就挂**，但首屏默认在对话（见 panelState 的 initialPanel）。
          藏着时挂上并不会起进程：TUI 那一路要等拿到真实尺寸才 sendTerminalStart，
          而藏着的容器量不出尺寸（见 TerminalPanel 的启动 effect 守卫）。 */}
      <TerminalPanel
        selected={{ model: sentModel, effort: sentEffort, permissionMode, remoteControl }}
        knownModels={state.session?.availableModels ?? []}
        knownEfforts={state.session?.effortLevels ?? []}
        appearance={appearance}
        visible={terminalOpen}
        handleRef={terminalHandleRef}
        onClose={handleToggleTerminal}
        onModelSeen={setTerminalModel}
        onModelFollowed={handleModelChange}
      />
      <div className={terminalOpen ? 'main-row is-hidden' : 'main-row'}>
        <BackgroundContext.Provider value={backgroundAction}>
          <Transcript
            blocks={state.blocks}
            busy={state.busy}
            hidden={terminalOpen}
            onRunCommand={(text) => handleSend(text, [])}
            focusView={focusView}
            bookmarkedIds={bookmarkedIds}
            onToggleBookmark={sessionId === '' ? undefined : handleToggleBookmark}
          />
        </BackgroundContext.Provider>
        {sideQuestion !== null && (
          <SideQuestionDialog
            thread={sideThread}
            onThreadChange={setSideThread}
            initialQuestion={sideQuestion.text}
            askSeq={sideQuestion.seq}
            onClose={() => setSideQuestion(null)}
          />
        )}
        {bookmarksOpen && (
          <BookmarksPanel
            bookmarks={bookmarks}
            onReveal={revealBookmark}
            onRemove={removeBookmark}
            onClose={() => setBookmarksOpen(false)}
          />
        )}
      </div>
      <StatusBar
        leading={(
          <ModelPicker
            session={state.session}
            selectedModel={model}
            onModelChange={handleModelChange}
            reportedModels={state.session?.models ?? []}
            availableModels={state.session?.availableModels ?? []}
            terminalModel={terminalOpen ? terminalModel : ''}
            effort={effort}
            onEffortChange={handleEffortChange}
            effortLevels={effortLevelsForModel(state.session?.models ?? [], model, state.session?.effortLevels ?? [])}
            ultracode={{ visible: ultracodeVisible, on: ultracodeOn }}
            onUltracodeChange={handleUltracodeChange}
          />
        )}
        contextRing={terminalOpen ? null : (
          <ContextRing
            remaining={remainingRatio(state.contextMeter)}
            autoCompact={state.session?.autoCompactEnabled ?? true}
            busy={state.busy}
            onCompact={() =>
            {
              handleSend('/compact', []);
              dispatch({ type: 'compactRequested' });
            }}
          />
        )}
        permissionMode={permissionMode}
        onPermissionModeChange={handleModeChange}
        ultracode={{ visible: ultracodeVisible, on: ultracodeOn }}
        onUltracodeChange={handleUltracodeChange}
        promptCache={state.promptCache}
        remoteControl={remoteControl}
        remotePending={remotePending}
        remoteState={state.remoteControl}
        onRemoteControlChange={handleRemoteControlChange}
        onOpenSettings={() => setSettingsOpen(true)}
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
        slashCommands={state.slashCommands}
        commandInfos={state.session?.slashCommandInfos}
        menuHost={menuHost}
        unavailableCommands={unavailableForDisplay}
        hidden={terminalOpen}
        onSend={handleSend}
        injection={injection}
        fileResults={fileResults}
        droppedFiles={droppedFiles}
        activeFile={activeFile}
      />
      {/* 输入框底部：品牌 / 型号 + 会话信息 + 进 status 面板的入口。
          品牌与型号从上面那条状态栏挪下来——那一行在英文下放不下会换行、高度乱跳。
          长列表留给面板，挤在这一行里只会把关键信息推出可视区。 */}
      <SessionInfoBar
        session={state.session}
        onOpenStatus={() => openPanelTracked('status')}
        onOpenMcp={() => handleOpenPanel('mcp')}
        agents={{ total: agentMap.agents.length, running: agentMap.running }}
        onOpenAgentMap={() => setAgentMapOpen(true)}
      />
      {/* 终端**不走覆盖层**。覆盖层是 position:absolute; inset:0，会把额度栏、状态栏、
          会话信息栏连同「⋯」菜单一起盖掉；而终端是要长时间待着的视图，
          那三条栏和菜单在终端里同样有用（额度、权限模式、模型、外观、语言）。
          所以终端占「转录」那一格，其余面板照旧用覆盖层。 */}
      {accountOpen && (
        <AccountDialog
          session={state.session}
          onRefresh={() => refreshUsage()}
          onClose={() => setAccountOpen(false)}
        />
      )}
      {loginOpen && <LoginDialog onClose={() => setLoginOpen(false)} />}
      {skillsOpen && <SkillsDialog onClose={() => setSkillsOpen(false)} />}
      {toolsOpen && <ToolsDialog tools={state.session?.tools ?? []} onClose={() => setToolsOpen(false)} />}
      {memoryOpen && (
        <MemoryDialog
          onOpenFullPanel={() =>
          {
            setMemoryOpen(false);
            openPanelTracked('memory');
          }}
          onClose={() => setMemoryOpen(false)}
        />
      )}
      {sandboxOpen && <SandboxDialog onClose={() => setSandboxOpen(false)} />}
      {feedbackText !== null && <FeedbackDialog initialText={feedbackText} onClose={() => setFeedbackText(null)} />}
      {designOpen && <DesignLoginDialog onClose={() => setDesignOpen(false)} />}
      {hooksOpen && <HooksDialog onClose={() => setHooksOpen(false)} />}
      {chromeOpen && <ChromeDialog onClose={() => setChromeOpen(false)} />}
      {rulesOpen && (
        <PermissionRulesDialog
          onOpenSettingsFiles={() =>
          {
            setRulesOpen(false);
            openPanelTracked('settingsFiles');
          }}
          onClose={() => setRulesOpen(false)}
        />
      )}
      {logoutOpen && (
        <LogoutDialog
          email={state.session?.accountEmail ?? ''}
          onLoggedOut={() => dispatch({ type: 'accountCleared' })}
          onLogin={() =>
          {
            setLogoutOpen(false);
            setLoginOpen(true);
          }}
          onClose={() => setLogoutOpen(false)}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          panelMenu={PANEL_MENU_IDS.map((id) => ({ id, label: panelTitle(id) }))}
          onOpenPanel={handleOpenPanel}
          terminalOpen={terminalOpen}
          onToggleTerminal={handleToggleTerminal}
          lang={lang}
          onLangChange={handleLangChange}
          brand={brand}
          onBrandChange={handleBrandChange}
          appearance={appearance}
          onAppearanceChange={handleAppearanceChange}
          onLogin={() => setLoginOpen(true)}
          onLogout={() => setLogoutOpen(true)}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {agentMapOpen && (
        <AgentMapDialog
          map={agentMap}
          modelName={friendlyModelName(state.session?.model ?? '')}
          contextTokens={state.promptCache?.recacheTokens ?? 0}
          busy={state.busy}
          onClose={() => setAgentMapOpen(false)}
        />
      )}
      {sessionPicker !== null && (
        <SessionPicker
          items={sessionPicker.items}
          loading={sessionPicker.loading}
          error={translate(lang, sessionPicker.error)}
          currentSessionId={state.session?.sessionId ?? ''}
          anchor={sessionPicker.anchor}
          onPick={(sessionId) => {
            closeSessionPicker();

            // 终端或整屏面板开着时先回到对话，不然看不到接回的提示。
            if (panel !== null)
            {
              disarmPanelTimeout();
              pendingPanelRequestIdRef.current = '';
              dispatchPanel({ type: 'close' });
            }

            sendResumeSession(sessionId, false);
          }}
          onShowAll={() => {
            closeSessionPicker();
            openPanelTracked('sessions');
          }}
          onClose={closeSessionPicker}
          onAction={runSessionPickerAction}
        />
      )}
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
            : panel.panelId === 'sessions'
              ? () => sessionManagerRef.current?.handleEscape() ?? false
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
            <SessionManager
              ref={sessionManagerRef}
              items={panel.items}
              groups={panel.groups}
              currentSessionId={state.session?.sessionId ?? ''}
              error={panel.error}
              loading={panel.loading}
              onAction={(actionId, values) => runPanelActionTracked(panel.panelId, actionId, values)}
              cloud={{ ...cloudSessions, error: translate(lang, cloudSessions.error) }}
              onLoadCloud={loadCloudSessions}
              onOpenWeb={(url) => sendOpenWebLink(url)}
              onTeleport={(value) => {
                // 拉回本机只能在终端里进行：切到终端视图，宿主让终端带 --teleport 重起
                disarmPanelTimeout();
                openPanelTracked('terminal');
                sendTeleportSession(value);
              }}
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
