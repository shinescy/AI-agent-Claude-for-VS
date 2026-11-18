// 额度用量条：窗口顶部那一栏。

import { useEffect, useRef, useState } from 'react';
import type { UsageWindow } from '../types';
import { useT } from '../LangContext';
import { formatReset, formatWindowLabel } from '../usageFormat';
import { useNowSeconds } from '../useNowSeconds';

/** 用量到这个比例就该提醒了。 */
const WARN_PERCENT = 75;

/** 点了刷新后最多等多久（宿主探测超时 90 秒，留余量）。 */
export const USAGE_REFRESH_TIMEOUT_MS = 100_000;

/** 面板开着时自动刷新的间隔。 */
export const USAGE_AUTO_REFRESH_MS = 5 * 60_000;

interface UsageBarProps {
  windows: UsageWindow[];
  /** 最近一次现探到额度的时刻（Unix 毫秒）；0 或不给是不知道。 */
  checkedAtMs?: number;
  /** 请求重新探一次。 */
  onRefresh: () => void;
}

/** 两位数的时:分:秒。 */
function clock(ms: number): string {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

export function UsageBar({ windows, checkedAtMs = 0, onRefresh }: UsageBarProps) {
  const t = useT();

  const nowSeconds = useNowSeconds(windows.some((w) => w.resetsAtUnix > 0));

  // 等回话：点下时记住当时的时刻，新的时刻到了才算刷新完成。
  const [pendingSince, setPendingSince] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const refreshRef = useRef<() => void>(() => undefined);

  refreshRef.current = () => {
    setPendingSince(checkedAtMs);
    setFailed(false);
    onRefresh();
  };

  useEffect(() => {
    if (pendingSince !== null && checkedAtMs > pendingSince) {
      setPendingSince(null);
    }
  }, [checkedAtMs, pendingSince]);

  useEffect(() => {
    if (pendingSince === null) {
      return;
    }

    const timer = window.setTimeout(() => {
      setPendingSince(null);
      setFailed(true);
    }, USAGE_REFRESH_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [pendingSince]);

  // 只在一轮对话说完时刷新不够：终端里聊、别处用掉的额度都看不到。
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshRef.current();
      }
    }, USAGE_AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  if (windows.length === 0) {
    return (
      <div className="usage-bar usage-bar-empty" role="status">
        <span>{t('额度用量获取中…')}</span>
      </div>
    );
  }

  const pending = pendingSince !== null;
  const lines = [t('重新读取额度用量。该命令不消耗额度。')];

  if (pending) {
    lines.push(t('正在读取…'));
  } else if (failed) {
    lines.push(t('上次没读到额度，可再点一次重试。'));
  }

  if (checkedAtMs > 0) {
    lines.push(t('更新于 {time}', { time: clock(checkedAtMs) }));
  }

  const title = lines.join('\n');
  const className = 'usage-bar-refresh'
    + (pending ? ' is-pending' : '')
    + (failed ? ' is-failed' : '');

  return (
    <div className="usage-bar" role="status" aria-label={t('额度用量')}>
      <div className="usage-bar-items">
        {windows.map((w) => (
          <UsageItem key={w.label} window={w} nowSeconds={nowSeconds} />
        ))}
      </div>

      <button
        type="button"
        className={className}
        title={title}
        aria-label={title}
        aria-busy={pending}
        disabled={pending}
        onClick={() => refreshRef.current()}
      >
        <span className="usage-bar-refresh-icon">↻</span>
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
