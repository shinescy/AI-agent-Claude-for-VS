// 权限面板：取代在本管线下被 CLI 拒绝的 /permissions（别名 /allowed-tools 同样被拒）。

import type { PanelItemView } from '../panelState';
import { useT } from '../LangContext';

interface PermissionsPanelProps {
  items: PanelItemView[];
  error?: string;
  loading?: boolean;
  onOpenFile: (path: string) => void;
}

/** 作用域是宿主给的机读值，这里翻成说法。 */
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

/** 规则种类。 */
function kindLabel(kind: string, t: (s: string) => string): string {
  switch (kind) {
    case 'allow':
      return t('允许');
    case 'deny':
      return t('拒绝');
    case 'ask':
      return t('每次询问');
    case 'mode':
      return t('默认模式');
    case 'dir':
      return t('附加目录');
    default:
      return kind;
  }
}

export function PermissionsPanel({ items, error = '', loading = false, onOpenFile }: PermissionsPanelProps) {
  const t = useT();

  const emptyText = loading || error !== '' || items.length > 0
    ? ''
    : t('没有找到任何 settings.json。');

  return (
    <div className="panel-plain">
      <div className="panel-hint">
        {t('这些是各作用域 settings.json 里声明的工具权限规则。面板只读——加规则等于放宽权限，点「打开」在编辑器里改。实际生效还受企业策略、命令行参数与本次会话里的临时批准影响。')}
      </div>

      {emptyText !== '' && <div className="panel-empty">{emptyText}</div>}

      {items.map((item) => {
        const kind = item.fields['kind'] ?? '';

        // 作用域那一行：即使该文件里一条规则都没有也会有，否则整个面板空着像坏了。
        if (kind === 'file') {
          const counts = `${t('允许')} ${item.fields['allow']} · ${t('拒绝')} ${item.fields['deny']} · ${t('每次询问')} ${item.fields['ask']}`;
          const mode = item.fields['mode'] ?? '';

          return (
            <div key={item.id} className="panel-row permission-scope-row">
              <span className="panel-row-title">{scopeLabel(item.scope ?? '', t)}</span>
              <span className="panel-row-sub">{counts}</span>
              {mode !== '' && <span className="panel-row-scope">{t('默认模式')} {mode}</span>}

              {/* JSON 坏掉时宿主把这一行标成未启用并把报错写进 detail——
                  不说清的话它看起来就像「读过了，没有规则」。 */}
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
          );
        }

        return (
          <div key={item.id} className="panel-row">
            <span className={`permission-kind permission-kind-${kind}`}>{kindLabel(kind, t)}</span>
            <span className="panel-row-title permission-rule">{item.title}</span>
            <span className="panel-row-scope">{scopeLabel(item.scope ?? '', t)}</span>
          </div>
        );
      })}
    </div>
  );
}
