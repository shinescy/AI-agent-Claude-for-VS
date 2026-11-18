// 记忆面板：取代在本管线下被 CLI 拒绝的 /memory。

import type { PanelItemView } from '../panelState';
import { useT } from '../LangContext';

interface MemoryPanelProps {
  items: PanelItemView[];
  error?: string;
  loading?: boolean;
  onOpenFile: (path: string) => void;
}

/** 作用域是宿主给的机读值（project / parent / user / auto），这里翻成说法。 */
function scopeLabel(scope: string, t: (s: string) => string): string {
  switch (scope) {
    case 'project':
      return t('本项目');
    case 'parent':
      return t('上级目录');
    case 'user':
      return t('用户级');
    case 'auto':
      return t('自动记忆');
    default:
      return scope;
  }
}

export function MemoryPanel({ items, error = '', loading = false, onOpenFile }: MemoryPanelProps) {
  const t = useT();

  const emptyText = loading || error !== '' || items.length > 0
    ? ''
    : t('没有找到记忆文件。');

  return (
    <div className="panel-plain">
      <div className="panel-hint">
        {t('这些是本目录下这次会话实际会读到的记忆文件。点「打开」在编辑器里改，改完下次启动生效。')}
      </div>

      {emptyText !== '' && <div className="panel-empty">{emptyText}</div>}

      {items.map((item) => (
        <div key={item.id} className="panel-row">
          <span className="panel-row-title">{item.title}</span>
          <span className="panel-row-scope">{scopeLabel(item.scope ?? '', t)}</span>
          <span className="panel-row-size">{item.fields['size']}</span>
          <span className="panel-row-size">{item.fields['lines']} {t('行')}</span>
          <span className="panel-row-sub">{item.fields['modified']}</span>

          {/* 路径很长，完整值挂 title；这一列允许省略号，不能把兄弟列挤没 */}
          <span className="panel-row-path" title={item.fields['path']}>{item.fields['path']}</span>

          <button
            type="button"
            className="panel-action"
            onClick={() => onOpenFile(item.fields['path'])}
          >
            {t('打开')}
          </button>
        </div>
      ))}
    </div>
  );
}
