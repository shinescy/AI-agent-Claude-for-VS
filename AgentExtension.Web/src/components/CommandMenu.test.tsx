import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Composer } from './Composer';
import { buildMenu, quickActions, requiresArgs, slashItems } from '../commandMenu';
import { friendlyModelName, matchModelValue } from '../models';
import { AccountDialog, splitUsageBehaviors } from './AccountDialog';
import { initialState } from '../state';

const INFOS = [{ name: 'compact', description: '压缩上下文', argumentHint: '' }];

function setup(slashCommands: string[] = ['model', 'compact']) {
  const onSend = vi.fn();
  const host = {
    openPanel: vi.fn(),
    runAction: vi.fn(),
    choices: vi.fn(() => [
      { value: 'opus', label: 'Opus', description: '', current: true },
      { value: 'sonnet', label: 'Sonnet', description: '', current: false },
    ]),
    pick: vi.fn(),
  };

  window.localStorage.removeItem('agent.chatPrompt');
  window.localStorage.removeItem('agent.chatPromptHeight');

  const view = render(
    <Composer
      onSend={onSend}
      slashCommands={slashCommands}
      commandInfos={INFOS}
      menuHost={host}
      unavailableCommands={[]}
      injection={null}
      fileResults={null}
      droppedFiles={null}
    />);

  const textarea = view.container.querySelector('.composer-row textarea') as HTMLTextAreaElement;
  const menuButton = view.container.querySelector('.composer-menu-button') as HTMLButtonElement;
  return { textarea, menuButton, onSend, host, container: view.container };
}

function type(textarea: HTMLTextAreaElement, text: string) {
  fireEvent.change(textarea, { target: { value: text, selectionStart: text.length, selectionEnd: text.length } });
}

describe('参数是否必填', () => {
  it('方括号与写明 optional 的可不填；尖括号与裸参数要填', () => {
    expect(requiresArgs('<optional custom summarization instructions>')).toBe(false);
    expect(requiresArgs('[name]')).toBe(false);
    expect(requiresArgs('[prompt-audit [<path>]]')).toBe(false);
    expect(requiresArgs('[interval] [prompt]')).toBe(false);
    expect(requiresArgs('')).toBe(false);

    expect(requiresArgs('<model>')).toBe(true);
    expect(requiresArgs('<instruction>')).toBe(true);
    expect(requiresArgs('key=value')).toBe(true);
    expect(requiresArgs('consent | revoke')).toBe(true);
    expect(requiresArgs('[--request-id <uuid>] (--wizard x | --apply-file <path>)')).toBe(true);
  });

  it('/compact 选中即执行，/batch 仍填进输入框', () => {
    const infos = [
      { name: 'compact', description: '', argumentHint: '<optional custom summarization instructions>' },
      { name: 'batch', description: '', argumentHint: '<instruction>' },
    ];
    const items = slashItems(['compact', 'batch'], infos, '斜杠命令', true);

    expect(items.map((item) => item.kind)).toEqual(['run', 'insert']);
  });
});

describe('命令菜单的清单', () => {
  const actions = quickActions((zh) => zh);

  it('没有查询时快捷动作在前、slash 命令在后', () => {
    const items = buildMenu(actions, ['model'], [], '', '斜杠命令');

    expect(items[0].kind).toBe('attach');
    expect(actions.every((item) => item.kind !== 'insert')).toBe(true);
    expect(items[items.length - 1].label).toBe('/model');
  });

  it('英文查询靠关键词命中快捷动作，中文查询照旧按标题命中', () => {
    const items = buildMenu(actions, ['model', 'compact'], [], '模型', '斜杠命令');
    const first = buildMenu(actions, ['model', 'compact'], [], 'mo', '斜杠命令')[0];

    expect(first.label).toBe('切换模型…');
    expect(items.some((item) => item.label === '切换模型…')).toBe(true);
  });

  it('/res 时「上下文」分组在前，斜杠命令在后', () => {
    const infos = [
      { name: 'rewind', description: 'Restore the code and conversation', argumentHint: '' },
      { name: 'compact', description: '压缩上下文', argumentHint: '' },
    ];
    const items = buildMenu(
      actions, ['model', 'resume', 'rewind', 'compact', 'reset-limits'], infos, '/res', '斜杠命令', true);

    // /rewind 与「回滚文件…」同去向，只留快捷动作。
    expect(items.map((item) => item.label)).toEqual(['恢复会话…', '回滚文件…', '/reset-limits']);
    expect(items.map((item) => item.section)).toEqual(['上下文', '上下文', '斜杠命令']);
  });

  it('只靠关键词沾边的快捷动作不抢 slash 命令的回车', () => {
    const commands = ['compact', 'config', 'context', 'cost', 'resume', 'help'];
    const firstFor = (query: string) =>
      buildMenu(actions, commands, [], query, '斜杠命令', true)[0].label;

    expect(firstFor('/cont')).toBe('/context');
    expect(firstFor('/con')).toBe('/config');
    expect(firstFor('/com')).toBe('/compact');
    // 同去向的命令也命中时快捷动作仍在最前。
    expect(firstFor('/res')).toBe('恢复会话…');
  });

  it('/sessions 不被「恢复会话…」抢走', () => {
    const items = buildMenu(actions, ['resume', 'sessions'], [], '/sessions', '斜杠命令', true);

    expect(items.map((item) => item.label)).toEqual(['/sessions']);
  });

  it('开同一个面板的 slash 命令也去重，要填参数的留着', () => {
    const commands = ['mcp', 'plugin', 'agents', 'memory', 'permissions', 'doctor', 'rewind', 'help',
      'export', 'terminal', 'status', 'compact'];
    const all = buildMenu(actions, commands, [], '', '斜杠命令', true).map((item) => item.label);

    expect(all.filter((label) => label.startsWith('/'))).toEqual(['/status', '/compact']);

    const infos = [{ name: 'mcp', description: '', argumentHint: '<enable|disable> <server>' }];
    const withArgs = buildMenu(actions, ['mcp'], infos, 'mcp', '斜杠命令', true).map((item) => item.label);

    expect(withArgs).toEqual(['MCP 服务器', '/mcp']);
  });

  it('全等排在词首前，词首排在子串前，只靠说明命中的排最后', () => {
    const infos = [{ name: 'compact', description: 'shrink memory usage', argumentHint: '' }];
    const items = buildMenu(actions, ['memory-check', 'compact', 'inmemory'], infos, 'memory', '斜杠命令');

    expect(items.map((item) => item.label)).toEqual(['记忆', '/memory-check', '/inmemory', '/compact']);
  });

  it('同一功能既有快捷动作又有原生 slash 命令时只留快捷动作', () => {
    const commands = ['model', 'effort', 'usage', 'clear', 'resume', 'compact'];
    const labelsFor = (query: string) =>
      buildMenu(actions, commands, [], query, '斜杠命令', true).map((item) => item.label);

    expect(labelsFor('model')).toEqual(['切换模型…']);
    expect(labelsFor('effort')).toEqual(['思考强度…']);
    expect(labelsFor('usage')).toEqual(['账号与用量']);
    expect(labelsFor('clear')).toEqual(['清空对话']);
    expect(labelsFor('resume')).toEqual(['恢复会话…']);

    const all = labelsFor('');
    expect(all).toContain('/compact');
    expect(all.filter((label) => label.startsWith('/'))).toEqual(['/compact']);
  });

  it('没命中的行不出现；拼错的查询什么都不列', () => {
    expect(buildMenu(actions, ['model'], [], 'zzzz', '斜杠命令')).toEqual([]);
  });

  it('说明取 CLI 报的那份', () => {
    const items = buildMenu(actions, ['compact'], INFOS, 'comp', '斜杠命令');

    expect(items[0].description).toBe('压缩上下文');
  });

  it('会话没起时清单也不是空的', () => {
    // 聊天进程等解决方案目录到手才起，这之前菜单必须能用。
    expect(initialState.slashCommands).toContain('model');
    expect(initialState.slashCommands).toContain('mcp');
  });
});

describe('命令菜单的交互', () => {
  it('只打一个斜杠就列出分组与说明', () => {
    const { textarea } = setup();

    type(textarea, '/');

    expect(screen.getByText('上下文')).toBeTruthy();
    expect(screen.getByText('斜杠命令')).toBeTruthy();
    expect(screen.getByTitle('压缩上下文')).toBeTruthy();
  });

  it('命令清单为空时斜杠照样弹出菜单', () => {
    const { textarea } = setup([]);

    type(textarea, '/');

    expect(screen.queryByRole('listbox')).not.toBeNull();
  });

  it('点「/」按钮打开带筛选框的菜单，再点一次关掉', () => {
    const { menuButton, container } = setup();

    fireEvent.click(menuButton);
    expect(container.querySelector('.command-menu-filter')).not.toBeNull();

    fireEvent.click(menuButton);
    expect(container.querySelector('.command-menu')).toBeNull();
  });

  it('筛选框里打字缩小范围，回车打开面板，不往对话里发命令', () => {
    const { menuButton, container, onSend, host } = setup();

    fireEvent.click(menuButton);
    const filter = container.querySelector('.command-menu-filter') as HTMLInputElement;
    fireEvent.change(filter, { target: { value: 'MCP' } });
    fireEvent.keyDown(filter, { key: 'Enter' });

    expect(host.openPanel).toHaveBeenCalledWith('mcp');
    expect(onSend).not.toHaveBeenCalled();
    expect(container.querySelector('.command-menu')).toBeNull();
  });

  it('选中 slash 命令直接执行，不先填进输入框', () => {
    const { menuButton, container, textarea, onSend } = setup();

    fireEvent.click(menuButton);
    const filter = container.querySelector('.command-menu-filter') as HTMLInputElement;
    fireEvent.change(filter, { target: { value: 'compact' } });
    fireEvent.keyDown(filter, { key: 'Enter' });

    expect(onSend).toHaveBeenCalledWith('/compact', []);
    expect(textarea.value).toBe('');
  });

  it('按 Tab 是补全：只填进输入框，不执行', () => {
    const { textarea, onSend } = setup();

    type(textarea, '/comp');
    fireEvent.keyDown(textarea, { key: 'Tab' });

    expect(textarea.value).toBe('/compact ');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('快捷动作按 Tab 也只填对应的命令，不执行', () => {
    const { textarea, onSend, host } = setup(['model', 'compact', 'clear', 'mcp']);

    type(textarea, '/cl');
    fireEvent.keyDown(textarea, { key: 'Tab' });

    expect(textarea.value).toBe('/clear ');
    expect(host.runAction).not.toHaveBeenCalled();

    type(textarea, '/mc');
    fireEvent.keyDown(textarea, { key: 'Tab' });

    expect(textarea.value).toBe('/mcp ');
    expect(host.openPanel).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('回车打开会话弹层后不把焦点抢回输入框', async () => {
    const { textarea, host } = setup(['model', 'compact', 'resume']);

    type(textarea, '/res');
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await new Promise((resolve) => window.setTimeout(resolve, 60));

    expect(host.runAction).toHaveBeenCalledWith('sessions');
    expect(textarea.value).toBe('');
    expect(document.activeElement).not.toBe(textarea);
  });

  it('选 /model 展开模型选项，不把命令发给 CLI', () => {
    const { textarea, onSend } = setup();

    type(textarea, '/model');
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(screen.getByText('Opus')).toBeTruthy();
    expect(onSend).not.toHaveBeenCalled();
    expect(textarea.value).toBe('');
  });

  it('菜单关着时直接发 /usage 也是开弹窗，不发给 CLI', () => {
    const { textarea, onSend, host } = setup();

    type(textarea, '/usage');
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    expect(host.runAction).toHaveBeenCalledWith('account');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('强度那一行行尾是滑轨，点它不关菜单', () => {
    const { menuButton, container } = setup();

    fireEvent.click(menuButton);
    const track = container.querySelector('.command-menu-control .effort-track') as HTMLElement;
    fireEvent.mouseDown(track);

    expect(track).not.toBeNull();
    expect(container.querySelector('.command-menu')).not.toBeNull();
  });

  it('打字触发时选中动作会执行，并把斜杠从草稿里拿掉', () => {
    const { textarea, onSend, host } = setup();

    type(textarea, '/清空');
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(host.runAction).toHaveBeenCalledWith('newSession');
    expect(onSend).not.toHaveBeenCalled();
    expect(textarea.value).toBe('');
  });

  it('切换模型展开二级选项，选中后直接切，当前项带勾', () => {
    const { menuButton, container, onSend, host } = setup();

    fireEvent.click(menuButton);
    const filter = container.querySelector('.command-menu-filter') as HTMLInputElement;
    fireEvent.change(filter, { target: { value: '切换模型' } });
    fireEvent.keyDown(filter, { key: 'Enter' });

    expect(screen.getByText('Opus')).toBeTruthy();
    expect(screen.getByText('✓')).toBeTruthy();

    fireEvent.change(filter, { target: { value: 'son' } });
    fireEvent.keyDown(filter, { key: 'Enter' });

    expect(host.pick).toHaveBeenCalledWith('model', 'sonnet');
    expect(onSend).not.toHaveBeenCalled();
    expect(container.querySelector('.command-menu')).toBeNull();
  });

  it('二级选项里按 Esc 先退回主菜单', () => {
    const { menuButton, container } = setup();

    fireEvent.click(menuButton);
    const filter = container.querySelector('.command-menu-filter') as HTMLInputElement;
    fireEvent.change(filter, { target: { value: '切换模型' } });
    fireEvent.keyDown(filter, { key: 'Enter' });
    fireEvent.keyDown(filter, { key: 'Escape' });

    expect(screen.getByText('上下文')).toBeTruthy();
  });

  it('筛选框里按 Esc 只关菜单', () => {
    const { menuButton, container } = setup();

    fireEvent.click(menuButton);
    const filter = container.querySelector('.command-menu-filter') as HTMLInputElement;
    fireEvent.keyDown(filter, { key: 'Escape' });

    expect(container.querySelector('.command-menu')).toBeNull();
  });
});

describe('模型名字与当前项', () => {
  it('全名变成给人看的名字', () => {
    expect(friendlyModelName('claude-opus-5-5')).toBe('Opus 5.5');
    expect(friendlyModelName('fable')).toBe('Fable');
    expect(friendlyModelName('sonnet[1m]')).toBe('Sonnet (1M)');
    expect(friendlyModelName('best')).toBe('Best');
  });

  it('当前跑的是全名、清单里是别名时也能对上', () => {
    const values = ['claude-sonnet-5-5', 'claude-opus-5-5', 'fable', 'fable[1m]'];

    expect(matchModelValue(values, 'claude-fable-5-2', [])).toBe('fable');
    expect(matchModelValue(values, 'claude-fable-5-2[1m]', [])).toBe('fable[1m]');
    expect(matchModelValue(values, 'claude-opus-5-5', [])).toBe('claude-opus-5-5');
    expect(matchModelValue(values, 'claude-haiku-5-5', [])).toBe('');
    expect(matchModelValue(values, 'Fable 5.2', [])).toBe('fable');
    expect(matchModelValue(values, 'Opus 5.5', [])).toBe('claude-opus-5-5');
  });
});

describe('账号与用量弹窗', () => {
  const RAW = [
    'Current session: 11% used',
    '',
    "What's contributing to your limits usage?",
    'Approximate, based on local sessions on this machine',
    '',
    'Last 24h · 3322 requests · 4 sessions',
    '  81% of your usage was at >150k context',
    '  Top plugins: superpowers 2%',
    '',
    'Last 7d · 8460 requests · 26 sessions',
    '  85% of your usage was at >150k context',
  ].join('\r\n');

  it('从原文里切出各时间段的用量构成', () => {
    const periods = splitUsageBehaviors(RAW);

    expect(periods.map((p) => p.title)).toEqual([
      'Last 24h · 3322 requests · 4 sessions', 'Last 7d · 8460 requests · 26 sessions']);
    expect(periods[0].lines).toEqual(['81% of your usage was at >150k context', 'Top plugins: superpowers 2%']);
    expect(splitUsageBehaviors('无关文本')).toEqual([]);
  });

  it('会话没起也能打开，Esc 关闭', () => {
    const onClose = vi.fn();
    render(<AccountDialog session={null} onRefresh={vi.fn()} onClose={onClose} />);

    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
