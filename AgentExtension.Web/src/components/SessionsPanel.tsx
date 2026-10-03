// 会话历史面板：取代在本管线下被 CLI 拒绝的 /resume。

import { useState } from 'react';
import type { PanelItemView } from '../panelState';
import { useT } from '../LangContext';

interface SessionsPanelProps {
  items: PanelItemView[];
  /** 当前会话 id：它不能被「接回」（就是它自己），单独标出来。 */
  currentSessionId: string;
  /** 取数出错时的原因；为空表示正常。 */
  error?: string;
  /** 请求进行中：此时列表当然是空的，不能据此断言「没有历史会话」。 */
  loading?: boolean;
  onResume: (sessionId: string, fork: boolean) => void;
  /** 丢掉当前会话、开一条干净的——自动接回之后的逃生口。 */
  onNewSession: () => void;
}

export function SessionsPanel(props: SessionsPanelProps) {
  const { items, currentSessionId, error = '', loading = false, onResume, onNewSession } = props;
  const t = useT();

  const [onlyRealChats, setOnlyRealChats] = useState(true);

  const shown = onlyRealChats ? items.filter((x) => x.enabled) : items;

  // 空态要区分三种情况，否则说的是一件没发生的事。
  function emptyText(): string {
    if (loading || error !== '' || shown.length > 0) {
      return '';
    }

    return items.length > 0
      ? t('这个目录下只有启动探测留下的会话。')
      : t('这个目录下还没有历史会话。');
  }

  return (
    <div className="panel-plain">
      <div className="panel-toolbar">
        <label className="panel-filter">
          <input
            type="checkbox"
            checked={onlyRealChats}
            onChange={(e) => setOnlyRealChats(e.target.checked)}
          />
          {t('只看有对话的')}
        </label>

        <button
          type="button"
          className="panel-action"
          title={t('丢掉当前会话，开一条不带 --resume 的干净会话')}
          onClick={onNewSession}
        >
          {t('开新会话')}
        </button>
      </div>

      <div className="panel-hint">
        {t('接回会话会重启 CLI 并带上 --resume：上下文交给 CLI，但历史消息不会回填到这里。')}
      </div>

      {emptyText() !== '' && <div className="panel-empty">{emptyText()}</div>}

      {shown.map((item) => {
        const isCurrent = currentSessionId !== '' && item.id === currentSessionId;

        return (
          <div key={item.id} className="panel-row">
            <span className="panel-row-title" title={item.title}>{item.title}</span>
            <span className="panel-row-sub">{item.subtitle}</span>

            {item.fields['branch'] && (
              <span className="panel-row-branch">{item.fields['branch']}</span>
            )}

            <span className="panel-row-size">{item.fields['size']}</span>

            {/* 会话 id 完整显示不下，给前 8 位并把全值挂在 title 上——
                用户要拿它去终端 claude --resume 时，能选中复制才有用。 */}
            <span className="panel-row-session" title={item.id}>{item.id.slice(0, 8)}</span>

            {isCurrent ? (
              <span className="panel-row-current">{t('当前会话')}</span>
            ) : (
              <>
                <button
                  type="button"
                  className="panel-action"
                  title={t('重启 CLI 并接回这条会话，后续对话继续写进它')}
                  onClick={() => onResume(item.id, false)}
                >
                  {t('接回')}
                </button>
                <button
                  type="button"
                  className="panel-action"
                  title={t('拿到它的上下文，但写进一条新会话，原记录不被追写')}
                  onClick={() => onResume(item.id, true)}
                >
                  {t('开分支')}
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
