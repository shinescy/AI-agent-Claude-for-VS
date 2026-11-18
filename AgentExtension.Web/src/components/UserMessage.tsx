// 转录里的一条用户消息：把已经发出去的 @ 引用变成能点开预览的徽标。

import { useState } from 'react';
import { findMentions } from '../mention';
import { MentionChip } from './MentionChip';
import { FilePreview } from './FilePreview';

interface UserMessageProps {
  text: string;
}

export function UserMessage({ text }: UserMessageProps) {
  const [openPath, setOpenPath] = useState<string | null>(null);

  const mentions = findMentions(text);

  if (mentions.length === 0) {
    return <div className="block-text">{text}</div>;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  mentions.forEach((mention, i) => {
    if (mention.index > cursor) {
      parts.push(text.slice(cursor, mention.index));
    }

    parts.push(
      <MentionChip
        key={`${mention.path}#${i}`}
        path={mention.path}
        active={openPath === mention.path}
        onToggle={() => setOpenPath(openPath === mention.path ? null : mention.path)}
      />,
    );

    cursor = mention.index + mention.raw.length;
  });

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return (
    <>
      <div className="block-text">{parts}</div>
      {openPath !== null && (
        <FilePreview path={openPath} onClose={() => setOpenPath(null)} />
      )}
    </>
  );
}
