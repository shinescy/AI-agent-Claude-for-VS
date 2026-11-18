// 图片放大预览：点缩略图打开，点暗处、✕ 或 Esc 关闭。

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../LangContext';
import { useFilePreview } from '../useFilePreview';
import { sendOpenFile } from '../bridge';

interface ImageLightboxProps {
  src: string;
  onClose: () => void;
}

export function ImageLightbox({ src, onClose }: ImageLightboxProps) {
  const t = useT();

  // 捕获阶段接 Esc：只关预览，不让它继续传去打断生成。
  useEffect(() =>
  {
    function onKeyDown(e: KeyboardEvent)
    {
      if (e.key === 'Escape')
      {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const overlay = (
    <div
      className="modal-backdrop image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={t('图片预览')}
      onClick={onClose}
    >
      <img className="image-lightbox-img" src={src} alt={t('图片预览')} />
      <button type="button" className="image-lightbox-close" aria-label={t('关闭')} onClick={onClose}>✕</button>
    </div>
  );

  // 挂到 body：输入框所在容器可能裁剪或自成定位上下文。
  const portal = createPortal(overlay, document.body);
  return portal;
}

/** 按路径预览一张图片：由宿主读出来，读不到就说原因，并给「在 VS 里打开」兜底。 */
export function ImageFileLightbox({ path, onClose }: { path: string; onClose: () => void })
{
  const t = useT();
  const state = useFilePreview(path);
  const showing = state.status === 'ready' && state.data.error === '' && state.data.image !== '';

  // 读取中、读失败时也要能 Esc 关；读到图后由 ImageLightbox 自己接
  useEffect(() =>
  {
    if (showing)
    {
      return;
    }

    function onKeyDown(e: KeyboardEvent)
    {
      if (e.key === 'Escape')
      {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [showing, onClose]);

  if (state.status === 'ready' && state.data.error === '' && state.data.image !== '')
  {
    return <ImageLightbox src={state.data.image} onClose={onClose} />;
  }

  const failed = state.status === 'ready';
  const message = !failed
    ? t('正在读取…')
    : state.data.error !== '' ? state.data.error : t('这个文件没法在面板里预览。');

  const overlay = (
    <div
      className="modal-backdrop image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={t('图片预览')}
      onClick={onClose}
    >
      <div className="image-lightbox-note" onClick={(e) => e.stopPropagation()}>
        <div>{message}</div>
        {failed && (
          <button
            type="button"
            className="file-preview-action"
            onClick={() =>
            {
              sendOpenFile(path, 0);
              onClose();
            }}
          >
            {t('在 VS 里打开')}
          </button>
        )}
      </div>
      <button type="button" className="image-lightbox-close" aria-label={t('关闭')} onClick={onClose}>✕</button>
    </div>
  );

  const portal = createPortal(overlay, document.body);
  return portal;
}

/** 一排可点开预览的缩略图；removable 时右上角带移除按钮。 */
export function ImageThumbs(
  { images, onRemove }: { images: { id: number | string; src: string }[]; onRemove?: (id: number | string) => void })
{
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="composer-attachments">
      {images.map((image) => (
        <div key={image.id} className="composer-attachment">
          <button
            type="button"
            className="composer-attachment-open"
            title={t('点击预览')}
            onClick={() => setOpen(image.src)}
          >
            <img src={image.src} alt={t('附件')} />
          </button>
          {onRemove !== undefined && (
            <button
              type="button"
              className="composer-attachment-remove"
              title={t('移除')}
              onClick={() => onRemove(image.id)}
            >
              ×
            </button>
          )}
        </div>
      ))}

      {open !== null && <ImageLightbox src={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
