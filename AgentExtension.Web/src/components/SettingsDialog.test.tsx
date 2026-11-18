import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SettingsDialog } from './SettingsDialog';
import { DEFAULT_APPEARANCE } from '../appearance';

function renderDialog(onLogin = vi.fn(), onLogout = vi.fn(), onClose = vi.fn())
{
  const view = render(
    <SettingsDialog
      panelMenu={[]}
      onOpenPanel={() => {}}
      terminalOpen={false}
      onToggleTerminal={() => {}}
      lang="zh"
      onLangChange={() => {}}
      appearance={DEFAULT_APPEARANCE}
      onAppearanceChange={() => {}}
      onLogin={onLogin}
      onLogout={onLogout}
      onClose={onClose}
    />);
  return { view, onLogin, onLogout, onClose };
}

describe('设置弹窗的账号入口', () =>
{
  it('登录、退出登录都在面板里完成，不再提示去终端', () =>
  {
    const { view, onLogin, onLogout, onClose } = renderDialog();

    expect(view.container.textContent).not.toContain('claude auth');

    fireEvent.click(view.container.querySelector('[data-account="login"]')!);
    fireEvent.click(view.container.querySelector('[data-account="logout"]')!);

    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
