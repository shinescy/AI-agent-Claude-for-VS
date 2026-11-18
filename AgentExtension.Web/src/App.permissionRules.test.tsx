// 权限的各个入口都落到「权限规则」弹窗，不再有只读的旧面板。
//
// 挂在真实 App 上：入口分散在设置菜单、斜杠命令、落点表三处，装配错了组件测试碰不到。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LANG_STORAGE_KEY } from './i18n';

// xterm 在 jsdom 里起不来；这里只关心装配
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    options: Record<string, unknown> = {};
    write() {}
    paste() {}
    onData() { return { dispose() {} }; }
    onScroll() { return { dispose() {} }; }
    onRender() { return { dispose() {} }; }
    scrollToLine() {}
    registerLinkProvider() { return { dispose() {} }; }
    attachCustomKeyEventHandler() {}
    buffer = { active: { viewportY: 0, length: 0, getLine: () => undefined } };
    open() {}
    focus() {}
    reset() {}
    clear() {}
    getSelection() { return ''; }
    dispose() {}
    loadAddon() {}
  },
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class { fit() {} activate() {} dispose() {} },
}));

import App from './App';

beforeEach(() => {
  window.localStorage.setItem(LANG_STORAGE_KEY, 'zh');
});

afterEach(() => {
  window.localStorage.removeItem(LANG_STORAGE_KEY);
});

/** 聊天输入框里敲一条命令并 Ctrl+Enter。 */
function sendInChat(text: string): void
{
  const box = document.querySelector<HTMLTextAreaElement>('.composer:not(.composer-terminal) .composer-row textarea')!;
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
}

describe('权限入口', () => {
  it('设置里的面板菜单点「权限规则」打开弹窗', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    const entry = document.querySelector<HTMLButtonElement>('.settings-dialog [data-panel="permissionRules"]')!;

    expect(entry.textContent).toBe('权限规则');
    fireEvent.click(entry);

    expect(screen.getByRole('dialog', { name: '权限规则' })).toBeTruthy();
    expect(document.querySelector('.settings-dialog')).toBeNull();
  });

  it('面板菜单里不再有旧的只读「权限」面板', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '设置' }));

    expect(document.querySelector('.settings-dialog [data-panel="permissions"]')).toBeNull();
  });

  it('/permissions 与 /allowed-tools 打开弹窗', () => {
    for (const command of ['/permissions', '/allowed-tools'])
    {
      const view = render(<App />);
      sendInChat(command);

      expect(screen.getByRole('dialog', { name: '权限规则' }), command).toBeTruthy();
      view.unmount();
    }
  });

  it('/add-dir 打开弹窗并说明附加目录在哪里改', () => {
    render(<App />);
    sendInChat('/add-dir');

    expect(screen.getByRole('dialog', { name: '权限规则' })).toBeTruthy();
    expect(document.body.textContent).toContain('permissions.additionalDirectories');
  });
});
