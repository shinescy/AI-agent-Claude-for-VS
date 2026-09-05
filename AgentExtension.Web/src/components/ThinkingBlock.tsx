// 思考块：默认折叠，点击展开查看代理的思考过程原文。

import { useState } from 'react';

interface ThinkingBlockProps {
  text: string;
}

export function ThinkingBlock({ text }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="thinking-block">
      <button type="button" className="thinking-block-header" onClick={() => setExpanded((v) => !v)}>
        <span className="thinking-block-caret">{expanded ? '▾' : '▸'}</span>
        思考过程
      </button>
      {expanded && <div className="thinking-block-text">{text}</div>}
    </div>
  );
}
