// 额度用量条：窗口顶部那一栏。

import type { UsageWindow } from '../types';
import { useT } from '../LangContext';
import { formatReset, formatWindowLabel } from '../usageFormat';
import { useNowSeconds } from '../useNowSeconds';

/** 用量到这个比例就该提醒了。 */
const WARN_PERCENT = 75;

interface UsageBarProps {
  windows: UsageWindow[];
  /** 请求重新探一次。 */
  onRefresh: () => void;
  /** 会话忙碌中：此时不能重探，按钮要停用并说明原因。 */
}

export function UsageBar({ windows, onRefresh }: UsageBarProps) {
  const t = useT();

  const nowSeconds = useNowSeconds(windows.some((w) => w.resetsAtUnix > 0));

  if (windows.length === 0) {
    return (
      <div className="usage-bar usage-bar-empty" role="status">
        <span>{t('额度用量获取中…')}</span>
      </div>
    );
  }

  return (
    <div className="usage-bar" role="status" aria-label={t('额度用量')}>
      <div className="usage-bar-items">
        {windows.map((w) => (
          <UsageItem key={w.label} window={w} nowSeconds={nowSeconds} />
        ))}
      </div>

      <button
        type="button"
        className="usage-bar-refresh"
        title={t('重新读取额度用量。该命令不消耗额度。')}
        onClick={onRefresh}
      >
        ↻
      </button>
    </div>
  );
}

function UsageItem({ window: w, nowSeconds }: { window: UsageWindow; nowSeconds: number }) {
  const t = useT();
  const loud = w.percentUsed >= WARN_PERCENT;

  return (
    <span className={`usage-item${loud ? ' usage-item-loud' : ''}`}>
      <span className="usage-item-label">{formatWindowLabel(w, t)}</span>
      <span className="usage-item-bar" aria-hidden="true">
        <span className="usage-item-fill" style={{ width: `${Math.min(100, w.percentUsed)}%` }} />
      </span>
      <span className="usage-item-percent">{w.percentUsed}%</span>
      <span className="usage-item-remaining">{formatReset(w, nowSeconds, t)}</span>
    </span>
  );
}
