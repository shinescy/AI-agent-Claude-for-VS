// 终端输入框的粘贴：复制的文件转 @ 引用，截图落盘成路径

import { useEffect, useRef, useState } from 'react';
import type { ClipboardEvent } from 'react';
import { onHostMessage, sendClipboardFilesQuery, sendSaveImage } from './bridge';

/** 粘贴进来的一张截图。 */
export interface PastedImage
{
  /** 前端自增 id。 */
  id: number;

  /** 缩略图用的 data URL。 */
  preview: string;

  /** 宿主落盘后的绝对路径；保存中为空。 */
  path: string;
}

/** 等宿主回包的一次粘贴。 */
interface PendingPaste
{
  /** 剪贴板里的图片，宿主说没复制文件时才用。 */
  images: File[];
}

// 模块级计数器：多个输入框实例共用一个宿主，requestId 不能撞
let pasteSeq = 0;
let imageIdSeed = 1;

/** 把一个 File 读成 data URL。 */
function readAsDataUrl(file: File): Promise<string>
{
  return new Promise((resolve) =>
  {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

/** 终端输入框的粘贴处理；onPaths 收到复制的文件路径。 */
export function useTerminalPaste(onPaths: (paths: string[]) => void)
{
  const [images, setImages] = useState<PastedImage[]>([]);
  const [error, setError] = useState('');

  const pendingPastes = useRef(new Map<string, PendingPaste>());
  const pendingImages = useRef(new Map<string, number>());

  const pathsHandler = useRef(onPaths);
  pathsHandler.current = onPaths;

  useEffect(() =>
  {
    const off = onHostMessage((data) =>
    {
      const message = data as { type?: string; payload?: Record<string, unknown> };
      const payload = message?.type === 'context' ? message.payload : undefined;

      if (!payload || typeof payload.requestId !== 'string')
      {
        return;
      }

      if (payload.kind === 'clipboardFiles')
      {
        handleClipboardFiles(payload.requestId, payload.results);
        return;
      }

      if (payload.kind === 'savedImage')
      {
        handleSavedImage(payload.requestId, payload.path, payload.error);
      }
    });

    return off;
  }, []);

  /** 宿主报回剪贴板里的文件：有就插路径，没有就把图片当截图。 */
  function handleClipboardFiles(requestId: string, results: unknown): void
  {
    const pending = pendingPastes.current.get(requestId);

    if (pending === undefined)
    {
      return;
    }

    pendingPastes.current.delete(requestId);

    const paths = Array.isArray(results) ? (results as string[]) : [];

    if (paths.length > 0)
    {
      pathsHandler.current(paths);
      return;
    }

    for (const file of pending.images)
    {
      void addImage(file);
    }
  }

  /** 宿主报回截图落盘结果。 */
  function handleSavedImage(requestId: string, path: unknown, failure: unknown): void
  {
    const id = pendingImages.current.get(requestId);

    if (id === undefined)
    {
      return;
    }

    pendingImages.current.delete(requestId);

    if (typeof path === 'string' && path.length > 0)
    {
      setImages((prev) => prev.map((image) => (image.id === id ? { ...image, path } : image)));
      return;
    }

    setImages((prev) => prev.filter((image) => image.id !== id));
    setError(typeof failure === 'string' ? failure : '');
  }

  /** 读图、先挂缩略图，再请宿主落盘。 */
  async function addImage(file: File): Promise<void>
  {
    const dataUrl = await readAsDataUrl(file);

    if (dataUrl.length === 0)
    {
      return;
    }

    const id = imageIdSeed++;
    const requestId = `img${++pasteSeq}`;

    pendingImages.current.set(requestId, id);
    setImages((prev) => [...prev, { id, preview: dataUrl, path: '' }]);
    sendSaveImage(dataUrl, requestId);
  }

  /** 挂在 textarea 的 onPaste 上；纯文字不拦。 */
  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>): void
  {
    const items = Array.from(e.clipboardData?.items ?? []);
    const files = items.filter((item) => item.kind === 'file');

    if (files.length === 0)
    {
      return;
    }

    e.preventDefault();
    setError('');

    const imageFiles = files
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);

    // 网页拿不到复制文件的真实路径，得问宿主
    const requestId = `clip${++pasteSeq}`;
    pendingPastes.current.set(requestId, { images: imageFiles });
    sendClipboardFilesQuery(requestId);
  }

  /** 移除一张。 */
  function remove(id: number): void
  {
    setImages((prev) => prev.filter((image) => image.id !== id));
  }

  /** 发送后清空。 */
  function clear(): void
  {
    setImages([]);
    setError('');
  }

  const saving = images.some((image) => image.path.length === 0);

  return { images, error, saving, handlePaste, remove, clear };
}
