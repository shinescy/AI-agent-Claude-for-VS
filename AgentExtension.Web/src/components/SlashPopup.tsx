// slash 命令补全弹层：浮在输入框上方，可滚动，当前选中项高亮并自动滚入视野。

import { useEffect, useRef } from 'react';
import { panelIdForCommand } from '../panelCommands';
import { useT } from '../LangContext';

interface SlashPopupProps {
  commands: string[];
  selectedIndex: number;
  onSelect: (command: string) => void;
  /** 实测在本环境不可用的命令。 */
  unavailable: string[];

  /** 清单边界的一句说明。 */
  note: string;
}

/** 渲染条数上限。 */
const MAX_RENDERED = 200;

export function SlashPopup({ commands, selectedIndex, onSelect, unavailable, note }: SlashPopupProps) {
  const t = useT();
  const listRef = useRef<HTMLDivElement>(null);
  // 有面板接管的命令不再算「不可用」——它们不会再被发给 CLI，
  const blocked = new Set(unavailable.filter((cmd) => panelIdForCommand(`/${cmd}`) === null));
  const visible = commands.slice(0, MAX_RENDERED);

  // 键盘上下移动时把选中项滚进视野，否则选中项会跑到可视区外，
  useEffect(() =>
  {
    const list = listRef.current;
    if (!list)
    {
      return;
    }

    const item = list.children[selectedIndex] as HTMLElement | undefined;
    if (item && typeof item.scrollIntoView === 'function')
    {
      item.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (visible.length === 0)
  {
    return null;
  }

  return (
    <div className="slash-popup">
      <div className="slash-popup-list" role="listbox" ref={listRef}>
        {visible.map((cmd, index) => (
          <div
            key={cmd}
            role="option"
            aria-selected={index === selectedIndex}
            className={
              `slash-popup-item${index === selectedIndex ? ' slash-popup-item-selected' : ''}`
              + (blocked.has(cmd) ? ' slash-popup-item-blocked' : '')
            }
            onMouseDown={(e) =>
            {
              e.preventDefault();
              onSelect(cmd);
            }}
          >
            <span>/{cmd}</span>
            {/* 标注而非直接隐藏：藏起来用户会以为补全又残缺了，
                而且「不可用」是这条管线的限制，说出来比让人反复试强。 */}
            {blocked.has(cmd) && <span className="slash-popup-blocked-tag">{t('仅终端')}</span>}
          </div>
        ))}
      </div>
      {/* 说明这份清单的边界。不写清楚就会被当成「补全列表残缺」。 */}
      <div className="slash-popup-footer">
        {commands.length > MAX_RENDERED
          ? t('{shown} / {total} 条（继续输入以缩小范围）', { shown: MAX_RENDERED, total: commands.length })
          : t('{n} 条', { n: commands.length })}
        <span className="slash-popup-note">
          {` · ${note}`}
        </span>
      </div>
    </div>
  );
}
