// 终端字体与配色的换算。
//
// 守的是一次真实反馈：「字体大小颜色调整对终端没有效果」。
// 病根是 xterm **不读 CSS**——它的字体、字号、前景背景都是 JS 选项，字形宽度还要
// 它自己在 canvas 上量。之前的代码把 `var(--vs-font-mono, ...)` 这串 CSS 文本
// 直接交给了它，canvas 解析不了，于是全程用自带默认值：13px、纯白字、纯黑底。
// 而且不报任何错——又是一次静默失效。

import { describe, it, expect } from 'vitest';
import { resolveTerminalLook, withAlpha } from './terminalLook';
import { DEFAULT_APPEARANCE } from './appearance';
import type { Appearance } from './appearance';

/** 造一个变量表读取器。 */
function reader(vars: Record<string, string>)
{
  return (name: string) => vars[name] ?? '';
}

const THEME = {
  '--vs-background': '#282828',
  '--vs-foreground': '#FAFAFA',
  '--vs-accent': '#83BEEB',
  '--font-code': '"Cascadia Code", Consolas, monospace',
};

function appearance(overrides: Partial<Appearance> = {}): Appearance
{
  return { ...DEFAULT_APPEARANCE, ...overrides };
}

describe('终端字体与配色', () =>
{
  it('字号用用户设的那个，不是写死的 13', () =>
  {
    const look = resolveTerminalLook(appearance({ fontSize: 18 }), reader(THEME));

    expect(look.fontSize).toBe(18);
  });

  it('字体用用户选的那个', () =>
  {
    const look = resolveTerminalLook(
      appearance({ fontFamily: '"JetBrains Mono", monospace' }), reader(THEME));

    expect(look.fontFamily).toBe('"JetBrains Mono", monospace');
  });

  it('没选字体就跟随面板的等宽字体令牌', () =>
  {
    const look = resolveTerminalLook(appearance(), reader(THEME));

    expect(look.fontFamily).toBe('"Cascadia Code", Consolas, monospace');
  });

  it('产出的字体里**绝不能**留下 CSS 变量', () =>
  {
    // 这条是这个模块存在的全部理由。留一个 var(...) 进去，xterm 会安静地
    // 退回自带默认值，界面上看不出任何异常，只是设置从来没生效过。
    const look = resolveTerminalLook(appearance(), reader({}));

    expect(look.fontFamily).not.toContain('var(');
    expect(look.theme.background).not.toContain('var(');
    expect(look.theme.foreground).not.toContain('var(');
  });

  it('底色前景跟随 VS 主题', () =>
  {
    const look = resolveTerminalLook(appearance(), reader(THEME));

    expect(look.theme.background).toBe('#282828');
    expect(look.theme.foreground).toBe('#FAFAFA');
  });

  it('用户设了文字颜色就盖过主题前景', () =>
  {
    const look = resolveTerminalLook(appearance({ textColor: '#00FF00' }), reader(THEME));

    expect(look.theme.foreground).toBe('#00FF00');
    // 光标跟着字走，否则用户改了字色会发现光标还是旧颜色。
    expect(look.theme.cursor).toBe('#00FF00');
  });

  it('主题令牌还没到时给的是能看的深色兜底，不是空串', () =>
  {
    // 空串交给 xterm 等于没设，它会退回默认值——那正是要修的毛病。
    const look = resolveTerminalLook(appearance(), reader({}));

    expect(look.theme.background).not.toBe('');
    expect(look.theme.foreground).not.toBe('');
  });

  it('选区底色是半透明的，盖不住字', () =>
  {
    const look = resolveTerminalLook(appearance(), reader(THEME));

    // 终端里选中往往就是为了看清并复制那几个字，不透明的强调色会把它们整段盖掉。
    expect(look.theme.selectionBackground).toContain('rgba(');
  });
});

describe('十六进制加透明度', () =>
{
  it('#RRGGBB 转成 rgba', () =>
  {
    expect(withAlpha('#83BEEB', 0.35)).toBe('rgba(131, 190, 235, 0.35)');
  });

  it('认不出的形状原样返回，不制造非法值', () =>
  {
    // 为一个选区底色把整个终端的配色搞崩不值得。
    expect(withAlpha('transparent', 0.35)).toBe('transparent');
  });
});
