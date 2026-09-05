import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { StatusPanel } from './StatusPanel';
import type { AgentSessionInfo } from '../types';

function session(overrides: Partial<AgentSessionInfo> = {}): AgentSessionInfo {
  return {
    sessionId: 's-42', model: 'Opus 5 (1M context)', cwd: 'F:\\proj',
    permissionMode: 'acceptEdits', cliVersion: '2.1.233',
    tools: ['Bash', 'Edit', 'Read'],
    slashCommands: [], terminalSlashCommands: [],
    slashCommandInfos: [],
    skills: ['superpowers:brainstorming'],
    subAgents: ['general-purpose'],
    mcpServers: [{ name: 'context7', status: 'connected' }] as AgentSessionInfo['mcpServers'],
    capabilities: ['interrupt_receipt_v1'],
    models: [], subscriptionType: 'Claude Max', effortLevel: 'high',
    availableModels: [], effortLevels: [],
    usageWindows: [
      { label: 'Current session', percentUsed: 11, resetsAtText: 'Aug 18, 5:59pm', resetsAtUnix: 0, model: '' },
    ],
    usageRawText: 'Last 24h · 3322 requests · 4 sessions',
    ...overrides,
  };
}

describe('status 面板', () => {
  it('会话未启动时说清楚', () => {
    render(<StatusPanel session={null} />);
    expect(screen.getByText(/会话尚未启动/)).toBeTruthy();
  });

  it('显示单值字段', () => {
    render(<StatusPanel session={session()} />);

    expect(screen.getByText('s-42')).toBeTruthy();
    expect(screen.getByText('Opus 5 (1M context)')).toBeTruthy();
    expect(screen.getByText('2.1.233')).toBeTruthy();
    expect(screen.getByText('Claude Max')).toBeTruthy();
  });

  it('缺失的单值显示未提供而不是留白', () => {
    // 留白分不清是「没有这个值」还是「渲染坏了」。
    render(<StatusPanel session={session({ subscriptionType: '' })} />);

    expect(screen.getAllByText('未提供').length).toBeGreaterThan(0);
  });

  it('额度窗口在面板里也列出来，排版与顶部用量栏一致', () => {
    // 与顶部那条栏共用 usageFormat：同一个窗口在两处必须是同一种说法，
    // 一处写「Current session」另一处写「当前会话」会让人以为是两个不同的窗口。
    render(<StatusPanel session={session()} />);

    expect(screen.getByText('当前会话')).toBeTruthy();
    expect(screen.getByText('11%')).toBeTruthy();
    // 这个窗口没有绝对时刻（resetsAtUnix 为 0），只能给 CLI 原文，不编倒计时。
    expect(screen.getByText('重置于 Aug 18, 5:59pm')).toBeTruthy();
  });

  it('有绝对时刻的额度窗口在面板里显示倒计时', () => {
    // 「重置时间要有倒计时」这条要求在两处都成立，不能只做顶部那条栏。
    const soon = Math.floor(Date.now() / 1000) + 125;
    render(<StatusPanel session={session({ usageWindows: [
      { label: 'Current week (all models)', percentUsed: 35,
        resetsAtText: 'Aug 21, 10:59am', resetsAtUnix: soon, model: '' },
    ] })} />);

    expect(screen.getByText(/^余 2 分/)).toBeTruthy();
  });

  it('长列表默认折叠，但数量写在标题上', () => {
    // 不展开也要知道有没有、有多少——这正是折叠不该藏掉的信息。
    render(<StatusPanel session={session()} />);

    const toolsToggle = screen.getByRole('button', { name: /工具/ });
    expect(toolsToggle.getAttribute('aria-expanded')).toBe('false');
    expect(within(toolsToggle).getByText('3')).toBeTruthy();

    // 折叠状态下列表项不在 DOM 里
    expect(screen.queryByText('Bash')).toBeNull();
  });

  it('展开后列出全部条目', () => {
    render(<StatusPanel session={session()} />);

    fireEvent.click(screen.getByRole('button', { name: /工具/ }));

    expect(screen.getByText('Bash')).toBeTruthy();
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('Read')).toBeTruthy();
  });

  it('空列表展开后说无而不是一片空白', () => {
    render(<StatusPanel session={session({ skills: [] })} />);

    fireEvent.click(screen.getByRole('button', { name: /技能/ }));

    expect(screen.getByText('无')).toBeTruthy();
  });

  it('MCP 服务器带上状态', () => {
    render(<StatusPanel session={session()} />);

    fireEvent.click(screen.getByRole('button', { name: /MCP 服务器/ }));

    expect(screen.getByText('context7 · connected')).toBeTruthy();
  });

  it('用量原文可展开且保留缩进', () => {
    // 那段输出靠缩进表达层级，过 markdown 会把行首空格吃掉、层级压平。
    render(<StatusPanel session={session()} />);

    fireEvent.click(screen.getByRole('button', { name: /用量明细/ }));

    const raw = screen.getByText(/3322 requests/);
    expect(raw.tagName).toBe('PRE');
  });

  it('没有用量原文时不渲染那一节', () => {
    render(<StatusPanel session={session({ usageRawText: '' })} />);

    expect(screen.queryByRole('button', { name: /用量明细/ })).toBeNull();
  });
});
