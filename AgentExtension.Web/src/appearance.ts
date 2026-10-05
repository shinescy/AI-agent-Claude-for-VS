// 外观设置：字体、字号、文字颜色，以及输入框高度。

/** 只用到的那几个 Storage 方法。 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 只用到的那几个样式操作，HTMLElement 天然满足。 */
export interface StyleTarget {
  style: {
    setProperty(name: string, value: string): void;
    removeProperty(name: string): string;
  };
}

/** 一份外观设置。 */
export interface Appearance {
  /** CSS font-family 值；空串表示跟随宿主默认。 */
  fontFamily: string;
  /** 正文字号（px）。 */
  fontSize: number;
  /** 正文颜色；空串表示跟随 VS 主题。 */
  textColor: string;
}

/** 输入框高度（px）；null 表示未手动调整过，用默认高度。 */
export type ComposerHeight = number | null;

const STORAGE_KEY = 'agent.appearance';
/** 输入框高度的默认存档键。 */
const HEIGHT_KEY = 'agent.composerHeight';

/** 字号允许范围。 */
export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 24;

/** 输入框高度允许范围。 */
export const COMPOSER_HEIGHT_MIN = 48;
export const COMPOSER_HEIGHT_MAX = 600;

/** 可选字体。 */
export const FONT_FAMILIES: { value: string; label: string }[] = [
  { value: '', label: '跟随 VS' },
  { value: 'Consolas, monospace', label: 'Consolas' },
  { value: '"Cascadia Code", "Cascadia Mono", monospace', label: 'Cascadia Code' },
  { value: '"JetBrains Mono", monospace', label: 'JetBrains Mono' },
  { value: '"Microsoft YaHei UI", "Segoe UI", sans-serif', label: '微软雅黑' },
  { value: '"Segoe UI", sans-serif', label: 'Segoe UI' },
];

export const DEFAULT_APPEARANCE: Appearance = {
  fontFamily: '',
  fontSize: 13,
  textColor: '',
};

/** 存不下也不该炸的空实现，用于没有 localStorage 的环境。 */
const NULL_STORAGE: StorageLike = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

/** 默认存储。 */
export function defaultStorage(): StorageLike {
  try
  {
    if (typeof window !== 'undefined' && window.localStorage)
    {
      return window.localStorage;
    }
  }
  catch
  {
    // localStorage 可能被策略禁用，访问本身就会抛。
  }
  return NULL_STORAGE;
}

/** 夹到区间内；非有限数一律回退到默认值。 */
export function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value))
  {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** 校验/补全一份可能不完整或来路不明的外观设置，缺字段或形状不对的一律退回默认值。
    读本地存档、以及接收其它 tab 广播来的偏好，两处共用同一份校验逻辑。 */
export function sanitizeAppearance(parsed: Partial<Appearance> | null | undefined): Appearance {
  if (!parsed)
  {
    return DEFAULT_APPEARANCE;
  }

  return {
    fontFamily: typeof parsed.fontFamily === 'string' ? parsed.fontFamily : DEFAULT_APPEARANCE.fontFamily,
    fontSize: clamp(Number(parsed.fontSize), FONT_SIZE_MIN, FONT_SIZE_MAX, DEFAULT_APPEARANCE.fontSize),
    textColor: typeof parsed.textColor === 'string' ? parsed.textColor : DEFAULT_APPEARANCE.textColor,
  };
}

/** 读取已保存的设置。 */
export function loadAppearance(storage: StorageLike = defaultStorage()): Appearance {
  try
  {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw)
    {
      return DEFAULT_APPEARANCE;
    }

    return sanitizeAppearance(JSON.parse(raw) as Partial<Appearance>);
  }
  catch
  {
    return DEFAULT_APPEARANCE;
  }
}

export function saveAppearance(appearance: Appearance, storage: StorageLike = defaultStorage()): void {
  try
  {
    storage.setItem(STORAGE_KEY, JSON.stringify(appearance));
  }
  catch
  {
  }
}

export function loadComposerHeight(
  storage: StorageLike = defaultStorage(), key: string = HEIGHT_KEY): ComposerHeight {
  try
  {
    const raw = storage.getItem(key);
    if (!raw)
    {
      return null;
    }
    const value = Number(raw);
    if (!Number.isFinite(value))
    {
      return null;
    }
    return clamp(value, COMPOSER_HEIGHT_MIN, COMPOSER_HEIGHT_MAX, COMPOSER_HEIGHT_MIN);
  }
  catch
  {
    return null;
  }
}

export function saveComposerHeight(
  height: number, storage: StorageLike = defaultStorage(), key: string = HEIGHT_KEY): void {
  try
  {
    storage.setItem(key, String(Math.round(height)));
  }
  catch
  {
  }
}

/** 清除已保存的高度，回到 CSS 里的默认值。 */
export function clearComposerHeight(
  storage: StorageLike = defaultStorage(), key: string = HEIGHT_KEY): void {
  try
  {
    storage.removeItem(key);
  }
  catch
  {
  }
}

/** 把设置写成 CSS 变量挂到目标元素上。 */
export function applyAppearance(appearance: Appearance, root: StyleTarget): void {
  if (appearance.fontFamily)
  {
    root.style.setProperty('--user-font-family', appearance.fontFamily);
  }
  else
  {
    root.style.removeProperty('--user-font-family');
  }

  root.style.setProperty('--user-font-size', `${appearance.fontSize}px`);

  if (appearance.textColor)
  {
    root.style.setProperty('--user-text-color', appearance.textColor);
  }
  else
  {
    root.style.removeProperty('--user-text-color');
  }
}
