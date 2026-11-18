import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionInfoBar, shortenPath } from './SessionInfoBar';
import type { AgentSessionInfo } from '../types';

interface Overrides {
  session?: AgentSessionInfo | null;
}

/** 除了被测那一项，其余 props 都给一份能用的默认值。 */
function setup(overrides: Overrides = {}) {
  const onOpenStatus = vi.fn();

  render(
    <SessionInfoBar
      session={overrides.session === undefined ? session() : overrides.session}
      onOpenStatus={onOpenStatus}
    />);

  return { onOpenStatus };
}

function session(overrides: Partial<AgentSessionInfo> = {}): AgentSessionInfo {
  return {
    sessionId: 's-1', model: 'Opus 5 (1M context)', cwd: 'F:\\WrokSpace\\NET\\AgentExtension',
    permissionMode: 'acceptEdits', cliVersion: '2.1.233',
    tools: [], slashCommands: [], terminalSlashCommands: [],
    slashCommandInfos: [],
    skills: [], subAgents: [], mcpServers: [], capabilities: [], models: [],
    subscriptionType: 'Claude Max', effortLevel: 'high',
    availableModels: [], effortLevels: [], usageWindows: [], usageRawText: '',
    ...overrides,
  };
}

describe('路径压缩', () => {
  it('短路径原样保留', () => {
    expect(shortenPath('F:\\a\\b')).toBe('F:\\a\\b');
  });

  it('长路径从尾部保留有用的那几段', () => {
    // 从头截断会得到一串对谁都一样的前缀（F:\WrokSpace\NET\…），毫无信息量。
    const shortened = shortenPath('F:\\WrokSpace\\NET\\VSExtensions\\AgentExtension\\AgentExtension', 30);

    expect(shortened.length).toBeLessThanOrEqual(31);
    expect(shortened.endsWith('AgentExtension')).toBe(true);
    expect(shortened.startsWith('…')).toBe(true);
  });

  it('单段就超长时硬截尾部而不是返回空', () => {
    const shortened = shortenPath('X'.repeat(80), 20);

    expect(shortened.length).toBeLessThanOrEqual(20);
    expect(shortened.startsWith('…')).toBe(true);
  });

  it('posix 路径也认', () => {
    const shortened = shortenPath('/home/user/very/deep/project/src', 20);

    expect(shortened.endsWith('src')).toBe(true);
  });
});

describe('会话信息条', () => {
  it('会话未启动时说清楚，而不是留一条空栏', () => {
    setup({ session: null });

    expect(screen.getByText('会话尚未启动')).toBeTruthy();
  });

  it('会话未启动时没有「状态」，品牌下拉也不在这一栏了', () => {
    // 品牌收进了「设置」，型号挪到了上面的状态栏；这一栏只剩会话事实。
    setup({ session: null });

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: /^状态/ })).toBeNull();
  });

  it('MCP 有没连上的就写已连接几个，悬停列出每个的状态', () => {
    const onOpenMcp = vi.fn();
    render(
      <SessionInfoBar
        session={session({ mcpServers: [
          { name: 'github', status: 'connected' }, { name: 'claude.ai Gmail', status: 'needs-auth' },
        ] })}
        onOpenStatus={() => undefined}
        onOpenMcp={onOpenMcp}
      />);

    const button = screen.getByRole('button', { name: 'MCP 1/2 已连接' });
    expect(button.getAttribute('title')).toContain('claude.ai Gmail · needs-auth');

    fireEvent.click(button);
    expect(onOpenMcp).toHaveBeenCalledTimes(1);
  });

  it('显示目录、MCP 数量与 CLI 版本', () => {
    setup({ session: session({ mcpServers: [
      { name: 'a', status: '' }, { name: 'b', status: '' },
    ] as AgentSessionInfo['mcpServers'] }) });

    expect(screen.getByText('MCP 2 个')).toBeTruthy();
    expect(screen.getByText('CLI 2.1.233')).toBeTruthy();
  });

  it('完整路径放进 title，界面上显示压缩后的', () => {
    // 压缩是为了排版，但完整值不能丢——鼠标悬停要能看到。
    setup();

    const item = screen.getByTitle('F:\\WrokSpace\\NET\\AgentExtension');
    expect(item).toBeTruthy();
  });

  it('点「状态」打开 status 面板', () => {
    const { onOpenStatus } = setup();

    fireEvent.click(screen.getByRole('button', { name: /^状态/ }));

    expect(onOpenStatus).toHaveBeenCalledTimes(1);
  });
});
