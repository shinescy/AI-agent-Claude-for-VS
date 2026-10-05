// 「挑文件」按钮背后的那条请求：宿主弹原生对话框，回来一串路径。

import { useCallback, useEffect, useRef } from 'react';
import { onHostMessage, sendPickFile } from './bridge';

// 模块级计数器，理由同 useMentionSearch 里的 mentionSeq：
let pickSeq = 0;

/** 返回一个「弹对话框挑文件」的函数。 */
export function useFilePicker(onPicked: (paths: string[]) => void): () => void {
  const pendingId = useRef('');

  const handler = useRef(onPicked);
  handler.current = onPicked;

  useEffect(() => {
    const off = onHostMessage((data) => {
      const message = data as { type?: string; payload?: Record<string, unknown> };

      if (!message || message.type !== 'context' || !message.payload) {
        return;
      }

      const payload = message.payload;

      if (payload.kind !== 'pickedFiles' || payload.requestId !== pendingId.current) {
        return;
      }

      pendingId.current = '';

      const results = Array.isArray(payload.results) ? (payload.results as string[]) : [];

      if (results.length > 0) {
        handler.current(results);
      }
    });

    return off;
  }, []);

  const pick = useCallback(() => {
    const id = `k${++pickSeq}`;
    pendingId.current = id;
    sendPickFile(id);
  }, []);

  return pick;
}
