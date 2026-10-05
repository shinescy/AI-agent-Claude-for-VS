// 后台代理面板（只读）：agents 除标志位外没有可用的管理子命令，杀不掉也停不了。

import { useState } from 'react';
import type { PanelItemView } from '../panelState';
import { useT } from '../LangContext';

interface AgentsPanelProps {
  items: PanelItemView[];
  /** 取数出错时的原因；为空表示正常。 */
  error?: string;
  /** 请求进行中：此时列表当然是空的，不能据此断言「没有活动会话」。 */
  loading?: boolean;
}

export function AgentsPanel({ items, error = '', loading = false }: AgentsPanelProps) {
  const t = useT();
  const [onlyThisRepo, setOnlyThisRepo] = useState(true);

  const shown = onlyThisRepo
    ? items.filter((x) => x.currentProject)
    : items;

  // 空态必须区分三种情况，否则说的是一件没发生的事：
  function emptyText(): string {
    if (loading || error !== '' || shown.length > 0) {
      return '';
    }

    return items.length > 0 ? t('当前项目没有活动会话。') : t('没有活动会话。');
  }

  return (
    <div className="panel-plain">
      <label className="panel-filter">
        <input
          type="checkbox"
          checked={onlyThisRepo}
          onChange={(e) => setOnlyThisRepo(e.target.checked)}
        />
        {t('只看当前项目')}
      </label>

      {/* 取数出错时顶部已经在报错，这里不该再补一句「没有活动会话」——两句话同屏会互相矛盾。 */}
      {emptyText() !== '' && <div className="panel-empty">{emptyText()}</div>}

      {shown.map((item) => {
        // 状态字段是可选的（见 AgentsListParser 的注释），缺失时不能让界面只剩一个空心点
        const status = item.fields['status'];
        const statusText = status && status !== '' ? status : t('状态未知');
        const sessionId = item.fields['session'];
        const pid = item.fields['pid'];

        return (
          <div key={item.id} className="panel-row">
            <span className={item.enabled ? 'panel-dot-on' : 'panel-dot-off'}>
              {item.enabled ? '●' : '○'}
            </span>
            <span className="panel-row-title">{item.title}</span>
            <span className="panel-row-sub">{item.subtitle}</span>
            <span className="panel-row-status">{statusText}</span>
            {sessionId && (
              <span className="panel-row-session" title={sessionId}>
                {t('会话')} {sessionId}
              </span>
            )}
            {pid && <span className="panel-row-pid">PID {pid}</span>}
            <span className="panel-row-path">{item.fields['cwd']}</span>
          </div>
        );
      })}
    </div>
  );
}
