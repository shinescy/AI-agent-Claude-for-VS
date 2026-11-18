// 记忆弹窗里的单条记忆：先只读显示，点「编辑」才能改；宿主负责全部校验。

import { useEffect, useRef, useState } from 'react';
import { onHostMessage, sendMemoryFile, sendOpenFile } from '../bridge';
import { useT } from '../LangContext';

interface MemoryFileEditorProps
{
  name: string;
  path: string;
  /** 回到列表。 */
  onBack: () => void;
  /** 删掉之后：回列表并刷新。 */
  onDeleted: () => void;
}

let memorySeq = 0;

/** 记忆的总索引：不是一条记忆，不给删。 */
export function isMemoryIndex(path: string): boolean
{
  const name = path.split(/[\\/]/).pop() ?? '';
  const index = name.toLowerCase() === 'memory.md';
  return index;
}

export function MemoryFileEditor({ name, path, onBack, onDeleted }: MemoryFileEditorProps)
{
  const t = useT();
  const [content, setContent] = useState<string | null>(null);
  const [saved, setSaved] = useState('');
  const [version, setVersion] = useState('');
  const [editable, setEditable] = useState(true);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const requestIdRef = useRef('');
  const opRef = useRef('');

  const onDeletedRef = useRef(onDeleted);
  onDeletedRef.current = onDeleted;

  function send(op: 'read' | 'write' | 'delete', body = '')
  {
    memorySeq += 1;
    const requestId = `memory-${memorySeq}-${Date.now()}`;
    requestIdRef.current = requestId;
    opRef.current = op;
    setBusy(true);
    setError('');
    setNotice('');
    sendMemoryFile(op, path, requestId, body, version);
  }

  useEffect(() =>
  {
    const off = onHostMessage((data) =>
    {
      const message = data as {
        type?: string;
        payload?: { kind?: string; requestId?: string; error?: string; content?: string; version?: string; editable?: boolean };
      };
      const payload = message?.type === 'context' ? message.payload : undefined;

      if (!payload || payload.kind !== 'memoryFile' || payload.requestId !== requestIdRef.current)
      {
        return;
      }

      setBusy(false);

      if (payload.error)
      {
        setError(payload.error);
        return;
      }

      if (opRef.current === 'delete')
      {
        onDeletedRef.current();
        return;
      }

      setContent(payload.content ?? '');
      setSaved(payload.content ?? '');
      setVersion(payload.version ?? '');
      setEditable(payload.editable !== false);

      if (opRef.current === 'write')
      {
        setNotice(t('已保存。'));
        setEditing(false);
      }
    });

    send('read');
    return off;
  }, [path]);

  const dirty = content !== null && content !== saved;
  const deletable = !isMemoryIndex(path);

  /** 放弃没存的改动，回到只读。 */
  function cancelEdit()
  {
    setContent(saved);
    setEditing(false);
  }

  function remove()
  {
    if (!confirmDelete)
    {
      setConfirmDelete(true);
      return;
    }

    setConfirmDelete(false);
    send('delete');
  }

  return (
    <div className="memory-editor">
      <div className="modal-section-title">
        {name}
        <button type="button" className="modal-link" onClick={onBack}>{t('返回列表')}</button>
      </div>

      {error !== '' && <div className="login-error" role="alert">{error}</div>}
      {notice !== '' && <div className="modal-muted" role="status">{notice}</div>}
      {content === null && busy && <p className="modal-muted">{t('正在读取…')}</p>}
      {!editable && <p className="modal-muted">{t('这个文件不是合法的 UTF-8，只能看不能在这里改。')}</p>}

      {content !== null && !editing && (
        <pre className="memory-view" aria-label={t('记忆内容')} tabIndex={0}>{content}</pre>
      )}

      {content !== null && editing && (
        <textarea
          className="login-input rules-input memory-editor-text"
          rows={12}
          value={content}
          aria-label={t('记忆内容')}
          autoFocus
          onChange={(e) => setContent(e.target.value)}
        />
      )}

      {editing && (
        <div className="rules-form-row">
          <button
            type="button"
            className="login-button login-button-primary"
            disabled={busy || !dirty}
            onClick={() => send('write', content ?? '')}
          >
            {t('保存')}
          </button>
          <button type="button" className="login-button" disabled={busy} onClick={cancelEdit}>
            {t('取消')}
          </button>
        </div>
      )}

      {!editing && (
        <div className="rules-form-row">
          <button
            type="button"
            className="login-button login-button-primary"
            disabled={busy || !editable || content === null}
            onClick={() =>
            {
              setNotice('');
              setEditing(true);
            }}
          >
            {t('编辑')}
          </button>
          {deletable && (
            <button type="button" className="login-button" disabled={busy} onClick={remove}>
              {confirmDelete ? t('确认删除') : t('删除')}
            </button>
          )}
          <button type="button" className="login-button" onClick={() => sendOpenFile(path, 0)}>
            {t('在编辑器中打开')}
          </button>
        </div>
      )}
      {!deletable && <p className="modal-muted">{t('MEMORY.md 是记忆的索引，不是一条记忆，不能删。')}</p>}
    </div>
  );
}
