// diff 视图：把一对新旧文本渲染成带 +/- 标记的逐行对比。

import { diffLines } from 'diff';
import type { DiffPair } from '../toolSummary';

interface DiffViewProps {
  diff: DiffPair;
}

interface DiffLineItem {
  type: 'add' | 'remove' | 'context';
  text: string;
}

/** 把 diffLines 的分块结果拆成逐行条目，并统计增删行数。 */
function buildLines(diff: DiffPair): { lines: DiffLineItem[]; added: number; removed: number } {
  const changes = diffLines(diff.oldText, diff.newText);
  const lines: DiffLineItem[] = [];
  let added = 0;
  let removed = 0;

  for (const part of changes)
  {
    const type: DiffLineItem['type'] = part.added ? 'add' : part.removed ? 'remove' : 'context';
    const rows = part.value.split('\n');
    if (rows.length > 0 && rows[rows.length - 1] === '')
    {
      rows.pop();
    }
    for (const text of rows)
    {
      lines.push({ type, text });
      if (type === 'add')
      {
        added += 1;
      }
      if (type === 'remove')
      {
        removed += 1;
      }
    }
  }

  return { lines, added, removed };
}

export function DiffView({ diff }: DiffViewProps) {
  const { lines, added, removed } = buildLines(diff);

  return (
    <div className="diff-view">
      <div className="diff-stat">
        <span className="diff-stat-add">+{added}</span>
        <span className="diff-stat-remove">−{removed}</span>
      </div>
      <div className="diff-body">
        {lines.map((line, index) => (
          <div key={index} className={`diff-line diff-line-${line.type}`}>
            <span className="diff-marker">{line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ''}</span>
            <span className="diff-text">{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
