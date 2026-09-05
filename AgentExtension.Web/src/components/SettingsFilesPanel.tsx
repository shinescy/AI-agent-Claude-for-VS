// 设置文件面板：`/hooks` `/sandbox` 这类被 CLI 拒掉的命令的落点。

import type { PanelItemView } from '../panelState';
import { useT } from '../LangContext';

interface SettingsFilesPanelProps {
  items: PanelItemView[];
  error?: string;
  loading?: boolean;
  onOpenFile: (path: string) => void;
}

function scopeLabel(scope: string, t: (s: string) => string): string {
  switch (scope) {
    case 'user':
      return t('用户级');
    case 'project':
      return t('本项目');
    case 'local':
      return t('本项目（未入库）');
    case 'managed':
      return t('企业策略');
    default:
      return scope;
  }
}

export function SettingsFilesPanel({ items, error = '', loading = false, onOpenFile }: SettingsFilesPanelProps) {
  const t = useT();

  const emptyText = loading || error !== '' || items.length > 0
    ? ''
    : t('没有找到任何 settings.json。');

  return (
    <div className="panel-plain">
      <div className="panel-hint">
        {t('CLI 的设置分四个作用域，下面是这台机器上实际存在的文件与其中已有的配置段。面板只读，点「打开」在编辑器里改；键名与取值请查官方文档，这里不列可配置项大全。')}
      </div>

      {emptyText !== '' && <div className="panel-empty">{emptyText}</div>}

      {items.map((item) => (
        <div key={item.id} className="panel-row">
          <span className="panel-row-title">{scopeLabel(item.scope ?? '', t)}</span>

          {/* 段名是机器语法（permissions / hooks / env …），等宽体读起来才不费劲 */}
          <span className="settings-sections">{item.fields['sections'] || t('（还没有任何配置段）')}</span>

          {!item.enabled && <span className="panel-row-error">{t('读不出来')}：{item.detail}</span>}

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
