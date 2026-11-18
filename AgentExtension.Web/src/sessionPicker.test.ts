import { describe, it, expect } from 'vitest';
import {
  filterSessions, formatRelativeTime, parseLocalTime, relativeTime, sessionTimeLabel, sessionTimeMs,
} from './sessionPicker';
import { translate } from './i18n';
import type { PanelItemView } from './panelState';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = new Date(2026, 10, 15, 12, 0).getTime();

const zh = (text: string, params?: Record<string, string | number>) => translate('zh', text, params);
const en = (text: string, params?: Record<string, string | number>) => translate('en', text, params);

function session(id: string, title: string, extra: Partial<PanelItemView> = {}): PanelItemView {
  return {
    id, title, subtitle: '2026-11-15 11:30', enabled: true, detail: '', fields: {}, currentProject: true,
    ...extra,
  };
}

describe('相对时间', () => {
  it('不足一分钟是刚刚', () => {
    expect(relativeTime(NOW - 59 * 1000, NOW)).toEqual({ unit: 'now', n: 0 });
  });

  it('各档都向下取整', () => {
    expect(relativeTime(NOW - 90 * 1000, NOW)).toEqual({ unit: 'minute', n: 1 });
    expect(relativeTime(NOW - 59 * MINUTE, NOW)).toEqual({ unit: 'minute', n: 59 });
    expect(relativeTime(NOW - 60 * MINUTE, NOW)).toEqual({ unit: 'hour', n: 1 });
    expect(relativeTime(NOW - 23 * HOUR, NOW)).toEqual({ unit: 'hour', n: 23 });
    expect(relativeTime(NOW - 24 * HOUR, NOW)).toEqual({ unit: 'day', n: 1 });
  });

  it('没有「周」这一档：14 天还是天，30 天起算月', () => {
    expect(relativeTime(NOW - 14 * DAY, NOW)).toEqual({ unit: 'day', n: 14 });
    expect(relativeTime(NOW - 29 * DAY, NOW)).toEqual({ unit: 'day', n: 29 });
    expect(relativeTime(NOW - 30 * DAY, NOW)).toEqual({ unit: 'month', n: 1 });
    expect(relativeTime(NOW - 364 * DAY, NOW)).toEqual({ unit: 'month', n: 12 });
    expect(relativeTime(NOW - 365 * DAY, NOW)).toEqual({ unit: 'year', n: 1 });
    expect(relativeTime(NOW - 800 * DAY, NOW)).toEqual({ unit: 'year', n: 2 });
  });

  it('未来的时间按刚刚算', () => {
    expect(relativeTime(NOW + HOUR, NOW)).toEqual({ unit: 'now', n: 0 });
  });

  it('英文界面是紧凑缩写', () => {
    expect(formatRelativeTime({ unit: 'now', n: 0 }, en)).toBe('now');
    expect(formatRelativeTime({ unit: 'minute', n: 5 }, en)).toBe('5m');
    expect(formatRelativeTime({ unit: 'hour', n: 3 }, en)).toBe('3h');
    expect(formatRelativeTime({ unit: 'day', n: 14 }, en)).toBe('14d');
    expect(formatRelativeTime({ unit: 'month', n: 1 }, en)).toBe('1mo');
    expect(formatRelativeTime({ unit: 'year', n: 2 }, en)).toBe('2y');
  });

  it('中文界面是中文说法', () => {
    expect(formatRelativeTime({ unit: 'now', n: 0 }, zh)).toBe('刚刚');
    expect(formatRelativeTime({ unit: 'minute', n: 5 }, zh)).toBe('5 分钟前');
    expect(formatRelativeTime({ unit: 'hour', n: 3 }, zh)).toBe('3 小时前');
    expect(formatRelativeTime({ unit: 'day', n: 14 }, zh)).toBe('14 天前');
    expect(formatRelativeTime({ unit: 'month', n: 1 }, zh)).toBe('1 个月前');
    expect(formatRelativeTime({ unit: 'year', n: 2 }, zh)).toBe('2 年前');
  });
});

describe('会话的时间', () => {
  it('宿主给的本地时间按本地时区解析', () => {
    expect(parseLocalTime('2026-11-15 11:30')).toBe(new Date(2026, 10, 15, 11, 30).getTime());
    expect(parseLocalTime('昨天')).toBeNull();
    expect(parseLocalTime('')).toBeNull();
  });

  it('有毫秒字段时优先用它', () => {
    const item = session('a', '标题', { fields: { lastActivityMs: String(NOW - 2 * HOUR) } });

    expect(sessionTimeMs(item)).toBe(NOW - 2 * HOUR);
    expect(sessionTimeLabel(item, NOW, en)).toBe('2h');
  });

  it('没有毫秒字段就解析副标题；解析不了原样显示', () => {
    expect(sessionTimeLabel(session('a', '标题'), NOW, en)).toBe('30m');
    expect(sessionTimeLabel(session('a', '标题', { subtitle: '未知' }), NOW, en)).toBe('未知');
  });
});

describe('会话过滤', () => {
  const items = [
    session('a', 'Fix login bug', { fields: { branch: 'main' } }),
    session('b', '重构命令菜单', { fields: { branch: 'feature/menu' } }),
    session('c', '探测', { enabled: false }),
  ];

  it('没有查询时只去掉启动探测留下的会话', () => {
    expect(filterSessions(items, '').map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('按标题或分支做不分大小写的子串匹配', () => {
    expect(filterSessions(items, 'LOGIN').map((x) => x.id)).toEqual(['a']);
    expect(filterSessions(items, 'menu').map((x) => x.id)).toEqual(['b']);
    expect(filterSessions(items, '命令').map((x) => x.id)).toEqual(['b']);
    expect(filterSessions(items, 'zzz')).toEqual([]);
  });

  it('探测会话搜也搜不到', () => {
    expect(filterSessions(items, '探测')).toEqual([]);
  });
});
