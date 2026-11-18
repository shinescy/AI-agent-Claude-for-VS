// 提示缓存还剩多久：按最近一条回复的时刻与缓存有效期推算。

import type { AgentUsage } from './types';

/** 最近一次用到缓存的回复留下的记录。 */
export interface PromptCacheRecord {
  /** 那条回复的时刻，Unix 毫秒。 */
  anchorAt: number;
  /** 缓存有效期；没读到是空串。 */
  ttl: string;
  /** 缓存过期后下一条消息要重新缓存的 token 数。 */
  recacheTokens: number;
}

export type CacheWindow =
  | { kind: 'unknown' }
  | { kind: 'warm'; minutesLeft: number }
  | { kind: 'cold'; idleMs: number; recacheTokens: number };

const TTL_MS: Record<string, number> = {
  '5m': 5 * 60 * 1000,
  '1h': 60 * 60 * 1000,
};

/** 有效期没读到时，闲置超过最长有效期也算过期。 */
const LONGEST_TTL_MS = TTL_MS['1h'];

/** 收到一条用量后，记录该怎么变。 */
export function nextCacheRecord(
  previous: PromptCacheRecord | null,
  usage: AgentUsage): PromptCacheRecord | null {
  const at = usage.atUnixMs ?? 0;

  if (at <= 0)
  {
    return previous;
  }

  const cachedTokens = usage.cacheReadTokens + usage.cacheCreationTokens;
  const ttl = cachedTokens > 0 ? (usage.cacheTtl || previous?.ttl || '') : '';

  return {
    anchorAt: at,
    ttl,
    recacheTokens: usage.inputTokens + cachedTokens,
  };
}

/** 此刻缓存是热是冷。 */
export function cacheWindow(record: PromptCacheRecord | null, nowMs: number): CacheWindow {
  if (record === null)
  {
    return { kind: 'unknown' };
  }

  const idleMs = Math.max(0, nowMs - record.anchorAt);
  const span = TTL_MS[record.ttl];

  if (span === undefined)
  {
    return idleMs > LONGEST_TTL_MS
      ? { kind: 'cold', idleMs, recacheTokens: record.recacheTokens }
      : { kind: 'unknown' };
  }

  const left = span - idleMs;

  if (left > 0)
  {
    return { kind: 'warm', minutesLeft: Math.ceil(left / 60000) };
  }

  return { kind: 'cold', idleMs, recacheTokens: record.recacheTokens };
}

/** 把 token 数写短，如 114.8k、1.2M。 */
export function formatTokens(count: number): string {
  if (count >= 1e6)
  {
    return `${(count / 1e6).toFixed(1)}M`;
  }

  if (count >= 1000)
  {
    return `${(count / 1000).toFixed(1)}k`;
  }

  return String(count);
}

/** 把闲置时长拆成天、小时、分钟。 */
export function splitIdle(idleMs: number): { days: number; hours: number; minutes: number } {
  const totalMinutes = Math.max(0, Math.floor(idleMs / 60000));
  const totalHours = Math.floor(totalMinutes / 60);

  return {
    days: Math.floor(totalHours / 24),
    hours: totalHours % 24,
    minutes: totalMinutes % 60,
  };
}
