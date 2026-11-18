import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImageThumbs } from './ImageLightbox';

const SRC = 'data:image/png;base64,AAAA';

describe('附件缩略图点开预览', () => {
  it('点缩略图弹出大图，Esc 关掉', () => {
    render(<ImageThumbs images={[{ id: 1, src: SRC }]} />);
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByTitle('点击预览'));
    const dialog = screen.getByRole('dialog', { name: '图片预览' });
    expect(dialog.querySelector('img')!.getAttribute('src')).toBe(SRC);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('点暗处、点大图本身或 ✕ 都能关', () => {
    render(<ImageThumbs images={[{ id: 1, src: SRC }]} />);

    fireEvent.click(screen.getByTitle('点击预览'));
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).toBeNull();

    // 点在大图上也关。
    fireEvent.click(screen.getByTitle('点击预览'));
    fireEvent.click(screen.getByRole('dialog').querySelector('img')!);
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByTitle('点击预览'));
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('给了 onRemove 才有移除按钮，点它不会打开预览', () => {
    const onRemove = vi.fn();
    const { rerender } = render(<ImageThumbs images={[{ id: 7, src: SRC }]} />);
    expect(screen.queryByTitle('移除')).toBeNull();

    rerender(<ImageThumbs images={[{ id: 7, src: SRC }]} onRemove={onRemove} />);
    fireEvent.click(screen.getByTitle('移除'));
    expect(onRemove).toHaveBeenCalledWith(7);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
