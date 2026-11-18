// 会话小弹层的纯逻辑：相对时间、时间解析、搜索过滤。

import type { PanelItemView } from './panelState';

/** 相对时间的单位；now 是不足一分钟。 */
export type RelativeUnit = 'now' | 'minute' | 'hour' | 'day' | 'month' | 'year';

/** 相对时间：数值 + 单位。 */
export interface RelativeTime {
  unit: RelativeUnit;
  n: number;
}

type Translate = (zhText: string, params?: Record<string, string | number>) => string;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** 每个单位的中文模板，英文在 i18n 表里。 */
export const RELATIVE_UNIT_TEXT: Record<Exclude<RelativeUnit, 'now'>, string> = {
  minute: '{n} 分钟前',
  hour: '{n} 小时前',
  day: '{n} 天前',
  month: '{n} 个月前',
  year: '{n} 年前',
};

/**
 * 距今多久，全部向下取整；没有「周」这一档。
 * 未来的时间（时钟漂移）按刚刚算。
 */
export function relativeTime(thenMs: number, nowMs: number): RelativeTime {
  const elapsed = Math.max(0, nowMs - thenMs);
  const days = Math.floor(elapsed / DAY_MS);
  const years = Math.floor(days / 365);
  const months = Math.floor(days / 30);
  const hours = Math.floor(elapsed / HOUR_MS);
  const minutes = Math.floor(elapsed / MINUTE_MS);

  if (years > 0)
  {
    return { unit: 'year', n: years };
  }

  if (months > 0)
  {
    return { unit: 'month', n: months };
  }

  if (days > 0)
  {
    return { unit: 'day', n: days };
  }

  if (hours > 0)
  {
    return { unit: 'hour', n: hours };
  }

  if (minutes > 0)
  {
    return { unit: 'minute', n: minutes };
  }

  return { unit: 'now', n: 0 };
}

/** 把相对时间写成当前语言的短文本。 */
export function formatRelativeTime(value: RelativeTime, t: Translate): string {
  if (value.unit === 'now')
  {
    return t('刚刚');
  }

  return t(RELATIVE_UNIT_TEXT[value.unit], { n: value.n });
}

/** 把宿主给的本地时间 `yyyy-MM-dd HH:mm` 解析成毫秒；形状不对返回 null。 */
export function parseLocalTime(text: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(text.trim());

  if (match === null)
  {
    return null;
  }

  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const ms = new Date(year, month - 1, day, hour, minute).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** 一条会话的最后活动时间；读不出来返回 null。 */
export function sessionTimeMs(item: PanelItemView): number | null {
  const exact = Number(item.fields['lastActivityMs']);

  if (Number.isFinite(exact) && exact > 0)
  {
    return exact;
  }

  return parseLocalTime(item.subtitle);
}

/** 行尾显示的时间：能算相对时间就用它，否则原样给宿主的字符串。 */
export function sessionTimeLabel(item: PanelItemView, nowMs: number, t: Translate): string {
  const ms = sessionTimeMs(item);
  return ms === null ? item.subtitle : formatRelativeTime(relativeTime(ms, nowMs), t);
}

/** 只留有真实对话的会话，再按标题或分支做不分大小写的子串匹配。 */
export function filterSessions(items: PanelItemView[], query: string): PanelItemView[] {
  const q = query.trim().toLowerCase();
  const real = items.filter((item) => item.enabled);

  if (q === '')
  {
    return real;
  }

  return real.filter((item) =>
    item.title.toLowerCase().includes(q) || (item.fields['branch'] ?? '').toLowerCase().includes(q));
}
