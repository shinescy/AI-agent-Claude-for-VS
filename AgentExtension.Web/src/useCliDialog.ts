// 设置弹窗（记忆 / 沙箱）共用：打开时读一次，改设置后用回包刷新。

import { useEffect, useRef, useState } from 'react';
import { onHostMessage, sendCliDialog, sendCliEdit } from './bridge';

let cliSeq = 0;

export interface CliDialogState<T>
{
  /** CLI 回的弹窗数据；还没到为 null。 */
  dialog: T | null;
  error: string;
  busy: boolean;
  /** 提交一项修改。 */
  edit: (change: Record<string, unknown>) => void;
  /** 重新读一次（别处改了数据之后）。 */
  reload: () => void;
}

export function useCliDialog<T>(name: string): CliDialogState<T>
{
  const [dialog, setDialog] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const requestIdRef = useRef('');

  function nextId(): string
  {
    cliSeq += 1;
    const requestId = `cli-${name}-${cliSeq}-${Date.now()}`;
    requestIdRef.current = requestId;
    return requestId;
  }

  useEffect(() =>
  {
    const off = onHostMessage((data) =>
    {
      const message = data as {
        type?: string;
        payload?: { kind?: string; requestId?: string; dialog?: string; error?: string };
      };
      const payload = message?.type === 'context' ? message.payload : undefined;

      if (!payload || payload.kind !== 'cliDialog' || payload.requestId !== requestIdRef.current)
      {
        return;
      }

      setBusy(false);
      setError(payload.error ?? '');

      if (payload.dialog)
      {
        try
        {
          setDialog(JSON.parse(payload.dialog) as T);
        }
        catch
        {
          setError('设置数据格式不对，读不了。');
        }
      }
    });

    sendCliDialog(name, nextId());
    return off;
  }, [name]);

  function edit(change: Record<string, unknown>)
  {
    if (busy)
    {
      return;
    }

    setBusy(true);
    setError('');
    sendCliEdit(name, change, nextId());
  }

  function reload()
  {
    setBusy(true);
    sendCliDialog(name, nextId());
  }

  return { dialog, error, busy, edit, reload };
}
