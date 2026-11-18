// 语言的分发。

import { createContext, useContext } from 'react';
import type { Lang } from './i18n';
import { translate, fieldLabel, tabTitle, noticeText } from './i18n';

export const LangContext = createContext<Lang>('zh');

/** 取当前语言的翻译函数。 */
export function useT(): (zhText: string, params?: Record<string, string | number>) => string {
  const lang = useContext(LangContext);
  return (zhText, params) => translate(lang, zhText, params);
}

/** tab 标题 → 当前语言的写法。 */
export function useTabTitle(): (title: string) => string {
  const lang = useContext(LangContext);
  return (title) => tabTitle(lang, title);
}

/** 宿主推来的系统提示 → 当前语言的写法。 */
export function useNoticeText(): (
  fallback: string, key?: string, args?: Record<string, string>) => string {
  const lang = useContext(LangContext);
  return (fallback, key, args) => noticeText(lang, fallback, key, args);
}

/** 详情字段键 → 显示标签。 */
export function useFieldLabel(): (key: string) => string {
  const lang = useContext(LangContext);
  return (key) => fieldLabel(lang, key);
}
