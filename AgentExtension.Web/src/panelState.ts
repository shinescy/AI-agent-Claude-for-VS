// 面板状态。

/** 面板里的一条条目（插件/MCP 服务器/技能等）。 */
export interface PanelItemView {
  id: string;
  title: string;
  subtitle: string;
  enabled: boolean;
  detail: string;
  fields: Record<string, string>;
  /** 是否属于当前项目，宿主按工作目录比对后标出（C# 侧 MarkCurrentProject）。 */
  currentProject: boolean;
  /** 机读的安装作用域（user / project / local / managed），不适用的面板为空串。 */
  scope?: string;
}

/** 宿主一次取数/动作回包的原始形状（对应 C# 侧 PanelResult）。 */
export interface PanelResultPayload {
  panelId: string;
  items: PanelItemView[];
  error: string;
  rawText: string;
  /** 宿主的显式意图标记（对应 C# 侧 PanelResult.ShowsRawText）：只有 doctor 面板、 */
  showsRawText?: boolean;
  restartHint: boolean;
  requestId?: string;
}

/** 单个面板的整体视图状态。 */
export interface PanelView {
  panelId: string;
  items: PanelItemView[];
  error: string;
  rawText: string;
  /** 见 PanelResultPayload.showsRawText。 */
  showsRawText: boolean;
  restartHint: boolean;
  loading: boolean;
  /** 当前正在等待回包的 requestId。 */
  pendingRequestId: string;
}

/** 首屏停在哪一格：终端。 */
export const initialPanel: PanelView | null = {
  panelId: 'terminal',
  items: [],
  error: '',
  rawText: '',
  showsRawText: false,
  restartHint: false,
  loading: false,
  pendingRequestId: '',
};

/** 面板状态的动作类型。 */
export type PanelStateAction =
  | { type: 'open'; panelId: string; requestId?: string }
  | { type: 'data'; payload: PanelResultPayload }
  | { type: 'close' }
  | { type: 'dismissRestart' }
  | { type: 'loading'; requestId?: string }
  // 请求发出 30 秒仍未收到回包：不能让 loading 无限转下去，转入错误态并允许重试。
  | { type: 'timeout'; requestId?: string };

export function panelReducer(state: PanelView | null, action: PanelStateAction): PanelView | null {
  switch (action.type) {
    case 'open':
      return {
        panelId: action.panelId,
        items: [], error: '', rawText: '', showsRawText: false, restartHint: false, loading: true,
        pendingRequestId: action.requestId ?? '',
      };

    case 'data': {
      if (!state) {
        return null;
      }

      if (action.payload.panelId !== state.panelId) {
        return state;
      }

      const incomingRequestId = action.payload.requestId ?? '';
      if (incomingRequestId !== '' && state.pendingRequestId !== '' && incomingRequestId !== state.pendingRequestId) {
        return state;
      }

      return {
        panelId: action.payload.panelId,
        error: action.payload.error,
        rawText: action.payload.rawText,
        showsRawText: action.payload.showsRawText ?? false,
        restartHint: action.payload.restartHint,
        pendingRequestId: state.pendingRequestId,
        items: action.payload.error && action.payload.items.length === 0
          ? state.items
          : action.payload.items,
        loading: false,
      };
    }

    case 'loading':
      // error 必须一并清掉：不清的话「执行中…」会和上一次失败的红色 alert 同屏，
      return state
        ? {
          ...state,
          loading: true,
          error: '',
          rawText: '',
          showsRawText: false,
          pendingRequestId: action.requestId ?? state.pendingRequestId,
        }
        : state;

    case 'timeout': {
      // 已经不在加载中（数据已经回来过）就没什么好超时的，兜底防止误触发覆盖正常状态。
      if (!state || !state.loading) {
        return state;
      }

      const incomingRequestId = action.requestId ?? '';
      if (incomingRequestId !== '' && state.pendingRequestId !== '' && incomingRequestId !== state.pendingRequestId) {
        return state;
      }

      // 措辞不能是一句轻飘飘的「请重试」：走到这里说明等待已经超过宿主的最坏耗时
      return {
        ...state,
        loading: false,
        error: '等待宿主回应超时。命令可能已经执行完成，请先点「刷新」查看当前状态，不要直接重试——安装、更新、移除这类操作重复执行会再跑一遍。',
      };
    }

    case 'close':
      return null;

    case 'dismissRestart':
      return state ? { ...state, restartHint: false } : null;

    default:
      return state;
  }
}
