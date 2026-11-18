// 思考块：一行「思考了 N 秒」，有原文才可展开。

import { useState } from 'react';
import { useT } from '../LangContext';

interface ThinkingBlockProps {
  text: string;
  /** 还在思考。 */
  streaming?: boolean;
  /** 思考用了多久，毫秒；算不出不给。 */
  durationMs?: number;
}

export function ThinkingBlock({ text, streaming = false, durationMs }: ThinkingBlockProps) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  const label = streaming
    ? t('正在思考…')
    : durationMs !== undefined
      ? t('思考了 {seconds} 秒', { seconds: String(Math.max(0, Math.round(durationMs / 1000))) })
      : t('思考过程');

  // 转录里的思考原文常是空的，没东西可展开就不做成按钮
  if (text.trim() === '')
  {
    return (
      <div className="thinking-block">
        <span className="thinking-block-header is-static">{label}</span>
      </div>
    );
  }

  return (
    <div className="thinking-block">
      <button
        type="button"
        className="thinking-block-header"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {label}
        <span className="thinking-block-caret" aria-hidden="true">{expanded ? '⌃' : '⌄'}</span>
      </button>
      {expanded && <div className="thinking-block-text">{text}</div>}
    </div>
  );
}
