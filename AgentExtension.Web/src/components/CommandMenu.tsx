// 命令菜单：浮在输入框上方，分组列出快捷动作与 slash 命令，每行带说明。

import { useEffect, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { isSlashItem, slashName } from '../commandMenu';
import type { MenuItem } from '../commandMenu';
import { panelIdForCommand } from '../panelCommands';
import { useT } from '../LangContext';

interface CommandMenuProps {
  items: MenuItem[];
  selectedIndex: number;
  onSelect: (item: MenuItem) => void;
  onHover: (index: number) => void;
  /** 实测在本环境不可用的命令。 */
  unavailable: string[];
  /** 行尾放控件（如强度滑轨）；返回 null 就照常显示灰字。 */
  renderTrailing?: (item: MenuItem) => ReactNode;

  /** 给了就在顶上放一个筛选框（从按钮打开时用）；打字触发时不给。 */
  filter?: {
    value: string;
    onChange: (value: string) => void;
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
    onBlur: () => void;
  };
}

/** 渲染条数上限。 */
const MAX_RENDERED = 200;

export function CommandMenu(props: CommandMenuProps) {
  const { items, selectedIndex, onSelect, onHover, unavailable, renderTrailing, filter } = props;
  const t = useT();
  const listRef = useRef<HTMLDivElement>(null);
  // 有面板接管的命令不算「不可用」——它们不会被发给 CLI。
  const blocked = new Set(unavailable.filter((cmd) => panelIdForCommand(`/${cmd}`) === null));
  const visible = items.slice(0, MAX_RENDERED);

  // 键盘上下移动时把选中项滚进视野。
  useEffect(() =>
  {
    const item = listRef.current?.querySelector('[aria-selected="true"]') as HTMLElement | null;

    if (item && typeof item.scrollIntoView === 'function')
    {
      item.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (visible.length === 0 && !filter)
  {
    return null;
  }

  return (
    <div className="slash-popup command-menu">
      {filter && (
        <input
          className="command-menu-filter"
          type="text"
          autoFocus
          value={filter.value}
          placeholder={t('筛选命令…')}
          onChange={(e) => filter.onChange(e.target.value)}
          onKeyDown={filter.onKeyDown}
          onBlur={filter.onBlur}
        />
      )}
      <div className="command-menu-list" role="listbox" ref={listRef}>
        {visible.length === 0 && (
          <div className="command-menu-empty">{t('没有匹配的命令')}</div>
        )}
        {visible.map((item, index) =>
        {
          const isBlocked = isSlashItem(item) && blocked.has(slashName(item));
          const control = renderTrailing ? renderTrailing(item) : null;
          const startsSection = index === 0 || visible[index - 1].section !== item.section;

          return (
            <div key={item.id}>
              {startsSection && index > 0 && <div className="command-menu-divider" aria-hidden="true" />}
              {startsSection && (
                <div className="command-menu-section" role="presentation">{item.section}</div>
              )}
              <div
                role="option"
                aria-selected={index === selectedIndex}
                title={item.description}
                className={
                  `command-menu-item${index === selectedIndex ? ' is-active' : ''}`
                  + (isBlocked ? ' slash-popup-item-blocked' : '')
                }
                onMouseMove={() => onHover(index)}
                onMouseDown={(e) =>
                {
                  // 不让输入框失焦：失焦会先把菜单关掉，点击就落空了。
                  e.preventDefault();

                  // 点在行尾控件上是在调它，不算选中这一行。
                  if ((e.target as HTMLElement).closest('.command-menu-control') !== null)
                  {
                    return;
                  }

                  onSelect(item);
                }}
              >
                {/* 说明只放悬停提示，一行只有标题，右侧留给当前值 */}
                <span className="command-menu-label">{item.label}</span>
                {control !== null && control !== undefined && (
                  <span className="command-menu-control">{control}</span>
                )}
                {(control === null || control === undefined) && item.trailing !== undefined && (
                  <span className="command-menu-trailing">{item.trailing}</span>
                )}
                {/* 标注而非隐藏：藏起来用户会以为清单残缺。 */}
                {isBlocked && <span className="slash-popup-blocked-tag">{t('仅终端')}</span>}
              </div>
            </div>
          );
        })}
        {items.length > MAX_RENDERED && (
          <div className="command-menu-empty">
            {t('{shown} / {total} 条（继续输入以缩小范围）', { shown: MAX_RENDERED, total: items.length })}
          </div>
        )}
      </div>
    </div>
  );
}
