// 会话管理弹窗：分组、筛选、活动、搜索、改名、存档、接回。

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import type { PanelItemView, SessionGroupView } from '../panelState';
import { useT } from '../LangContext';
import { sessionTimeLabel } from '../sessionPicker';
import {
  CLOUD_STATUS_TEXT, UNGROUPED_KEY, activeCount, bucketByGroup, isArchived, isLive, parseCloudSessionInput,
  visibleSessions,
} from '../sessionManager';
import type { SessionBucket } from '../sessionManager';

/** 拖动时放在 dataTransfer 里的类型，只认自己拖出来的会话。 */
const DRAG_TYPE = 'application/x-agent-session';

/** 「移到组」菜单要占的高度，与样式里的 max-height 对应。 */
const MENU_ROOM = 190;

interface SessionManagerProps {
  items: PanelItemView[];
  groups: SessionGroupView[];
  /** 当前会话 id：不能接回自己，也不给改名、存档。 */
  currentSessionId: string;
  error?: string;
  /** 请求进行中：列表是空的，不能据此说「没有会话」。 */
  loading?: boolean;
  onResume: (sessionId: string, fork: boolean) => void;
  /** 丢掉当前会话、开一条干净的。 */
  onNewSession: () => void;
  /** 会话面板的本地动作，id 与 C# 目录逐字一致。 */
  onAction: (actionId: string, values: string[]) => void;

  /** 网页会话那一页的数据；不给就没有「Web」页签。 */
  cloud?: CloudSessionsView;
  /** 去读一次网页会话（CLI 用它自己的登录读）。 */
  onLoadCloud?: () => void;
  /** 把一条网页会话拉回本机；value 是 id 或链接。 */
  onTeleport?: (value: string) => void;
  /** 在浏览器里打开一条网页会话。 */
  onOpenWeb?: (url: string) => void;
}

/** 网页会话列表的状态。 */
export interface CloudSessionsView {
  loading: boolean;
  items: PanelItemView[];
  /** 读不了的原因；空串是正常。 */
  error: string;
}

/** 外壳按 Esc 时先问这里：正在改名或开着菜单就只收掉它。 */
export interface SessionManagerHandle {
  handleEscape: () => boolean;
}

/** 正在原地输入的东西。 */
type Editing =
  | { kind: 'none' }
  | { kind: 'session'; id: string }
  | { kind: 'group'; id: string }
  | { kind: 'newGroup' };

const NOT_EDITING: Editing = { kind: 'none' };

export const SessionManager = forwardRef<SessionManagerHandle, SessionManagerProps>(function SessionManager(props, ref) {
  const {
    items, groups, currentSessionId, error = '', loading = false, onResume, onNewSession, onAction,
    cloud, onLoadCloud, onTeleport, onOpenWeb,
  } = props;
  const t = useT();

  const [tab, setTab] = useState<'local' | 'web'>('local');
  const [linkDraft, setLinkDraft] = useState('');
  const [linkError, setLinkError] = useState(false);
  // 点过一次「拉回本机」、等第二次确认的网页会话 id
  const [confirmTeleport, setConfirmTeleport] = useState('');
  const cloudRequested = useRef(false);

  // 第一次切到 Web 才去读：要起一个 CLI 短进程、走网络，不该每次开弹窗都跑
  useEffect(() =>
  {
    if (tab === 'web' && !cloudRequested.current && onLoadCloud !== undefined)
    {
      cloudRequested.current = true;
      onLoadCloud();
    }
  }, [tab, onLoadCloud]);

  const [query, setQuery] = useState('');
  const [onlyActive, setOnlyActive] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showProbes, setShowProbes] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Editing>(NOT_EDITING);
  const [draft, setDraft] = useState('');

  // 开着「移到组」菜单的会话 id；空串是没开
  const [moveMenuFor, setMoveMenuFor] = useState('');
  // 底下放不下时菜单向上弹，不然被弹窗下沿裁掉
  const [moveMenuUp, setMoveMenuUp] = useState(false);
  // 点过一次删除、等第二次确认的组 id
  const [confirmDelete, setConfirmDelete] = useState('');
  // 拖动中悬在哪个组上；null 是没在拖
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // 打开那一刻的时间：相对时间只在渲染时算，不定时刷新。
  const [nowMs] = useState(() => Date.now());

  useImperativeHandle(ref, () => ({
    handleEscape: () =>
    {
      if (editing.kind !== 'none')
      {
        setEditing(NOT_EDITING);
        return true;
      }

      if (moveMenuFor !== '' || filterOpen)
      {
        setMoveMenuFor('');
        setFilterOpen(false);
        return true;
      }

      return false;
    },
  }), [editing, moveMenuFor, filterOpen]);

  const shown = visibleSessions(items, { query, onlyActive, showArchived, showProbes });
  const narrowed = query.trim() !== '' || onlyActive;
  const buckets = bucketByGroup(shown, groups)
    // 搜索或只看活动时，空组只会碍眼；平时留着当拖放目标
    .filter((bucket) => !narrowed || bucket.items.length > 0);

  function startEdit(next: Editing, initial: string)
  {
    setDraft(initial);
    setEditing(next);
    setMoveMenuFor('');
  }

  function commitEdit()
  {
    const text = draft.trim();
    const current = editing;
    setEditing(NOT_EDITING);

    if (text === '')
    {
      return;
    }

    if (current.kind === 'session')
    {
      const before = items.find((item) => item.id === current.id)?.title ?? '';

      if (text !== before)
      {
        onAction('session.rename', [current.id, text]);
      }

      return;
    }

    if (current.kind === 'group')
    {
      const before = groups.find((group) => group.id === current.id)?.name ?? '';

      if (text !== before)
      {
        onAction('session.group.rename', [current.id, text]);
      }

      return;
    }

    if (current.kind === 'newGroup')
    {
      onAction('session.group.create', [text]);
    }
  }

  function editKeyDown(e: KeyboardEvent<HTMLInputElement>)
  {
    // 输入法组字中的回车归输入法。
    if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229)
    {
      e.preventDefault();
      e.stopPropagation();
      commitEdit();
    }
  }

  function moveTo(sessionId: string, groupKey: string)
  {
    setMoveMenuFor('');

    if (groupKey === UNGROUPED_KEY)
    {
      onAction('session.group.ungroup', [sessionId]);
      return;
    }

    onAction('session.group.move', [sessionId, groupKey]);
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

  function deleteGroup(groupId: string)
  {
    if (confirmDelete !== groupId)
    {
      setConfirmDelete(groupId);
      return;
    }

    setConfirmDelete('');
    onAction('session.group.delete', [groupId]);
  }

  function isSessionDrag(e: DragEvent): boolean
  {
    return Array.from(e.dataTransfer.types).includes(DRAG_TYPE);
  }

  function handleDrop(e: DragEvent, groupKey: string)
  {
    const sessionId = e.dataTransfer.getData(DRAG_TYPE);
    setDropTarget(null);

    if (sessionId === '')
    {
      return;
    }

    e.preventDefault();
    const from = items.find((item) => item.id === sessionId)?.fields['group'] ?? UNGROUPED_KEY;

    // 拖回原来的组不算动作
    if (from !== groupKey)
    {
      moveTo(sessionId, groupKey);
    }
  }

  function emptyText(): string
  {
    if (loading || error !== '' || shown.length > 0)
    {
      return '';
    }

    if (items.length === 0)
    {
      return t('这个目录下还没有历史会话。');
    }

    return narrowed ? t('没有找到会话') : t('这里的会话都被筛掉了，看看「筛选」里的开关。');
  }

  function renderRow(item: PanelItemView)
  {
    const isCurrent = currentSessionId !== '' && item.id === currentSessionId;
    const archived = isArchived(item);
    const live = isLive(item);
    const renaming = editing.kind === 'session' && editing.id === item.id;
    const inGroup = item.fields['group'] ?? UNGROUPED_KEY;
    const detail = [item.subtitle, item.fields['branch'], item.fields['size'], item.id]
      .filter((part) => (part ?? '') !== '')
      .join('  ·  ');

    return (
      <div
        key={item.id}
        className={'session-mgr-row' + (archived ? ' is-archived' : '') + (isCurrent ? ' is-current' : '')}
        role="button"
        tabIndex={0}
        aria-label={item.title}
        aria-current={isCurrent ? 'true' : undefined}
        title={detail}
        draggable={!renaming}
        onDragStart={(e) =>
        {
          e.dataTransfer.setData(DRAG_TYPE, item.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragEnd={() => setDropTarget(null)}
        onClick={() =>
        {
          if (!renaming && !isCurrent)
          {
            onResume(item.id, false);
          }
        }}
        onKeyDown={(e) =>
        {
          if (e.key === 'Enter' && e.target === e.currentTarget && !isCurrent)
          {
            onResume(item.id, false);
          }
        }}
      >
        {renaming ? (
          <input
            type="text"
            className="session-mgr-edit"
            aria-label={t('新名字')}
            title={t('回车保存，Esc 取消')}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => setEditing(NOT_EDITING)}
            onKeyDown={editKeyDown}
          />
        ) : (
          <span className="session-mgr-title">{item.title}</span>
        )}

        {isCurrent && <span className="session-mgr-badge is-accent">{t('当前会话')}</span>}
        {!isCurrent && live && <span className="session-mgr-badge">{t('进行中')}</span>}
        {archived && <span className="session-mgr-badge">{t('已存档')}</span>}

        {!renaming && (
          <span className="session-mgr-tools" onClick={(e) => e.stopPropagation()}>
            {!isCurrent && !live && (
              <button
                type="button"
                className="session-mgr-tool"
                aria-label={t('重命名')}
                title={t('重命名')}
                onClick={() => startEdit({ kind: 'session', id: item.id }, item.title)}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 13h2.5L13 5.5 10.5 3 3 10.5V13z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
              </button>
            )}

            <span className="session-mgr-move">
              <button
                type="button"
                className="session-mgr-tool"
                aria-label={t('移到组')}
                aria-haspopup="menu"
                aria-expanded={moveMenuFor === item.id}
                title={t('移到组（也可以直接拖到组名上）')}
                onClick={(e) =>
                {
                  const body = e.currentTarget.closest('.session-mgr')?.parentElement;
                  const floor = body ? body.getBoundingClientRect().bottom : window.innerHeight;

                  setMoveMenuUp(e.currentTarget.getBoundingClientRect().bottom + MENU_ROOM > floor);
                  setMoveMenuFor(moveMenuFor === item.id ? '' : item.id);
                }}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M2 4.5h4l1.2 1.5H14v6.5H2z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
              </button>

              {moveMenuFor === item.id && (
                <div className={'session-mgr-menu' + (moveMenuUp ? ' is-up' : '')} role="menu">
                  {groups.length === 0 && (
                    <div className="session-mgr-menu-empty">{t('还没有组，先点上面的「新建组」。')}</div>
                  )}
                  {groups.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      role="menuitem"
                      className="session-mgr-menu-item"
                      disabled={group.id === inGroup}
                      onClick={() => moveTo(item.id, group.id)}
                    >
                      {group.name}
                    </button>
                  ))}
                  {inGroup !== UNGROUPED_KEY && (
                    <button
                      type="button"
                      role="menuitem"
                      className="session-mgr-menu-item"
                      onClick={() => moveTo(item.id, UNGROUPED_KEY)}
                    >
                      {t('未分组')}
                    </button>
                  )}
                </div>
              )}
            </span>

            {!isCurrent && (
              <button
                type="button"
                className="session-mgr-tool"
                aria-label={archived ? t('取消存档') : t('存档')}
                title={archived ? t('取消存档') : t('存档：从列表收起，不删除')}
                onClick={() => toggleArchive(item)}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <rect x="2" y="3" width="12" height="3" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M3 6v7h10V6M6.5 8.5h3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            )}

            {!isCurrent && (
              <button
                type="button"
                className="session-mgr-tool"
                aria-label={t('开分支')}
                title={t('拿到它的上下文，但写进一条新会话，原记录不被追写')}
                onClick={() => onResume(item.id, true)}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx="4.5" cy="3.5" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  <circle cx="4.5" cy="12.5" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  <circle cx="11.5" cy="5.5" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M4.5 5v6M11.5 7c0 2.5-7 1.5-7 4" fill="none" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>
            )}
          </span>
        )}

        <span className="session-mgr-time">{sessionTimeLabel(item, nowMs, t)}</span>
      </div>
    );
  }

  function renderBucket(bucket: SessionBucket)
  {
    const key = bucket.group === null ? UNGROUPED_KEY : bucket.group.id;
    const name = bucket.group === null ? t('未分组') : bucket.group.name;
    const isCollapsed = collapsed[key] === true;
    const renaming = editing.kind === 'group' && editing.id === key;

    return (
      <section
        key={key === UNGROUPED_KEY ? 'ungrouped' : key}
        className={'session-mgr-group' + (dropTarget === key ? ' is-drop-target' : '')}
        aria-label={name}
        onDragOver={(e) =>
        {
          if (isSessionDrag(e))
          {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDropTarget(key);
          }
        }}
        onDrop={(e) => handleDrop(e, key)}
      >
        <div className="session-mgr-group-head">
          {renaming ? (
            <input
              type="text"
              className="session-mgr-edit"
              aria-label={t('组名')}
              title={t('回车保存，Esc 取消')}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => setEditing(NOT_EDITING)}
              onKeyDown={editKeyDown}
            />
          ) : (
            <button
              type="button"
              className="session-mgr-group-toggle"
              aria-expanded={!isCollapsed}
              onClick={() => setCollapsed({ ...collapsed, [key]: !isCollapsed })}
            >
              <svg className={isCollapsed ? 'is-collapsed' : ''} viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="session-mgr-group-name">{name}</span>
              <span className="session-mgr-count">{bucket.items.length}</span>
            </button>
          )}

          {bucket.group !== null && !renaming && (
            <span className="session-mgr-tools">
              <button
                type="button"
                className="session-mgr-tool"
                aria-label={t('改组名')}
                title={t('改组名')}
                onClick={() => startEdit({ kind: 'group', id: key }, name)}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 13h2.5L13 5.5 10.5 3 3 10.5V13z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                className={'session-mgr-tool' + (confirmDelete === key ? ' is-confirming' : '')}
                aria-label={t('删除组')}
                title={t('删除这个组：里面的会话回到「未分组」，会话本身不删')}
                onClick={() => deleteGroup(key)}
                onMouseLeave={() => setConfirmDelete('')}
                onBlur={() => setConfirmDelete('')}
              >
                {confirmDelete === key ? t('确定?') : (
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            </span>
          )}
        </div>

        {!isCollapsed && bucket.items.map(renderRow)}
        {!isCollapsed && bucket.items.length === 0 && bucket.group !== null && (
          <div className="session-mgr-group-empty">{t('空的。把会话拖进来，或用会话上的「移到组」。')}</div>
        )}
      </section>
    );
  }

  const active = activeCount(items);

  function submitLink()
  {
    const id = parseCloudSessionInput(linkDraft);

    if (id === '')
    {
      setLinkError(true);
      return;
    }

    onTeleport?.(linkDraft.trim());
  }

  function teleportRow(id: string)
  {
    // 拉回本机会重起终端、切分支，点两次才算
    if (confirmTeleport !== id)
    {
      setConfirmTeleport(id);
      return;
    }

    setConfirmTeleport('');
    onTeleport?.(id);
  }

  function renderCloudRow(item: PanelItemView)
  {
    const status = item.fields['status'] ?? '';
    const where = [item.fields['repo'], item.fields['branch']].filter((part) => (part ?? '') !== '').join(' · ');

    return (
      <div key={item.id} className="session-mgr-row session-mgr-cloud-row" title={[item.subtitle, where, item.id].filter((x) => x !== '').join('  ·  ')}>
        <span className="session-mgr-title">{item.title}</span>
        {where !== '' && <span className="session-mgr-where">{where}</span>}
        {status !== '' && <span className="session-mgr-badge">{t(CLOUD_STATUS_TEXT[status] ?? status)}</span>}

        <span className="session-mgr-tools">
          <button
            type="button"
            className="session-mgr-tool session-mgr-tool-text"
            title={t('在浏览器里打开这条网页会话')}
            onClick={() => onOpenWeb?.(`https://claude.ai/code/${item.id}`)}
          >
            {t('网页打开')}
          </button>
          <button
            type="button"
            className={'session-mgr-tool session-mgr-tool-text' + (confirmTeleport === item.id ? ' is-confirming' : '')}
            title={t('在终端里把它拉回本机继续：会重起终端，并切到那条会话的分支')}
            onClick={() => teleportRow(item.id)}
            onMouseLeave={() => setConfirmTeleport('')}
            onBlur={() => setConfirmTeleport('')}
          >
            {confirmTeleport === item.id ? t('确定?') : t('拉回本机')}
          </button>
        </span>

        <span className="session-mgr-time">{sessionTimeLabel(item, nowMs, t)}</span>
      </div>
    );
  }

  function renderWeb(view: CloudSessionsView)
  {
    const truncated = view.items.some((item) => item.fields['truncated'] === '1');

    return (
      <>
        <div className="session-mgr-bar">
          <input
            type="text"
            className={'session-mgr-search' + (linkError ? ' is-invalid' : '')}
            placeholder={t('贴 claude.ai/code 的会话链接或会话 id')}
            aria-label={t('网页会话的链接或 id')}
            aria-invalid={linkError}
            value={linkDraft}
            onChange={(e) =>
            {
              setLinkDraft(e.target.value);
              setLinkError(false);
            }}
            onKeyDown={(e) =>
            {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229)
              {
                e.preventDefault();
                e.stopPropagation();
                submitLink();
              }
            }}
          />
          <button
            type="button"
            className="session-mgr-bar-button"
            disabled={linkDraft.trim() === ''}
            title={t('在终端里把它拉回本机继续：会重起终端，并切到那条会话的分支')}
            onClick={submitLink}
          >
            {t('接回')}
          </button>
          <button
            type="button"
            className="session-mgr-bar-button"
            disabled={view.loading}
            onClick={() => onLoadCloud?.()}
          >
            {t('刷新')}
          </button>
        </div>

        {linkError && (
          <div className="panel-row-error" role="alert">
            {t('这不是网页会话的 id 或 claude.ai/code 的链接。')}
          </div>
        )}

        <div className="panel-hint">
          {t('网页会话由 CLI 用它自己的登录读取。拉回本机只能在终端里进行：当前目录要是那条会话所在仓库的检出，CLI 会切到它的分支；拉回后它就是一条普通的本地会话。')}
        </div>

        {view.loading && <div className="panel-empty">{t('正在读取网页会话…')}</div>}
        {!view.loading && view.error !== '' && (
          <div className="panel-row-error" role="alert">{view.error}</div>
        )}
        {!view.loading && view.error === '' && view.items.length === 0 && (
          <div className="panel-empty">{t('账号下还没有网页会话。')}</div>
        )}

        {view.items.map(renderCloudRow)}

        {truncated && <div className="panel-hint">{t('只列出了最近的一部分，更早的请到 claude.ai/code 查看。')}</div>}
      </>
    );
  }

  return (
    <div className="panel-plain session-mgr">
      {cloud !== undefined && (
        <div className="session-mgr-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'local'}
            className={'session-mgr-tab' + (tab === 'local' ? ' is-selected' : '')}
            onClick={() => setTab('local')}
          >
            {t('本地')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'web'}
            className={'session-mgr-tab' + (tab === 'web' ? ' is-selected' : '')}
            onClick={() => setTab('web')}
          >
            Web
          </button>
        </div>
      )}

      {tab === 'web' && cloud !== undefined ? renderWeb(cloud) : renderLocal()}
    </div>
  );

  function renderLocal()
  {
    return (
      <>
      <div className="session-mgr-bar">
        <span className="session-mgr-filter">
          <button
            type="button"
            className="session-mgr-bar-button"
            aria-haspopup="menu"
            aria-expanded={filterOpen}
            title={t('筛选')}
            onClick={() => setFilterOpen(!filterOpen)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2.5 3.5h11L9.5 8.5V13l-3-1.5v-3z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
            {t('筛选')}
          </button>

          {filterOpen && (
            <div className="session-mgr-menu" role="menu">
              <label className="session-mgr-menu-check">
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                {t('显示已存档')}
              </label>
              <label className="session-mgr-menu-check">
                <input type="checkbox" checked={showProbes} onChange={(e) => setShowProbes(e.target.checked)} />
                {t('显示没有对话的探测会话')}
              </label>
            </div>
          )}
        </span>

        <button
          type="button"
          className={'session-mgr-bar-button' + (onlyActive ? ' is-on' : '')}
          aria-pressed={onlyActive}
          title={t('只看正开着的会话：聊天标签页和终端里跑着的都算')}
          onClick={() => setOnlyActive(!onlyActive)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
          {t('活动 · {n}', { n: active })}
        </button>

        <input
          type="text"
          className="session-mgr-search"
          placeholder={t('搜索会话…')}
          aria-label={t('搜索会话…')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <button
          type="button"
          className="session-mgr-bar-button"
          title={t('新建一个组，用来归拢会话')}
          onClick={() => startEdit({ kind: 'newGroup' }, '')}
        >
          {t('＋ 新建组')}
        </button>

        <button
          type="button"
          className="session-mgr-bar-button"
          title={t('丢掉当前会话，开一条不带 --resume 的干净会话')}
          onClick={onNewSession}
        >
          {t('开新会话')}
        </button>
      </div>

      <div className="panel-hint">
        {t('点一条会话就接回它：重启 CLI 并带上 --resume，这里换成那条会话的本地回放。')}
      </div>

      {editing.kind === 'newGroup' && (
        <div className="session-mgr-group-head">
          <input
            type="text"
            className="session-mgr-edit"
            aria-label={t('组名')}
            placeholder={t('组名，回车保存')}
            title={t('回车保存，Esc 取消')}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => setEditing(NOT_EDITING)}
            onKeyDown={editKeyDown}
          />
        </div>
      )}

      {emptyText() !== '' && <div className="panel-empty">{emptyText()}</div>}

      {(items.length > 0 || groups.length > 0) && buckets.map(renderBucket)}
      </>
    );
  }
});
