// 会话小弹层：搜索框 + 会话列表，选中即接回。

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import type { PanelItemView } from '../panelState';
import { useT } from '../LangContext';
import { filterSessions, sessionTimeLabel } from '../sessionPicker';

/** 弹层离触发按钮与视口边缘的距离。 */
const ANCHOR_GAP = 4;
const EDGE_GAP = 16;

/** 触发按钮的位置；只用到这四条边。 */
export interface AnchorRect {
  left: number;
  right: number;
  bottom: number;
  width: number;
}

interface SessionPickerProps {
  items: PanelItemView[];
  /** 请求进行中：列表是空的，不能据此说「没有会话」。 */
  loading: boolean;
  /** 取数出错的原因；空串是正常。 */
  error: string;
  /** 当前会话 id：高亮它，选中它只关弹层。 */
  currentSessionId: string;
  /** 触发按钮的位置；不给就居中靠上。 */
  anchor: AnchorRect | null;
  /** 选中一条别的会话。 */
  onPick: (sessionId: string) => void;
  /** 打开整屏的会话面板（分叉等操作在那里）。 */
  onShowAll: () => void;
  onClose: () => void;
  /** 会话面板的本地动作：改名、存档、取消存档。 */
  onAction: (actionId: string, values: string[]) => void;
}

/** 宿主标的已存档。 */
export function isArchived(item: PanelItemView): boolean {
  return item.fields['archived'] === '1';
}

/** 开着的会话不给改名：CLI 正往同一份转录里写。 */
export function canRename(item: PanelItemView, currentSessionId: string): boolean {
  const isCurrent = currentSessionId !== '' && item.id === currentSessionId;
  return !isCurrent && item.fields['live'] !== '1';
}

/** 锚在按钮下方：按钮在左半边就左对齐，否则右对齐。 */
export function anchoredStyle(anchor: AnchorRect, viewportWidth: number): CSSProperties {
  const top = anchor.bottom + ANCHOR_GAP;
  const center = anchor.left + anchor.width / 2;

  if (center < viewportWidth / 2)
  {
    const leftStyle: CSSProperties = { position: 'fixed', top, left: Math.max(EDGE_GAP, anchor.left) };
    return leftStyle;
  }

  const rightStyle: CSSProperties = {
    position: 'fixed', top, right: Math.max(EDGE_GAP, viewportWidth - anchor.right),
  };
  return rightStyle;
}

/** 把标题里命中的那一段标出来。 */
function highlightTitle(title: string, query: string): ReactNode {
  const q = query.trim().toLowerCase();
  const at = q === '' ? -1 : title.toLowerCase().indexOf(q);

  if (at < 0)
  {
    return title;
  }

  return (
    <>
      {title.slice(0, at)}
      <mark className="session-pick-mark">{title.slice(at, at + q.length)}</mark>
      {title.slice(at + q.length)}
    </>
  );
}

export function SessionPicker(props: SessionPickerProps) {
  const { items, loading, error, currentSessionId, anchor, onPick, onShowAll, onClose, onAction } = props;
  const t = useT();

  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [showArchived, setShowArchived] = useState(false);

  // 正在改名的会话；空串是没在改
  const [editingId, setEditingId] = useState('');
  const [draft, setDraft] = useState('');
  const editingRef = useRef('');
  editingRef.current = editingId;

  // 打开那一刻的时间：相对时间只在渲染时算，不定时刷新。
  const [nowMs] = useState(() => Date.now());

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const queryRef = useRef('');
  queryRef.current = query;

  const matched = filterSessions(items, query);
  const archivedCount = matched.filter(isArchived).length;
  const shown = showArchived ? matched : matched.filter((item) => !isArchived(item));
  const active = Math.min(highlight, Math.max(0, shown.length - 1));

  useEffect(() =>
  {
    // 关闭后把焦点还给打开前的那个元素。
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();

    return () =>
    {
      if (previous !== null && previous.isConnected)
      {
        previous.focus();
      }
    };
  }, []);

  useEffect(() =>
  {
    setHighlight(0);
  }, [query]);

  useEffect(() =>
  {
    const row = listRef.current?.querySelector<HTMLElement>('.session-pick-row.is-highlighted');
    row?.scrollIntoView?.({ block: 'nearest' });
  }, [active, shown.length]);

  // 捕获阶段接 Esc：先清搜索再关闭，不让它传去打断生成。
  useEffect(() =>
  {
    function onKeyDown(e: globalThis.KeyboardEvent)
    {
      if (e.key !== 'Escape' || e.isComposing)
      {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      // 改名中的 Esc 只取消改名
      if (editingRef.current !== '')
      {
        endEdit();
        return;
      }

      if (queryRef.current !== '')
      {
        setQuery('');
        return;
      }

      onClose();
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  function startEdit(item: PanelItemView)
  {
    setDraft(item.title);
    setEditingId(item.id);
  }

  function endEdit()
  {
    setEditingId('');
    inputRef.current?.focus();
  }

  function commitEdit(item: PanelItemView)
  {
    const title = draft.trim();

    if (title !== '' && title !== item.title)
    {
      onAction('session.rename', [item.id, title]);
    }

    endEdit();
  }

  function toggleArchive(item: PanelItemView)
  {
    if (isArchived(item))
    {
      onAction('session.unarchive', [item.id]);
      return;
    }

    onAction('session.archive', [item.id]);
  }

  function choose(item: PanelItemView)
  {
    if (currentSessionId !== '' && item.id === currentSessionId)
    {
      onClose();
      return;
    }

    onPick(item.id);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>)
  {
    // 输入法组字中的按键归输入法。
    if (e.nativeEvent.isComposing || e.keyCode === 229)
    {
      return;
    }

    if (e.key === 'ArrowDown')
    {
      e.preventDefault();
      setHighlight(Math.min(active + 1, Math.max(0, shown.length - 1)));
      return;
    }

    if (e.key === 'ArrowUp')
    {
      e.preventDefault();
      setHighlight(Math.max(active - 1, 0));
      return;
    }

    if (e.key === 'Enter')
    {
      e.preventDefault();

      // 按住不放的重复触发不算。
      if (!e.repeat && shown.length > 0)
      {
        choose(shown[active]);
      }
    }
  }

  function emptyText(): string
  {
    if (loading)
    {
      return t('正在读取会话…');
    }

    if (error !== '' || shown.length > 0)
    {
      return '';
    }

    return query.trim() === '' ? t('这个目录下还没有历史会话。') : t('没有找到会话');
  }

  const empty = emptyText();
  const style = anchor === null ? undefined : anchoredStyle(anchor, window.innerWidth);
  const activeId = shown.length > 0 ? `session-pick-${shown[active].id}` : undefined;

  return (
    <div
      className={'session-pick-overlay' + (anchor === null ? ' is-centered' : '')}
      onMouseDown={(e) =>
      {
        if (e.target === e.currentTarget)
        {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="session-pick" role="dialog" aria-label={t('会话历史')} style={style}>
        <div className="session-pick-search">
          <svg className="session-pick-search-icon" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M10.5 10.5 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="session-pick-input"
            placeholder={t('搜索会话…')}
            aria-label={t('搜索会话…')}
            aria-controls="session-pick-list"
            aria-activedescendant={activeId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div id="session-pick-list" className="session-pick-list" role="listbox" ref={listRef}>
          {empty !== '' && <div className="session-pick-empty">{empty}</div>}
          {error !== '' && <div className="session-pick-empty session-pick-error" role="alert">{error}</div>}

          {shown.map((item, index) =>
          {
            const isCurrent = currentSessionId !== '' && item.id === currentSessionId;
            const archived = isArchived(item);
            const editing = editingId === item.id;
            const className = 'session-pick-row'
              + (index === active ? ' is-highlighted' : '')
              + (isCurrent ? ' is-current' : '')
              + (archived ? ' is-archived' : '');

            return (
              <div
                key={item.id}
                id={`session-pick-${item.id}`}
                role="option"
                aria-selected={index === active}
                aria-current={isCurrent ? 'true' : undefined}
                className={className}
                // 不让点击把焦点从搜索框带走。
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => setHighlight(index)}
                onClick={() =>
                {
                  if (!editing)
                  {
                    choose(item);
                  }
                }}
              >
                {editing ? (
                  <input
                    type="text"
                    className="session-pick-rename"
                    aria-label={t('新名字')}
                    title={t('回车保存，Esc 取消')}
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={endEdit}
                    onKeyDown={(e) =>
                    {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229)
                      {
                        e.preventDefault();
                        commitEdit(item);
                      }
                    }}
                  />
                ) : (
                  <span className="session-pick-title" title={item.title}>
                    {highlightTitle(item.title, query)}
                  </span>
                )}
                {isCurrent && <span className="session-pick-badge">{t('当前会话')}</span>}
                {archived && !editing && <span className="session-pick-badge is-muted">{t('已存档')}</span>}
                {!editing && (
                  <span className="session-pick-tools">
                    {canRename(item, currentSessionId) && (
                      <button
                        type="button"
                        className="session-pick-tool"
                        aria-label={t('重命名')}
                        title={t('重命名')}
                        onClick={(e) =>
                        {
                          e.stopPropagation();
                          startEdit(item);
                        }}
                      >
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                          <path d="M3 13h2.5L13 5.5 10.5 3 3 10.5V13z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                        </svg>
                      </button>
                    )}
                    {!isCurrent && (
                      <button
                        type="button"
                        className="session-pick-tool"
                        aria-label={archived ? t('取消存档') : t('存档')}
                        title={archived ? t('取消存档') : t('存档：从列表收起，不删除')}
                        onClick={(e) =>
                        {
                          e.stopPropagation();
                          toggleArchive(item);
                        }}
                      >
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                          <rect x="2" y="3" width="12" height="3" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                          <path d="M3 6v7h10V6M6.5 8.5h3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                      </button>
                    )}
                  </span>
                )}
                <span className="session-pick-time" title={item.subtitle}>
                  {sessionTimeLabel(item, nowMs, t)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="session-pick-footer">
          {(archivedCount > 0 || showArchived) && (
            <label className="session-pick-archived-toggle">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              {t('显示已存档（{n}）', { n: archivedCount })}
            </label>
          )}
          <button
            type="button"
            className="session-pick-all"
            title={t('打开完整的会话面板：分叉、查看大小与会话 id')}
            onClick={onShowAll}
          >
            {t('全部会话…')}
          </button>
        </div>
      </div>
    </div>
  );
}
