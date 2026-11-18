// 消息时刻的显示：钟点、日期分隔线的日期。

import type { Lang } from './i18n';

/** 时刻所在那天的本地零点。 */
function startOfDay(ms: number): number
{
  const day = new Date(ms);
  day.setHours(0, 0, 0, 0);
  const result = day.getTime();
  return result;
}

/** 两个时刻是不是同一天（本地时区）。 */
export function sameDay(a: number, b: number): boolean
{
  const same = startOfDay(a) === startOfDay(b);
  return same;
}

/** 钟点：14:05。 */
export function formatClock(ms: number): string
{
  const at = new Date(ms);
  const text = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  return text;
}

/** 完整时刻，放悬停提示里。 */
export function formatFull(ms: number, lang: Lang): string
{
  const text = new Date(ms).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour12: false });
  return text;
}

/** 分隔线上的日期：今天、昨天，其余写全日期带星期。 */
export function formatDay(ms: number, nowMs: number, lang: Lang): string
{
  const days = Math.round((startOfDay(nowMs) - startOfDay(ms)) / 86400000);

  if (days === 0)
  {
    return lang === 'zh' ? '今天' : 'Today';
  }

  if (days === 1)
  {
    return lang === 'zh' ? '昨天' : 'Yesterday';
  }

  const text = new Date(ms).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  });
  return text;
}
