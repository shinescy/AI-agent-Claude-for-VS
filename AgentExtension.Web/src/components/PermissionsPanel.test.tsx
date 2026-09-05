// 权限面板：取代被 CLI 拒绝的 /permissions。
//
// 这个面板的全部价值在于「哪条规则、什么种类、来自哪个文件」三者对得上，
// 以及「面板只读」这件事不能靠注释保证——所以这里钉住：规则行不给任何写入按钮，
// 只有作用域那一行有「打开」（去编辑器改）。

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PermissionsPanel } from './PermissionsPanel';
import type { PanelItemView } from '../panelState';

function item(overrides: Partial<PanelItemView> & { fields: Record<string, string> }): PanelItemView {
  return {
    id: 'x',
    actionValue: '',
    title: '',
    subtitle: '',
    enabled: true,
    detail: '',
    currentProject: false,
    scope: '',
    ...overrides,
  } as PanelItemView;
}

const SETTINGS = 'C:\\proj\\.claude\\settings.json';

function scopeRow(overrides: Record<string, string> = {}) {
  return item({
    id: SETTINGS,
    title: 'settings.json',
    scope: 'project',
    fields: { kind: 'file', path: SETTINGS, allow: '1', deny: '1', ask: '0', mode: '', ...overrides },
  });
}

function ruleRow(kind: string, rule: string, scope = 'project') {
  return item({
    id: `${scope}|${kind}|${rule}`,
    title: rule,
    scope,
    fields: { kind, path: SETTINGS },
  });
}

describe('权限面板', () => {
  it('规则按种类显示，并标出来自哪个作用域', () => {
    render(
      <PermissionsPanel
        items={[scopeRow(), ruleRow('allow', 'Bash(git status:*)'), ruleRow('deny', 'Bash(rm:*)', 'user')]}
        onOpenFile={vi.fn()}
      />);

    expect(screen.getByText('Bash(git status:*)')).toBeTruthy();
    expect(screen.getByText('Bash(rm:*)')).toBeTruthy();
    expect(screen.getAllByText('允许').length).toBeGreaterThan(0);
    expect(screen.getAllByText('拒绝').length).toBeGreaterThan(0);
    expect(screen.getByText('用户级')).toBeTruthy();
  });

  it('只读：规则行没有任何按钮，只有作用域那一行能打开文件', () => {
    // 加规则等于放宽权限，不能由网页一条消息完成。这条测试就是那道边界。
    const onOpenFile = vi.fn();

    render(
      <PermissionsPanel
        items={[scopeRow(), ruleRow('allow', 'Bash(rm:*)')]}
        onOpenFile={onOpenFile}
      />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);

    fireEvent.click(buttons[0]);
    expect(onOpenFile).toHaveBeenCalledWith(SETTINGS);
  });

  it('一条规则都没有时也显示作用域那一行，不是空面板', () => {
    render(
      <PermissionsPanel
        items={[scopeRow({ allow: '0', deny: '0', ask: '0' })]}
        onOpenFile={vi.fn()}
      />);

    expect(screen.getByText('本项目')).toBeTruthy();
    expect(screen.queryByText('没有找到任何 settings.json。')).toBeNull();
  });

  it('连 settings.json 都没有时说明情况，而不是留一片空白', () => {
    render(<PermissionsPanel items={[]} onOpenFile={vi.fn()} />);

    expect(screen.getByText('没有找到任何 settings.json。')).toBeTruthy();
  });

  it('文件读不出来时说出来，不装作「没有规则」', () => {
    render(
      <PermissionsPanel
        items={[item({
          id: SETTINGS,
          title: 'settings.json',
          scope: 'local',
          enabled: false,
          detail: "',' is invalid after a value.",
          fields: { kind: 'file', path: SETTINGS, allow: '0', deny: '0', ask: '0', mode: '' },
        })]}
        onOpenFile={vi.fn()}
      />);

    expect(screen.getByText(/读不出来/)).toBeTruthy();
    expect(screen.getByText(/is invalid after a value/)).toBeTruthy();
  });

  it('默认模式显示在作用域那一行上', () => {
    render(
      <PermissionsPanel items={[scopeRow({ mode: 'acceptEdits' })]} onOpenFile={vi.fn()} />);

    expect(screen.getByText(/acceptEdits/)).toBeTruthy();
  });

  it('加载中或出错时不显示「没找到」', () => {
    const { rerender } = render(
      <PermissionsPanel items={[]} loading onOpenFile={vi.fn()} />);
    expect(screen.queryByText('没有找到任何 settings.json。')).toBeNull();

    rerender(<PermissionsPanel items={[]} error="读盘失败" onOpenFile={vi.fn()} />);
    expect(screen.queryByText('没有找到任何 settings.json。')).toBeNull();
  });
});
