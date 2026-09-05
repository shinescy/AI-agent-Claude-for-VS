// 输入框上方那一排「这次要带上的文件」，点一枚就在下面就地展开预览。

import { useState } from 'react';
import { findMentions } from '../mention';
import { MentionChip } from './MentionChip';
import { FilePreview } from './FilePreview';

interface MentionPreviewBarProps {
  /** 当前草稿。 */
  text: string;
}

export function MentionPreviewBar({ text }: MentionPreviewBarProps) {
  const [openPath, setOpenPath] = useState<string | null>(null);

  const paths = Array.from(new Set(findMentions(text).map((m) => m.path)));

  const open = openPath !== null && paths.includes(openPath) ? openPath : null;

  if (paths.length === 0) {
    return null;
  }

  return (
    <div className="mention-bar">
      <div className="mention-bar-chips">
        {paths.map((path) => (
          <MentionChip
            key={path}
            path={path}
            active={open === path}
            onToggle={() => setOpenPath(open === path ? null : path)}
          />
        ))}
      </div>
      {open !== null && (
        <FilePreview path={open} onClose={() => setOpenPath(null)} />
      )}
    </div>
  );
}
