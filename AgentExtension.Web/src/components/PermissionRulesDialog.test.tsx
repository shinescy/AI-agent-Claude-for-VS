import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PermissionRulesDialog, splitRules } from './PermissionRulesDialog';

type Posted = { option?: string; value?: string; requestId?: string };

let posted: Posted[] = [];
let hostHandlers: Set<(event: MessageEvent) => void>;

beforeEach(() => {
  posted = [];
  hostHandlers = new Set();

  (window as unknown as { chrome?: unknown }).chrome = {
    webview: {
      postMessage: (message: unknown) => { posted.push(message as Posted); },
      addEventListener: (_type: string, handler: (event: MessageEvent) => void) => { hostHandlers.add(handler); },
      removeEventListener: (_type: string, handler: (event: MessageEvent) => void) => { hostHandlers.delete(handler); },
    },
  };
});

afterEach(() => {
  delete (window as unknown as { chrome?: unknown }).chrome;
});

function emit(payload: Record<string, unknown>) {
  act(() => { hostHandlers.forEach((handler) => handler({ data: { type: 'context', payload } } as MessageEvent)); });
}

function last(): Posted {
  return posted.filter((m) => m.option === 'permissionRules' || m.option === 'editPermissionRules').slice(-1)[0];
}

const STATE = JSON.stringify({
  rules: [
    { rule: 'Bash(npm test)', behavior: 'allow', source: 'localSettings' },
    { rule: 'WebFetch', behavior: 'deny', source: 'policySettings' },
  ],
  managedOnly: false,
});

describe('权限规则弹窗', () => {
  it('打开就读清单；可删的给删除按钮，策略来的只读', () => {
    render(<PermissionRulesDialog onOpenSettingsFiles={() => undefined} onClose={() => undefined} />);
    expect(last().option).toBe('permissionRules');

    emit({ kind: 'permissionRules', requestId: last().requestId, state: STATE, warnings: '[]', error: '' });
    expect(screen.getByText('Bash(npm test)')).toBeTruthy();
    expect(screen.getByRole('button', { name: '删除 Bash(npm test)' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '删除 WebFetch' })).toBeNull();
  });

  it('按允许 / 询问 / 拒绝分组并标数量，来源写成「来自…」', () => {
    render(<PermissionRulesDialog onOpenSettingsFiles={() => undefined} onClose={() => undefined} />);
    emit({ kind: 'permissionRules', requestId: last().requestId, state: STATE, warnings: '[]', error: '' });

    expect(screen.getByText('允许 (1)')).toBeTruthy();
    expect(screen.getByText('每次询问 (0)')).toBeTruthy();
    expect(screen.getByText('拒绝 (1)')).toBeTruthy();
    expect(screen.getByText('来自项目本地设置')).toBeTruthy();
    expect(screen.getByText('来自企业策略')).toBeTruthy();
  });

  it('在哪一组点「添加规则…」就加到哪一组，按行拆分并带上保存位置', () => {
    render(<PermissionRulesDialog onOpenSettingsFiles={() => undefined} onClose={() => undefined} />);
    emit({ kind: 'permissionRules', requestId: last().requestId, state: STATE, warnings: '[]', error: '' });

    expect(screen.queryByLabelText('新规则')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '添加规则… 每次询问' }));
    fireEvent.change(screen.getByLabelText('新规则'), { target: { value: 'Read(./src/**)\n\n Bash(ls) ' } });
    fireEvent.change(screen.getByLabelText('保存到'), { target: { value: 'userSettings' } });
    fireEvent.click(screen.getByText('添加'));

    expect(last().option).toBe('editPermissionRules');
    expect(JSON.parse(last().value!)).toEqual({
      op: 'add', rules: ['Read(./src/**)', 'Bash(ls)'], behavior: 'ask', destination: 'userSettings',
    });
  });

  it('工作区目录一栏列出起始目录与附加目录', () => {
    render(<PermissionRulesDialog onOpenSettingsFiles={() => undefined} onClose={() => undefined} />);
    const workspace = JSON.stringify([
      { path: 'F:\\Work\\App', source: 'original' },
      { path: '../shared', source: 'userSettings' },
    ]);
    emit({ kind: 'permissionRules', requestId: last().requestId, state: STATE, warnings: '[]', error: '', workspace });

    expect(screen.getByText('工作区目录 (2)')).toBeTruthy();
    expect(screen.getByText('F:\\Work\\App')).toBeTruthy();
    expect(screen.getByText('原始工作目录')).toBeTruthy();
    expect(screen.getByText('来自用户级设置')).toBeTruthy();
  });

  it('默认模式一栏按宿主给的顺序列出，没写就不显示', () => {
    render(<PermissionRulesDialog onOpenSettingsFiles={() => undefined} onClose={() => undefined} />);
    emit({ kind: 'permissionRules', requestId: last().requestId, state: STATE, warnings: '[]', error: '' });
    expect(screen.queryByText(/^默认模式/)).toBeNull();

    const defaultModes = JSON.stringify([
      { mode: 'acceptEdits', source: 'localSettings' },
      { mode: 'bypassPermissions', source: 'userSettings' },
    ]);
    emit({ kind: 'permissionRules', requestId: last().requestId, state: STATE, warnings: '[]', error: '', defaultModes });

    expect(screen.getByText('默认模式 (2)')).toBeTruthy();
    const modes = Array.from(document.querySelectorAll('.rules-section'))
      .find((section) => section.textContent?.startsWith('默认模式'))!
      .querySelectorAll('.rules-rule');
    expect(Array.from(modes).map((node) => node.textContent)).toEqual(['acceptEdits', 'bypassPermissions']);

    // 规则那栏也有一行来自项目本地设置，只在默认模式这一栏里找来源
    const sources = Array.from(document.querySelectorAll('.rules-section'))
      .find((section) => section.textContent?.startsWith('默认模式'))!
      .querySelectorAll('.rules-source');
    expect(Array.from(sources).map((node) => node.textContent)).toEqual(['来自项目本地设置', '来自用户级设置']);
  });

  it('默认模式数据坏了不影响规则显示', () => {
    render(<PermissionRulesDialog onOpenSettingsFiles={() => undefined} onClose={() => undefined} />);
    emit({
      kind: 'permissionRules', requestId: last().requestId, state: STATE, warnings: '[]', error: '', defaultModes: '{坏的',
    });

    expect(screen.getByText('Bash(npm test)')).toBeTruthy();
    expect(screen.queryByText(/^默认模式/)).toBeNull();
  });

  it('删除发 remove，回包里的警告显示出来', () => {
    render(<PermissionRulesDialog onOpenSettingsFiles={() => undefined} onClose={() => undefined} />);
    emit({ kind: 'permissionRules', requestId: last().requestId, state: STATE, warnings: '[]', error: '' });

    fireEvent.click(screen.getByRole('button', { name: '删除 Bash(npm test)' }));
    expect(JSON.parse(last().value!)).toEqual({
      op: 'remove', rule: 'Bash(npm test)', behavior: 'allow', source: 'localSettings',
    });

    emit({ kind: 'permissionRules', requestId: last().requestId, state: STATE, warnings: '["规则重复"]', error: '' });
    expect(screen.getByText(/规则重复/)).toBeTruthy();
  });

  it('添加失败时保留输入框内容；成功才收起', () => {
    render(<PermissionRulesDialog onOpenSettingsFiles={() => undefined} onClose={() => undefined} />);
    emit({ kind: 'permissionRules', requestId: last().requestId, state: STATE, warnings: '[]', error: '' });

    fireEvent.click(screen.getByRole('button', { name: '添加规则… 允许' }));
    const box = screen.getByLabelText('新规则') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'Bash(ls)' } });
    fireEvent.click(screen.getByText('添加'));
    emit({ kind: 'permissionRules', requestId: last().requestId, state: STATE, warnings: '[]', error: '退出码 1' });
    expect(box.value).toBe('Bash(ls)');

    fireEvent.click(screen.getByText('添加'));
    emit({ kind: 'permissionRules', requestId: last().requestId, state: STATE, warnings: '[]', error: '' });
    expect(screen.queryByLabelText('新规则')).toBeNull();
  });

  it('首次读取就失败：只显示错误，不显示读取中', () => {
    render(<PermissionRulesDialog onOpenSettingsFiles={() => undefined} onClose={() => undefined} />);
    emit({ kind: 'permissionRules', requestId: last().requestId, state: '', warnings: '[]', error: '会话还没启动' });
    expect(screen.getByRole('alert').textContent).toContain('会话还没启动');
    expect(screen.queryByText('正在读取规则…')).toBeNull();
  });

  it('底部链接打开「设置文件」面板', () => {
    const onOpenSettingsFiles = vi.fn();
    render(<PermissionRulesDialog onOpenSettingsFiles={onOpenSettingsFiles} onClose={() => undefined} />);
    fireEvent.click(screen.getByText('在编辑器里打开设置文件…'));
    expect(onOpenSettingsFiles).toHaveBeenCalled();
  });

  it('splitRules 去掉空行和首尾空白', () => {
    expect(splitRules(' a \n\n b\r\n')).toEqual(['a', 'b']);
  });
});
