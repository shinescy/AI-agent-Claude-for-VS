import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionInfoBar, shortenPath } from './SessionInfoBar';
import { DEFAULT_BRAND, DEFAULT_MODEL } from '../models';
import type { AgentSessionInfo } from '../types';

interface Overrides {
  session?: AgentSessionInfo | null;
  selectedModel?: string;
  availableModels?: string[];
  busy?: boolean;
}

/** 除了被测那一项，其余 props 都给一份能用的默认值。 */
function setup(overrides: Overrides = {}) {
  const onOpenStatus = vi.fn();
  const onBrandChange = vi.fn();
  const onModelChange = vi.fn();

  render(
    <SessionInfoBar
      session={overrides.session === undefined ? session() : overrides.session}
      brand={DEFAULT_BRAND}
      onBrandChange={onBrandChange}
      selectedModel={overrides.selectedModel ?? DEFAULT_MODEL}
      onModelChange={onModelChange}
      reportedModels={[]}
      availableModels={overrides.availableModels ?? []}
      busy={overrides.busy ?? false}
      onOpenStatus={onOpenStatus}
    />);

  return { onOpenStatus, onBrandChange, onModelChange };
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

  it('会话未启动时品牌与型号照常可选', () => {
    // 型号是 CLI 的启动参数，会话起来之前就该能先选好；
    // 这两个控件跟着会话状态一起消失的话，用户会以为得先发一句话才能换模型。
    setup({ session: null });

    expect(screen.getByRole('combobox')).toBeTruthy();
    expect(screen.getByRole('button', { name: /型号/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /详情/ })).toBeNull();
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

  it('型号选项框显示 CLI 探到的具体模型名', () => {
    // 「品牌/型号从上面那条栏挪到这里」这件事本身要有断言看住，
    // 否则将来谁把它挪回去、或漏掉一处，界面上只是少一个控件，没人会报错。
    setup({ availableModels: ['opus', 'sonnet'], selectedModel: 'opus' });

    expect(screen.getByText('opus')).toBeTruthy();
  });

  it('实际在跑的模型放进 title', () => {
    // 选「默认」且 /model 探测失败时，标签上只有「默认」三个字，
    // 到底跑的是哪个模型只能从这里看到。
    setup();

    expect(screen.getByTitle('CLI 实际使用：Opus 5 (1M context)')).toBeTruthy();
  });

  it('生成中禁用品牌与型号', () => {
    // 换型号要重启 CLI 进程，中途重启会打断正在跑的这一轮。
    setup({ busy: true });

    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /型号/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('选中型号后上报请求值', () => {
    const { onModelChange } = setup({ availableModels: ['opus', 'sonnet'], selectedModel: 'opus' });

    fireEvent.click(screen.getByRole('button', { name: /型号/ }));
    fireEvent.click(screen.getByText('sonnet'));

    expect(onModelChange).toHaveBeenCalledWith('sonnet');
  });

  it('点详情打开 status 面板', () => {
    const { onOpenStatus } = setup();

    fireEvent.click(screen.getByRole('button', { name: /详情/ }));

    expect(onOpenStatus).toHaveBeenCalledTimes(1);
  });
});
