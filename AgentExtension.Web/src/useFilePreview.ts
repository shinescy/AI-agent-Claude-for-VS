// 向宿主要一个文件的预览内容。

import { useEffect, useRef, useState } from 'react';
import { onHostMessage, sendFileContentQuery } from './bridge';

/** 宿主回的一份预览。 */
export interface FilePreviewData {
  path: string;
  text: string;
  image: string;
  truncated: boolean;
  totalLines: number;
  size: number;
  error: string;
}

export type FilePreviewState =
  | { status: 'idle' }
  | { status: 'loading'; path: string }
  | { status: 'ready'; path: string; data: FilePreviewData };

// 模块级：同一时刻页面上可能有多张卡片各自在等回包，id 必须全局唯一。
let previewSeq = 0;

/** 取某个文件的预览。 */
export function useFilePreview(path: string | null): FilePreviewState {
  const [state, setState] = useState<FilePreviewState>({ status: 'idle' });
  const pendingId = useRef('');

  useEffect(() => {
    const off = onHostMessage((data) => {
      const message = data as { type?: string; payload?: Record<string, unknown> };

      if (!message || message.type !== 'context' || !message.payload) {
        return;
      }

      const payload = message.payload;

      if (payload.kind !== 'fileContent' || payload.requestId !== pendingId.current) {
        return;
      }

      setState({
        status: 'ready',
        path: String(payload.path ?? ''),
        data: {
          path: String(payload.path ?? ''),
          text: String(payload.text ?? ''),
          image: String(payload.image ?? ''),
          truncated: Boolean(payload.truncated),
          totalLines: Number(payload.totalLines ?? 0),
          size: Number(payload.size ?? 0),
          error: String(payload.error ?? ''),
        },
      });
    });

    return off;
  }, []);

  useEffect(() => {
    if (path === null || path.length === 0) {
      pendingId.current = '';
      setState({ status: 'idle' });
      return;
    }

    const id = `p${++previewSeq}`;
    pendingId.current = id;
    setState({ status: 'loading', path });
    sendFileContentQuery(path, id);
  }, [path]);

  return state;
}
