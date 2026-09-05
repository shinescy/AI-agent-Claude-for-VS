// 工具卡片：默认折叠成一行摘要，点击展开看 diff 与完整结果。

import { useState } from 'react';
import type { AgentToolCall } from '../types';
import { summarizeTool } from '../toolSummary';
import { DiffView } from './DiffView';
import { useT } from '../LangContext';

interface ToolCardProps {
  call: AgentToolCall;
  /** 工具已发起但结果尚未回填。 */
  running: boolean;
}

export function ToolCard({ call, running }: ToolCardProps) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const summary = summarizeTool(call);

  return (
    <div className={`tool-card${call.isError ? ' tool-card-error' : ''}`}>
      <button type="button" className="tool-card-header" onClick={() => setExpanded((v) => !v)}>
        <span className="tool-card-icon">{summary.icon}</span>
        <span className="tool-card-title">{summary.title}</span>
        {summary.detail && <span className="tool-card-detail">{summary.detail}</span>}
        {running && <span className="tool-card-running">{t('执行中…')}</span>}
        <span className="tool-card-caret">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="tool-card-body">
          {summary.diff && <DiffView diff={summary.diff} />}
          {call.resultText && <pre className="tool-card-result">{call.resultText}</pre>}
        </div>
      )}
    </div>
  );
}
