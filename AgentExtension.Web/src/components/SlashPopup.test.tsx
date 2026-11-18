import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SlashPopup } from './SlashPopup';

describe('补全弹层与面板的联动', () => {
  it('被面板接管的命令不再标仅终端', () => {
    // 之前撞到过拒绝、被记进 unavailable，但现在有面板了，还标就是错的
    render(
      <SlashPopup
        commands={['plugins', 'config']}
        selectedIndex={0}
        onSelect={vi.fn()}
        unavailable={['plugins', 'config']} note="仅会话内命令"
      />,
    );

    expect(screen.queryAllByText('仅终端')).toHaveLength(1);
  });

  it('没有面板接管的命令照常标注', () => {
    render(
      <SlashPopup
        commands={['config']}
        selectedIndex={0}
        onSelect={vi.fn()}
        unavailable={['config']} note="仅会话内命令"
      />,
    );

    expect(screen.getByText('仅终端')).toBeTruthy();
  });
});
