// 额度用量的排版。

import type { UsageWindow } from './types';

/** 翻译函数的形状，与 LangContext 的 useT 返回值一致。 */
export type Translate = (zh: string, params?: Record<string, string | number>) => string;

/** 把剩余秒数排版成人能扫一眼读懂的形式。 */
export function formatRemaining(totalSeconds: number, t: Translate): string {
  if (totalSeconds <= 0) {
    return t('已重置');
  }

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return t('{d} 天 {h} 小时', { d: days, h: hours });
  }

  if (hours > 0) {
    return t('{h} 小时 {m} 分', { h: hours, m: minutes });
  }

  return t('{m} 分 {s} 秒', { m: minutes, s: seconds });
}

/** 一个窗口的「还剩多久」该显示成什么。 */
export function formatReset(window: UsageWindow, nowSeconds: number, t: Translate): string {
  if (window.resetsAtUnix > 0) {
    return t('余 {left}', { left: formatRemaining(window.resetsAtUnix - nowSeconds, t) });
  }

  return t('重置于 {when}', { when: window.resetsAtText });
}

/** 窗口标签的显示文案。 */
export function formatWindowLabel(window: UsageWindow, t: Translate): string {
  if (window.label === 'Current session') {
    return t('当前会话');
  }

  if (window.label === 'Current week (all models)') {
    return t('本周');
  }

  if (window.model !== '') {
    return t('本周（{model}）', { model: window.model });
  }

  return window.label;
}
