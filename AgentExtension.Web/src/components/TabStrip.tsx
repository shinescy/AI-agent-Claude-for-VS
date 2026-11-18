// 面板顶部的 tab 条：每个 tab 背后是一条独立的会话。

import { useState } from 'react';
import type { TabView } from '../types';
import { useT, useTabTitle } from '../LangContext';

interface TabStripProps {
  tabs: TabView[];
  activeId: string;
  // fromKeyboard 为真时是方向键触发，宿主要把焦点带过去。
  onActivate: (id: string, fromKeyboard: boolean) => void;
  onClose: (id: string) => void;
  onCreate: () => void;
  /** 点「会话历史」按钮；参数是按钮的位置。不给就不画这个按钮。 */
  onOpenHistory?: (anchor: DOMRect) => void;
  /** 打开会话管理弹窗：分组、筛选、存档都在那里。 */
  onOpenManager?: () => void;
}

export function TabStrip(props: TabStripProps) {
  const { tabs, activeId, onActivate, onClose, onCreate, onOpenHistory, onOpenManager } = props;
  const t = useT();
  const titleOf = useTabTitle();

  // 正在等第二次点击确认关闭的那个 tab 的 id；空串表示没有 tab 处于确认态。
  // 忙的 tab 后台还在跑，误点一次 × 就没了、没法撤销，所以要求先点一次进入确认态、
  // 再点一次才真的关。之所以不用 window.confirm：模态对话框弹出期间整块 WebView
  // 的脚本执行是阻塞的，而这个面板一直在被动收宿主推来的流式事件（转录增量、
  // tab 条、终端输出）——要确认的这个场景恰恰是「这个 tab 正在跑」，消息最密的时候，
  // 弹窗挡住的这几秒全部堆在队列里。改成在 tab 条自己身上做两步确认，不挡任何线程。
  const [confirmingId, setConfirmingId] = useState('');

  // 宿主还没推第一份列表时整条不画，免得启动时闪一条空条。
  if (tabs.length === 0) {
    return null;
  }

  // 焦点从某个 tab 移到相邻 tab 并激活它：标准 ARIA tabs 的 roving tabindex 交互。
  // 越界时绕回另一端——tab 数量不多，绕回比停在边界更符合方向键的直觉。
  function moveFocusTo(fromIndex: number, delta: number, focusTarget: (el: HTMLElement | null) => void) {
    const nextIndex = (fromIndex + delta + tabs.length) % tabs.length;
    const next = tabs[nextIndex];

    setConfirmingId('');

    if (next.id !== activeId) {
      onActivate(next.id, true);
    }

    focusTarget(document.querySelector<HTMLElement>(`[data-tab-id="${next.id}"]`));
  }

  return (
    <div className="tabstrip" role="tablist">
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeId;
        const isConfirming = confirmingId === tab.id;

        return (
          <div
            key={tab.id}
            data-tab-id={tab.id}
            role="tab"
            aria-selected={isActive}
            // roving tabindex：Tab 键在 tab 条上只停一次（落在激活的那个），tab 之间的
            // 移动交给左右方向键，顺带给 + 按钮腾出下一个 Tab 停靠点。缺了这个的话
            // 每个 tab 各占一个 Tab 停靠点：只有一个 tab 时没有关闭按钮，从 body 起
            // Tab、Tab、Enter 三下就落在 + 上误触新建（2026-08-28 真机复现过）。
            tabIndex={isActive ? 0 : -1}
            className={'tabstrip-tab' + (isActive ? ' is-active' : '')}
            onClick={() => {
              // 点 tab 本身（不是关闭按钮，那边会 stopPropagation）算「点了别的地方」，
              // 待确认的关闭态要撤销——不管点的是不是正在确认关闭的那个 tab。
              setConfirmingId('');

              if (!isActive) {
                onActivate(tab.id, false);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                moveFocusTo(index, -1, (el) => el?.focus());
                return;
              }

              if (e.key === 'ArrowRight') {
                e.preventDefault();
                moveFocusTo(index, 1, (el) => el?.focus());
                return;
              }

              if (e.key !== 'Enter' && e.key !== ' ') {
                return;
              }

              // 空格默认会滚动页面。
              e.preventDefault();
              setConfirmingId('');

              if (!isActive) {
                onActivate(tab.id, false);
              }
            }}
          >
            {/* 崩了的优先级最高：既跑不动也谈不上有新输出，用户需要先知道这个，
                而不是被同色的忙碌/未读圆点盖过去。 */}
            {tab.failed && <span className="tabstrip-failed" title={t('这个 tab 崩了，点进去看看原因')} />}
            {!tab.failed && tab.busy && <span className="tabstrip-busy" title={t('正在跑')} />}
            {!tab.failed && !tab.busy && tab.unread && <span className="tabstrip-unread" title={t('有新输出')} />}

            <span className="tabstrip-title" title={titleOf(tab.title)}>{titleOf(tab.title)}</span>

            {/* 只剩一个时不给关闭按钮：零 tab 就是零 WebView，
                那时没有任何人能画出这条 tab 条，界面会变成再也点不出新 tab 的灰板。 */}
            {tabs.length > 1 && (
              <button
                type="button"
                className={'tabstrip-close' + (isConfirming ? ' is-confirming' : '')}
                aria-label={
                  isConfirming
                    ? t('再点一次关闭 {title}', { title: titleOf(tab.title) })
                    : t('关闭') + titleOf(tab.title)
                }
                title={isConfirming ? t('再点一次关闭 {title}', { title: titleOf(tab.title) }) : undefined}
                onClick={(e) => {
                  // 不冒泡到 tab 本身：关一个后台 tab 不该顺手把界面切过去，
                  // 也不该被 tab 自己的 onClick 顺手撤销刚设的确认态。
                  e.stopPropagation();

                  if (tab.busy && !isConfirming) {
                    // 忙的 tab 先进确认态，不派发关闭——跑了半天的活儿误点一下就没了、
                    // 没法撤销，值得多问一句。
                    setConfirmingId(tab.id);
                    return;
                  }

                  setConfirmingId('');
                  onClose(tab.id);
                }}
                onMouseLeave={() => {
                  // 鼠标移开就当用户改主意了，确认态别一直挂着。
                  if (isConfirming) {
                    setConfirmingId('');
                  }
                }}
                onBlur={() => {
                  // 键盘用户 Tab 走了同样撤销，理由同上。
                  if (isConfirming) {
                    setConfirmingId('');
                  }
                }}
              >
                {isConfirming ? t('确定?') : '×'}
              </button>
            )}
          </div>
        );
      })}

      {/* 贴在右端不随 tab 横向滚走：会话历史、新建会话。 */}
      <div className="tabstrip-actions">
      {onOpenHistory !== undefined && (
        <button
          type="button"
          className="tabstrip-history"
          aria-label={t('会话历史')}
          title={t('会话历史')}
          onClick={(e) => {
            setConfirmingId('');
            onOpenHistory(e.currentTarget.getBoundingClientRect());
          }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path
              d="M8 5v3.2l2.2 1.3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      {onOpenManager !== undefined && (
        <button
          type="button"
          className="tabstrip-history"
          aria-label={t('会话管理')}
          title={t('会话管理：分组、筛选、改名、存档')}
          onClick={() => {
            setConfirmingId('');
            onOpenManager();
          }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M2 4.5h4l1.2 1.5H14v6.5H2z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      <button
        type="button"
        className="tabstrip-add"
        aria-label={t('新建会话')}
        title={t('新建会话')}
        onClick={() => {
          setConfirmingId('');
          onCreate();
        }}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            d="M8 2.5a5.5 5.5 0 0 0-4.7 8.4L2.5 13.5l2.7-.8A5.5 5.5 0 1 0 8 2.5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path d="M8 5.8v4.4M5.8 8h4.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
      </div>
    </div>
  );
}
