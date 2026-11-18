// 提示缓存指示：一个小时钟，热的时候带剩余分钟，冷了变红；悬停看详细说明。

import { useState } from 'react';
import { cacheWindow, formatTokens, splitIdle } from '../promptCache';
import type { PromptCacheRecord } from '../promptCache';
import { useT } from '../LangContext';
import { useNowSeconds } from '../useNowSeconds';

interface CacheIndicatorProps {
  record: PromptCacheRecord | null;
}

export function CacheIndicator({ record }: CacheIndicatorProps) {
  const t = useT();
  const [hover, setHover] = useState(false);
  const nowSeconds = useNowSeconds(record !== null);
  const state = cacheWindow(record, nowSeconds * 1000);

  /** 闲置时长的说法，如 15 天 4 小时。 */
  function idleText(idleMs: number): string
  {
    const { days, hours, minutes } = splitIdle(idleMs);

    if (days > 0)
    {
      return t('{d} 天 {h} 小时', { d: days, h: hours });
    }

    if (hours > 0)
    {
      return t('{h} 小时 {m} 分钟', { h: hours, m: minutes });
    }

    return t('{m} 分钟', { m: minutes });
  }

  let headline = t('提示缓存：还没有记录。');

  if (state.kind === 'warm')
  {
    headline = t('提示缓存有效，大约还剩 {n} 分钟。', { n: state.minutesLeft });
  }
  else if (state.kind === 'cold')
  {
    headline = t('提示缓存大概已过期（已闲置 {idle}）。', { idle: idleText(state.idleMs) });
  }

  let detail = t('Claude 回复第一条消息后开始计时，这里会显示缓存还剩几分钟。');

  if (state.kind === 'warm')
  {
    detail = t('在这之前发消息，之前的对话按缓存价计费，更省额度、响应也更快。');
  }
  else if (state.kind === 'cold')
  {
    detail = t('下一条消息要重新缓存约 {n} token 的对话内容，会更慢、更耗额度；之后恢复正常。', {
      n: formatTokens(state.recacheTokens),
    });
  }

  return (
    <span
      className={`cache-indicator cache-indicator-${state.kind}`}
      role="status"
      aria-live="off"
      aria-label={`${headline}${detail}`}
      data-cache-window={state.kind}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M8 5v3.2l2.2 1.3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {state.kind === 'warm' && <span className="cache-indicator-left">{state.minutesLeft}m</span>}

      {hover && (
        <span className="cache-indicator-tip" role="tooltip">
          <span className="cache-indicator-tip-head">{headline}</span>
          <span>{detail}</span>
        </span>
      )}
    </span>
  );
}
