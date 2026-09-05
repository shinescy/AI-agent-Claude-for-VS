// 设置文件面板：/hooks /sandbox 这类命令的落点。
//
// 与「权限」面板同一条边界：只读。所以这里同样钉住「每行只有一个按钮，就是打开文件」，
// 以及「文件读不出来时要说出来，不能显示成空段列表」。

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsFilesPanel } from './SettingsFilesPanel';
import type { PanelItemView } from '../panelState';

const USER = 'C:\\Users\\me\\.claude\\settings.json';

function row(overrides: Partial<PanelItemView> & { fields: Record<string, string> }): PanelItemView {
  return {
    id: USER,
    actionValue: USER,
    title: 'settings.json',
    subtitle: USER,
    enabled: true,
    detail: '',
    currentProject: false,
    scope: 'user',
    ...overrides,
  } as PanelItemView;
}

describe('设置文件面板', () => {
  it('列出作用域与文件里已有的配置段', () => {
    render(
      <SettingsFilesPanel
        items={[row({ fields: { path: USER, sections: 'permissions(3) · hooks(2) · env(1)', count: '3' } })]}
        onOpenFile={vi.fn()}
      />);

    expect(screen.getByText('用户级')).toBeTruthy();
    expect(screen.getByText('permissions(3) · hooks(2) · env(1)')).toBeTruthy();
  });

  it('只读：每行只有「打开」，点它把路径交给宿主', () => {
    const onOpenFile = vi.fn();

    render(
      <SettingsFilesPanel
        items={[row({ fields: { path: USER, sections: 'permissions(1)', count: '1' } })]}
        onOpenFile={onOpenFile}
      />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);

    fireEvent.click(buttons[0]);
    expect(onOpenFile).toHaveBeenCalledWith(USER);
  });

  it('文件存在但没有任何段时说清楚，不留一片空白', () => {
    render(
      <SettingsFilesPanel
        items={[row({ fields: { path: USER, sections: '', count: '0' } })]}
        onOpenFile={vi.fn()}
      />);

    expect(screen.getByText('（还没有任何配置段）')).toBeTruthy();
  });

  it('读不出来时说出来，不装作「没有配置段」', () => {
    render(
      <SettingsFilesPanel
        items={[row({
          enabled: false,
          detail: "',' is invalid after a value.",
          fields: { path: USER, sections: '', count: '0' },
        })]}
        onOpenFile={vi.fn()}
      />);

    expect(screen.getByText(/读不出来/)).toBeTruthy();
    expect(screen.getByText(/is invalid after a value/)).toBeTruthy();
  });

  it('一个文件都没有时说明情况', () => {
    render(<SettingsFilesPanel items={[]} onOpenFile={vi.fn()} />);

    expect(screen.getByText('没有找到任何 settings.json。')).toBeTruthy();
  });
});
