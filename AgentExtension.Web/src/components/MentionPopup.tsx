// @ 文件引用的候选弹层。

import { useEffect, useRef } from 'react';
import { useT } from '../LangContext';

interface MentionPopupProps
{
  /** 候选文件路径。 */
  matches: string[];
  selectedIndex: number;
  onSelect: (path: string) => void;
}

export function MentionPopup({ matches, selectedIndex, onSelect }: MentionPopupProps)
{
  const t = useT();
  const listRef = useRef<HTMLDivElement>(null);

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
  }, [selectedIndex, matches]);

  return (
    <div className="slash-popup mention-popup">
      <div className="slash-popup-list" ref={listRef}>
        {matches.map((path, i) => (
          <div
            key={path}
            role="option"
            aria-selected={i === selectedIndex}
            className={`slash-popup-item${i === selectedIndex ? ' slash-popup-item-selected' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); onSelect(path); }}
          >
            {path}
          </div>
        ))}
      </div>
      <div className="slash-popup-footer">{t('{n} 个文件', { n: matches.length })}</div>
    </div>
  );
}
