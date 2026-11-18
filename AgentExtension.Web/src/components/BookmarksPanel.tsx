// 书签侧栏：收藏的回复列成清单，点开看全文，能跳回对话里的原位置。

import { useContext, useState } from 'react';
import type React from 'react';
import type { Bookmark } from '../bookmarks';
import { LangContext, useT } from '../LangContext';
import { formatFull } from '../timeFormat';
import { Markdown } from './Markdown';

interface BookmarksPanelProps
{
  bookmarks: Bookmark[];
  /** 滚到对话里那条回复；找不到返回 false。 */
  onReveal: (id: string) => boolean;
  onRemove: (id: string) => void;
  onClose: () => void;
}

/** 预览取前几行，去掉 markdown 标记符号。 */
function preview(text: string): string
{
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ⟨code⟩ ')
    .replace(/[#>*_`]/g, '')
    .trim();
  return plain;
}

export function BookmarksPanel({ bookmarks, onReveal, onRemove, onClose }: BookmarksPanelProps)
{
  const t = useT();
  const lang = useContext(LangContext);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  const opened = bookmarks.find((item) => item.id === openedId) ?? null;

  /** Esc 只关侧栏，不往外传去打断生成。 */
  function onKeyDown(e: React.KeyboardEvent<HTMLElement>)
  {
    if (e.key === 'Escape')
    {
      e.preventDefault();
      e.stopPropagation();

      if (opened !== null)
      {
        setOpenedId(null);
        return;
      }

      onClose();
    }
  }

  function open(id: string)
  {
    setOpenedId(id);
    setMissing(false);
  }

  function reveal(id: string)
  {
    const found = onReveal(id);
    setMissing(!found);
  }

  return (
    <aside className="side-panel" aria-label={t('书签')} onKeyDown={onKeyDown}>
      <div className="side-panel-header">
        <span className="side-panel-title">
          {t('书签')}{bookmarks.length > 0 ? ` (${bookmarks.length})` : ''}
        </span>
        <button type="button" className="modal-close" aria-label={t('关闭')} onClick={onClose}>✕</button>
      </div>

      <div className="side-panel-body">
        {opened === null && bookmarks.length === 0 && (
          <p className="modal-muted">{t('还没有书签。把鼠标移到 Claude 的回复上，点下面的 ☆ 就能收藏。')}</p>
        )}

        {opened === null && bookmarks.length > 0 && (
          <ul className="bookmark-list">
            {bookmarks.map((item) => (
              <li key={item.id}>
                <button type="button" className="bookmark-item" onClick={() => open(item.id)}>
                  <div className="bookmark-preview">{preview(item.text)}</div>
                  {item.at > 0 && <div className="bookmark-meta">{formatFull(item.at, lang)}</div>}
                </button>
              </li>
            ))}
          </ul>
        )}

        {opened !== null && (
          <>
            <div className="bookmark-detail-actions">
              <button type="button" className="modal-link" onClick={() => setOpenedId(null)}>{t('返回列表')}</button>
              <button type="button" className="login-button" onClick={() => reveal(opened.id)}>{t('在对话中显示')}</button>
              <button
                type="button"
                className="login-button"
                onClick={() =>
                {
                  onRemove(opened.id);
                  setOpenedId(null);
                }}
              >
                {t('移除书签')}
              </button>
            </div>
            {missing && (
              <p className="modal-muted" role="status">{t('这条回复不在当前加载的记录里（接回会话时只回放最近一段）。')}</p>
            )}
            {opened.at > 0 && <div className="bookmark-meta">{formatFull(opened.at, lang)}</div>}
            <Markdown text={opened.text} />
          </>
        )}
      </div>
    </aside>
  );
}
