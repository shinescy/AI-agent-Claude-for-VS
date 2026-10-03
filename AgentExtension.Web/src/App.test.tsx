// F1：面板请求的超时看门狗不能被过期回包拆掉。
//
// 计时器只有一个（App.tsx 里的 panelTimeoutRef），永远该属于「最新那次请求」。
// 此前收到任何 panelData 就无条件拆表，不比对 requestId；可达路径：
// 打开面板 P(r1，卡住) → Esc 关闭 → 重新打开 P(r2，挂表) → r1 的迟到回包到达
// → 拆掉的是 r2 的表 → r2 若同样不回，loading 永久为真且再无超时，
// 而此时刷新按钮因 disabled={loading} 被禁用，只剩关闭一条路。
//
// 通过真实挂载 App（不 mock ./bridge）、借它在没有宿主时暴露的开发期注入入口
// window.__agentDevHost 灌数据，驱动出这条路径。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from './App';
import { LANG_STORAGE_KEY } from './i18n';

// 语言默认跟随环境，而 jsdom 的 navigator.language 是 en-US，界面会渲染成英文。
// 下面的断言写的是中文文案，必须先把语言固定住——否则这些测试测的是运行环境，不是代码。
beforeEach(() => {
  window.localStorage.setItem(LANG_STORAGE_KEY, 'zh');
});

afterEach(() => {
  window.localStorage.removeItem(LANG_STORAGE_KEY);
});

type DevHost = { emit(data: unknown): void };

function getDevHost(): DevHost {
  const host = (window as unknown as { __agentDevHost?: DevHost }).__agentDevHost;
  if (!host) {
    throw new Error('未找到开发期注入入口，__agentDevHost 应在没有 window.chrome.webview 时由 bridge.ts 自动挂载');
  }
  return host;
}

/** 打开「⋯」菜单并点「插件」，与用户在状态栏的真实操作路径一致。 */
function openPluginPanelViaMenu() {
  fireEvent.click(screen.getByRole('button', { name: '⋯' }));
  fireEvent.click(screen.getByRole('button', { name: '插件' }));
}

function panelDataMessage(overrides: Partial<{
  panelId: string; items: unknown[]; error: string; rawText: string; restartHint: boolean; requestId: string;
}> = {}) {
  return {
    type: 'panelData',
    payload: {
      panelId: 'plugin', items: [], error: '', rawText: '', restartHint: false,
      ...overrides,
    },
  };
}

function sessionStartedMessage(overrides: Record<string, unknown> = {}) {
  return {
    type: 'event',
    payload: {
      kind: 'SessionStarted',
      content: '',
      toolCall: null, usageData: null, turnResult: null, rateLimitData: null,
      hookName: '', hookPhase: '',
      sessionInfo: {
        sessionId: 's1', model: 'Opus 5', cwd: 'F:/proj',
        permissionMode: 'acceptEdits', cliVersion: '2.1.233',
        tools: [], slashCommands: [], terminalSlashCommands: [],
        skills: [], subAgents: [], mcpServers: [], capabilities: [], models: [],
        subscriptionType: 'Claude Max', effortLevel: 'high',
        availableModels: [], effortLevels: [],
        usageWindows: [], usageRawText: '',
        ...overrides,
      },
    },
  };
}

describe('App：状态栏「⋯」菜单', () => {
  it('凡是有原生面板的都走面板，菜单里不再有走老子命令路径的重复入口', () => {
    // 此前菜单里并排放着两个长得都像插件的按钮：「插件」开面板，「已装插件」走
    // sendRunCommand 往转录里倒一段文本、**不弹窗**。点中下面那个就以为面板坏了。
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '⋯' }));

    // 四个面板各有且只有一个入口。
    for (const label of ['插件', 'MCP 服务器', '后台代理', '健康检查'])
    {
      expect(screen.getAllByRole('button', { name: label })).toHaveLength(1);
    }

    // 老的子命令入口里，凡是已经有面板的都不该再出现。
    for (const label of ['已装插件', 'MCP 服务器状态', '安装健康检查'])
    {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }

    // 没有面板可走的仍然保留，并标明需要终端。
    expect(screen.getByRole('button', { name: /登录 \/ 认证/ })).toBeTruthy();
  });

  it('点菜单里的面板项会真的打开覆盖层', () => {
    // 「点了没弹窗」是用户报的原始症状，这里直接盯住弹窗本身。
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '⋯' }));
    fireEvent.click(screen.getByRole('button', { name: 'MCP 服务器' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('MCP 服务器');
  });
});

describe('App：额度用量条', () => {
  it('还没探到时说获取中，而不是留一条空栏', () => {
    // 空栏会被当成渲染坏了；「获取中」会自己变好。
    render(<App />);

    expect(screen.getByText(/额度用量获取中/)).toBeTruthy();
  });

  it('探到之后显示各窗口，含模型专属那一行', () => {
    // 用户明确要求「特殊模型单独计算的也要对应显示」，这里盯住那一行真的出现。
    render(<App />);
    const devHost = getDevHost();

    act(() => {
      devHost.emit(sessionStartedMessage({
        usageWindows: [
          { label: 'Current session', percentUsed: 21, resetsAtText: 'Aug 18, 5:59pm', resetsAtUnix: 0, model: '' },
          { label: 'Current week (all models)', percentUsed: 37, resetsAtText: 'Aug 21, 10:59am', resetsAtUnix: 0, model: '' },
          { label: 'Current week (Fable)', percentUsed: 1, resetsAtText: 'Aug 21, 10:59am', resetsAtUnix: 0, model: 'Fable' },
        ],
      }));
    });

    expect(screen.getByText('当前会话')).toBeTruthy();
    expect(screen.getByText('21%')).toBeTruthy();
    expect(screen.getByText('本周（Fable）')).toBeTruthy();
    expect(screen.queryByText(/额度用量获取中/)).toBeNull();
  });

  it('会话未启动时会话信息条不给详情入口，只说明状态', () => {
    // 那时候 status 面板里除了「会话尚未启动」什么都没有，给个入口只是让人白点一下。
    render(<App />);

    expect(screen.getByText('会话尚未启动')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /详情/ })).toBeNull();
  });

  it('会话起来后点详情真的开 status 面板且不卡在加载态', () => {
    // status 面板没有宿主侧对应物，打开它不该发宿主消息、也不该等一个永远不来的回包。
    render(<App />);
    const devHost = getDevHost();

    act(() => {
      devHost.emit(sessionStartedMessage());
    });

    fireEvent.click(screen.getByRole('button', { name: /详情/ }));

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('状态');
    expect(screen.queryByText(/执行中/)).toBeNull();
    // 面板里应能看到会话字段，证明它读的是 state.session 而不是等宿主取数。
    expect(screen.getByText('s1')).toBeTruthy();
  });
});

describe('App：面板超时看门狗（F1）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as { chrome?: unknown }).chrome;
    delete (window as unknown as { __agentDevHost?: unknown }).__agentDevHost;
  });

  it('打开面板卡住 → Esc 关闭 → 重新打开：旧请求的迟到回包不会拆掉新请求的表，新请求仍会正常超时', () => {
    render(<App />);
    const devHost = getDevHost();

    // 打开面板 P(r1)：request id 按自增序号分配，第一次是 '1'。
    openPluginPanelViaMenu();
    expect(screen.getByText('执行中…')).toBeTruthy();

    // r1 卡住，用户按 Esc 关闭。
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    // 重新打开面板，这次是 P(r2)，request id 为 '2'，挂上新的一张表。
    openPluginPanelViaMenu();
    expect(screen.getByText('执行中…')).toBeTruthy();

    // r1 的迟到回包这时候才到达。修复前：无条件拆表，拆掉的是 r2 的表。
    act(() => {
      devHost.emit(panelDataMessage({ requestId: '1', items: [] }));
    });

    // r2 仍在等待中（reducer 按 requestId 丢弃了 r1 的数据，不受本测试关注的 App 层 bug 影响）。
    expect(screen.getByText('执行中…')).toBeTruthy();

    // 等到超时上限（180 秒，取值推导见 App.tsx），r2 应该正常超时——
    // 如果 r1 的回包错误地拆掉了 r2 的表，这里就不会有任何超时触发，
    // loading 会卡死，界面上既看不到超时错误也看不到数据。
    act(() => {
      vi.advanceTimersByTime(180000);
    });

    expect(screen.getByText(/超时/)).toBeTruthy();
    expect(screen.queryByText('执行中…')).toBeNull();
  });

  it('对照组：requestId 匹配的正常回包仍然会正确拆表，不会遗留一个永不消失的超时', () => {
    render(<App />);
    const devHost = getDevHost();

    openPluginPanelViaMenu();

    // 与挂着的表 requestId 一致的正常回包。
    act(() => {
      devHost.emit(panelDataMessage({ requestId: '1', items: [] }));
    });

    expect(screen.queryByText('执行中…')).toBeNull();
    expect(screen.queryByText(/超时/)).toBeNull();

    // 表已经被正常拆掉，30 秒后不应该再冒出一个迟到的超时态。
    act(() => {
      vi.advanceTimersByTime(180000);
    });

    expect(screen.queryByText(/超时/)).toBeNull();
  });
});
