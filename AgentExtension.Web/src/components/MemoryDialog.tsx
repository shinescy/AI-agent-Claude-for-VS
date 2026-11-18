// 记忆弹窗（/memory）：自动记忆开关，会读到的说明文件与自动记忆；↑↓ 选、Enter 开。

import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { MemoryFileEditor } from './MemoryFileEditor';
import { useT } from '../LangContext';
import { useCliDialog } from '../useCliDialog';
import { sendOpenFile, sendOpenMemoryFolder } from '../bridge';
import { ToggleSwitch } from './ToggleSwitch';
import { formatRelativeTime, relativeTime } from '../sessionPicker';

/** CLI get_memory_dialog 回包里用到的部分。 */
export interface MemoryDialogData
{
  auto_memory?: { enabled: boolean; toggleable: boolean; status?: string };
  auto_dream?: { shown?: boolean; enabled: boolean; toggleable: boolean; detail?: string };
  files?: { kind: string; path: string; label: string; description?: string; exists?: boolean }[];
  memories?: { name: string; path: string; description?: string; type?: string; modified_ms?: number }[];
  folders?: { kind: string; path: string; label: string }[];
}

interface MemoryDialogProps
{
  /** 打开原来那个完整的记忆面板。 */
  onOpenFullPanel: () => void;
  onClose: () => void;
}

/** 列表里可选中的行都带这个类，键盘上下在它们之间移焦点。 */
const ROW_SELECTOR = '.memory-row';

export function MemoryDialog({ onOpenFullPanel, onClose }: MemoryDialogProps)
{
  const t = useT();
  const { dialog, error, busy, edit, reload } = useCliDialog<MemoryDialogData>('memory');
  const listRef = useRef<HTMLDivElement>(null);

  // 正在查看或编辑的那条记忆；null 是在看列表
  const [opened, setOpened] = useState<{ name: string; path: string } | null>(null);

  // 回到列表时把焦点放回刚才那一行
  const lastPathRef = useRef('');

  // 捕获阶段接 Esc：看单条时回列表，在列表时关弹窗；都不让它去打断生成。
  const openedRef = useRef(opened);
  openedRef.current = opened;

  useEffect(() =>
  {
    function onKeyDown(e: KeyboardEvent)
    {
      if (e.key !== 'Escape')
      {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      // 正在编辑时第一下 Esc 只离开编辑框，免得没存的改动一下就丢了
      const active = document.activeElement as HTMLElement | null;

      if (openedRef.current !== null && active?.tagName === 'TEXTAREA')
      {
        active.blur();
        return;
      }

      if (openedRef.current !== null)
      {
        setOpened(null);
        reload();
        return;
      }

      onClose();
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onClose, reload]);

  // 数据到了、或从单条回来时，焦点落到列表上，键盘马上能用
  useEffect(() =>
  {
    if (opened !== null || dialog === null)
    {
      return;
    }

    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>(ROW_SELECTOR) ?? []);
    const back = rows.find((row) => row.dataset.path === lastPathRef.current);
    (back ?? rows[0])?.focus();
  }, [opened, dialog]);

  /** ↑↓ Home End 在行之间移焦点；Enter 由按钮自己处理。 */
  function onListKeyDown(e: React.KeyboardEvent<HTMLDivElement>)
  {
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>(ROW_SELECTOR) ?? []);

    if (rows.length === 0)
    {
      return;
    }

    const current = rows.indexOf(document.activeElement as HTMLElement);
    let next = -1;

    switch (e.key)
    {
      case 'ArrowDown':
        next = current < 0 ? 0 : Math.min(rows.length - 1, current + 1);
        break;

      case 'ArrowUp':
        next = current < 0 ? 0 : Math.max(0, current - 1);
        break;

      case 'Home':
        next = 0;
        break;

      case 'End':
        next = rows.length - 1;
        break;

      default:
        return;
    }

    e.preventDefault();
    rows[next].focus();
  }

  function openMemory(name: string, path: string)
  {
    lastPathRef.current = path;
    setOpened({ name, path });
  }

  function backToList()
  {
    setOpened(null);
    reload();
  }

  const autoMemory = dialog?.auto_memory;
  const autoDream = dialog?.auto_dream;
  const files = (dialog?.files ?? []).filter((file) => file.exists !== false);
  const memories = dialog?.memories ?? [];
  const autoFolder = (dialog?.folders ?? []).find((folder) => folder.kind === 'auto');
  const now = Date.now();

  /** 「类型 · 多久以前」，两样都没有就是空串。 */
  function memoryMeta(type?: string, modifiedMs?: number): string
  {
    const parts: string[] = [];

    if (type)
    {
      parts.push(type);
    }

    if (modifiedMs !== undefined && modifiedMs > 0)
    {
      parts.push(formatRelativeTime(relativeTime(modifiedMs, now), t));
    }

    const meta = parts.join(' · ');
    return meta;
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) =>
      {
        if (e.target === e.currentTarget)
        {
          onClose();
        }
      }}
    >
      <div className="modal-card skills-dialog" role="dialog" aria-modal="true" aria-label={t('记忆')}>
        <div className="modal-header">
          <span className="modal-title">{t('记忆')}</span>
          <button type="button" className="modal-close" aria-label={t('关闭')} onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {opened !== null && (
            <MemoryFileEditor
              name={opened.name}
              path={opened.path}
              onBack={backToList}
              onDeleted={() =>
              {
                lastPathRef.current = '';
                backToList();
              }}
            />
          )}

          {opened === null && (
          <>
          {error !== '' && <div className="login-error" role="alert">{error}</div>}
          {dialog === null && busy && <p className="modal-muted">{t('正在读取…')}</p>}

          {autoMemory && (
            <div className="memory-toggle">
              <div className="skills-main">
                <div className="skills-name">{t('自动记忆')}</div>
                <div className="skills-meta">{t('Claude 自己记下项目里值得记住的事，下次会话自动读到')}</div>
              </div>
              <ToggleSwitch
                checked={autoMemory.enabled}
                disabled={busy || !autoMemory.toggleable}
                label={t('自动记忆')}
                onChange={(next) => edit({ autoMemoryEnabled: next })}
              />
            </div>
          )}

          {autoDream && autoDream.shown !== false && (
            <div className="memory-toggle">
              <div className="skills-main">
                <div className="skills-name">{t('自动整理记忆')}</div>
                {autoDream.detail && <div className="skills-meta">{autoDream.detail}</div>}
              </div>
              <ToggleSwitch
                checked={autoDream.enabled}
                disabled={busy || !autoDream.toggleable}
                label={t('自动整理记忆')}
                onChange={(next) => edit({ autoDreamEnabled: next })}
              />
            </div>
          )}

          <div className="memory-list" ref={listRef} onKeyDown={onListKeyDown}>
            {files.length > 0 && <div className="modal-section-title">{t('说明文件')}</div>}
            {files.map((file) => (
              <button
                type="button"
                className="memory-row"
                key={file.path}
                data-path={file.path}
                title={file.path}
                onClick={() =>
                {
                  lastPathRef.current = file.path;
                  sendOpenFile(file.path, 0);
                }}
              >
                <span className="memory-row-main">
                  <span className="memory-row-name">{file.label}</span>
                  <span className="memory-row-desc">{file.description || file.path}</span>
                </span>
              </button>
            ))}

            <div className="modal-section-title">{t('自动记忆')}</div>
            {dialog !== null && memories.length === 0 && <p className="modal-muted">{t('还没有自动记下的内容。')}</p>}
            {memories.map((memory) => {
              const meta = memoryMeta(memory.type, memory.modified_ms);

              return (
                <button
                  type="button"
                  className="memory-row"
                  key={memory.path}
                  data-path={memory.path}
                  onClick={() => openMemory(memory.name, memory.path)}
                >
                  <span className="memory-row-main">
                    <span className="memory-row-name">{memory.name}</span>
                    {memory.description && <span className="memory-row-desc">{memory.description}</span>}
                  </span>
                  {meta !== '' && <span className="memory-row-meta">{meta}</span>}
                </button>
              );
            })}

            {autoFolder && (
              <button
                type="button"
                className="memory-row memory-row-folder"
                data-path={autoFolder.path}
                title={autoFolder.path}
                onClick={() => sendOpenMemoryFolder()}
              >
                <span className="memory-row-main">
                  <span className="memory-row-name">📁 {t('打开记忆文件夹')}</span>
                  <span className="memory-row-desc">{autoFolder.path}</span>
                </span>
              </button>
            )}
          </div>

          <div className="memory-footer">
            <span className="memory-keys">{t('↑↓ 选择 · Enter 打开 · Esc 关闭')}</span>
            <button type="button" className="modal-link" onClick={onOpenFullPanel}>
              {t('查看完整的记忆面板')}
            </button>
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
