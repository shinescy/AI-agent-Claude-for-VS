// 上下文计量：用最近一轮的用量与模型窗口算「上下文还剩多少」。

import type { AgentTurnResult, AgentUsage } from './types';

/** 上下文占用；任一项未知为 null。 */
export interface ContextMeter
{
  /** 最近一次主对话请求喂给模型的 token 数。 */
  usedTokens: number | null;
  /** 模型上下文窗口大小。 */
  window: number | null;
}

/** 什么都还不知道的计量。 */
export const EMPTY_METER: ContextMeter = { usedTokens: null, window: null };

/** 收到一条用量后更新已用量：输入 + 缓存读 + 缓存写。 */
export function meterAfterUsage(m: ContextMeter, u: AgentUsage): ContextMeter
{
  const used = u.inputTokens + u.cacheReadTokens + u.cacheCreationTokens;
  return { ...m, usedTokens: used };
}

/** 一轮结束后更新窗口；窗口缺失或为 0 时保留旧值。 */
export function meterAfterTurn(m: ContextMeter, r: AgentTurnResult | null): ContextMeter
{
  const window = r?.contextWindow;
  if (window && window > 0)
  {
    return { ...m, window };
  }

  return m;
}

/** 压缩完成后已用量换成压缩后的数；CLI 没报（0）就当不知道，窗口不动。 */
export function meterAfterCompaction(m: ContextMeter, postTokens: number): ContextMeter
{
  const usedTokens = postTokens > 0 ? postTokens : null;
  return { ...m, usedTokens };
}

/** 上下文剩余比例，夹在 0 到 1；已用量或窗口未知返回 null。 */
export function remainingRatio(m: ContextMeter): number | null
{
  if (m.usedTokens === null || m.window === null || m.window <= 0)
  {
    return null;
  }

  const ratio = 1 - m.usedTokens / m.window;
  return Math.min(1, Math.max(0, ratio));
}
