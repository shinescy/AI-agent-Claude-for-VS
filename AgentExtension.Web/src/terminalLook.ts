// 把「外观设置 + VS 主题令牌」换算成 xterm 的字体与配色选项。

import type { Appearance } from './appearance';

/** 交给 xterm 的那几项。 */
export interface TerminalLook
{
  fontFamily: string;
  fontSize: number;
  theme: {
    background: string;
    foreground: string;
    cursor: string;
    cursorAccent: string;
    selectionBackground: string;
  };
}

/** 读一个 CSS 变量；取不到返回空串。 */
export type VarReader = (name: string) => string;

/** 兜底值。 */
const FALLBACK_FONT = 'Consolas, "Cascadia Mono", monospace';
const FALLBACK_BACKGROUND = '#1E1E1E';
const FALLBACK_FOREGROUND = '#D4D4D4';

export function resolveTerminalLook(appearance: Appearance, readVar: VarReader): TerminalLook
{
  const fontFamily = pick(appearance.fontFamily, readVar('--font-code'), FALLBACK_FONT);

  const background = pick(readVar('--vs-background'), FALLBACK_BACKGROUND);

  const foreground = pick(appearance.textColor, readVar('--vs-foreground'), FALLBACK_FOREGROUND);

  const accent = pick(readVar('--vs-accent'), foreground);

  const look: TerminalLook = {
    fontFamily,
    fontSize: appearance.fontSize,
    theme: {
      background,
      foreground,
      cursor: foreground,
      cursorAccent: background,
      selectionBackground: withAlpha(accent, 0.35),
    },
  };

  return look;
}

/** 取第一个非空串。 */
function pick(...values: string[]): string
{
  for (const value of values)
  {
    if (typeof value === 'string' && value.trim() !== '')
    {
      return value.trim();
    }
  }

  return '';
}

/** 给 `#RRGGBB` 加上 alpha 变成 `rgba(...)`。 */
export function withAlpha(color: string, alpha: number): string
{
  const match = /^#([0-9a-fA-F]{6})$/.exec(color.trim());

  if (match === null)
  {
    return color;
  }

  const hex = match[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 从根元素读 CSS 变量。 */
export function cssVarReader(): VarReader
{
  return (name: string) =>
  {
    if (typeof window === 'undefined' || typeof getComputedStyle !== 'function')
    {
      return '';
    }

    return getComputedStyle(document.documentElement).getPropertyValue(name);
  };
}
