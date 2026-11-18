// 上下文剩余圆环：悬停看百分比，单击立即压缩。放在工具栏上。

import { useEffect, useRef, useState } from 'react';
import { useT } from '../LangContext';

/** 圆环属性。 */
export interface ContextRingProps
{
  /** 上下文剩余比例 0..1；未知为 null。 */
  remaining: number | null;
  /** 自动压缩是否开着。 */
  autoCompact: boolean;
  /** 代理正忙，不能插压缩。 */
  busy: boolean;
  /** 单击：立即压缩。 */
  onCompact: () => void;
}

/** 圆环半径与周长。 */
const RADIUS = 7;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** 点了却一直没忙起来，多久后放弃转圈。 */
export const COMPACT_START_TIMEOUT_MS = 5000;

/** 上下文剩余圆环。 */
export function ContextRing({ remaining, autoCompact, busy, onCompact }: ContextRingProps)
{
  const t = useT();
  const known = remaining !== null;
  const pct = known ? (remaining * 100).toFixed(1) : '';

  // 点过之后转圈，直到这次压缩跑完（busy 先真后假）
  const [compacting, setCompacting] = useState(false);
  const sawBusy = useRef(false);

  useEffect(() =>
  {
    if (!compacting)
    {
      return undefined;
    }

    if (busy)
    {
      sawBusy.current = true;
      return undefined;
    }

    if (sawBusy.current)
    {
      setCompacting(false);
      return undefined;
    }

    // 发出去却始终没忙起来：别永远转下去
    const timer = window.setTimeout(() => setCompacting(false), COMPACT_START_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [compacting, busy]);

  // 用量未知也能压：重开 VS 接回的会话要等说过一句才知道用量，但早就够压了
  let title = `${t('发一条消息后显示上下文用量。')}\n${t('单击以立即压缩。')}`;

  if (compacting)
  {
    title = t('正在压缩上下文…');
  }
  else if (known)
  {
    const head = autoCompact
      ? t('{pct}% 上下文剩余，用完后将自动压缩。', { pct })
      : t('{pct}% 上下文剩余，已关闭自动压缩，用完后不会自动压缩。', { pct });
    title = `${head}\n${t('单击以立即压缩。')}`;
  }

  const clickable = !busy && !compacting;
  const dash = known ? CIRCUMFERENCE * remaining : 0;

  const classes = ['context-ring'];

  if (!known)
  {
    classes.push('is-unknown');
  }

  if (compacting)
  {
    classes.push('is-compacting');
  }

  return (
    <button
      type="button"
      className={classes.join(' ')}
      title={title}
      aria-label={title}
      aria-disabled={!clickable}
      aria-busy={compacting}
      onClick={() =>
      {
        if (clickable)
        {
          sawBusy.current = false;
          setCompacting(true);
          onCompact();
        }
      }}
    >
      <svg className="context-ring-svg" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <circle className="context-ring-track" cx="9" cy="9" r={RADIUS} fill="none" strokeWidth="2.5" />
        {known && (
          <circle
            className="context-ring-arc"
            cx="9"
            cy="9"
            r={RADIUS}
            fill="none"
            strokeWidth="2.5"
            strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
            transform="rotate(-90 9 9)"
          />
        )}
      </svg>
    </button>
  );
}
