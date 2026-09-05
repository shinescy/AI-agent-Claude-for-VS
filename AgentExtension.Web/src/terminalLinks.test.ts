// 终端里的文件链接识别。
//
// 这里守的是「宁可少认不可错认」：认错一个路径，点下去会把用户的编辑器切到别的文件上，
// 比不给点更糟；而列号算错的话下划线画在别处，看着就像坏了。

import { describe, it, expect } from 'vitest';
import { findTerminalLinks, columnOf } from './terminalLinks';

function paths(text: string): string[]
{
  return findTerminalLinks(text).map((l) => l.path);
}

describe('终端里的文件链接', () =>
{
  it('带行号的位置认出来', () =>
  {
    const [link] = findTerminalLinks('已改 src/App.tsx:120');

    expect(link.path).toBe('src/App.tsx');
    expect(link.line).toBe(120);
    expect(link.raw).toBe('src/App.tsx:120');
  });

  it('行号后面还带列号也认，列号忽略', () =>
  {
    const [link] = findTerminalLinks('Foo.cs:12:5 报错');

    expect(link.path).toBe('Foo.cs');
    expect(link.line).toBe(12);
  });

  it('不带行号的路径也认，行号当 1', () =>
  {
    const [link] = findTerminalLinks('看一下 AgentExtension/Bridge/WebViewBridge.cs 这个文件');

    expect(link.path).toBe('AgentExtension/Bridge/WebViewBridge.cs');
    expect(link.line).toBe(1);
  });

  it('Windows 绝对路径的盘符冒号不会被当成行号', () =>
  {
    const [link] = findTerminalLinks('F:\\WrokSpace\\App.tsx:8');

    expect(link.path).toBe('F:\\WrokSpace\\App.tsx');
    expect(link.line).toBe(8);
  });

  it('一行里多处都认得出来', () =>
  {
    expect(paths('改了 a/b.ts:3 和 c/d.cs:9')).toEqual(['a/b.ts', 'c/d.cs']);
  });

  it('下标与结束位置对得上原文', () =>
  {
    const text = '前面 src/x.ts:2 后面';
    const [link] = findTerminalLinks(text);

    expect(text.slice(link.start, link.end)).toBe('src/x.ts:2');
  });

  // ── 不该认的 ────────────────────────────────────────────────────────────

  it('版本号不是文件', () =>
  {
    expect(findTerminalLinks('CLI 2.1.238 已就绪')).toEqual([]);
  });

  it('「e.g」这类缩写不是文件——扩展名至少两个字符', () =>
  {
    expect(findTerminalLinks('e.g 这样写')).toEqual([]);
  });

  it('网址整段不认，那该交给浏览器', () =>
  {
    expect(findTerminalLinks('见 https://example.com/docs/index.html')).toEqual([]);
  });

  it('不认识的扩展名，不带行号时不认', () =>
  {
    expect(findTerminalLinks('生成了 output.qqq')).toEqual([]);
  });

  it('不认识的扩展名，带了行号就认——那个形状本身就是位置', () =>
  {
    expect(paths('output.qqq:14')).toEqual(['output.qqq']);
  });

  it('前面那个 @ 不挡事——那正是本项目引用文件的写法', () =>
  {
    expect(paths('@src/App.tsx 看一下')).toEqual(['src/App.tsx']);
  });

  it('句末标点不会被吞进路径里', () =>
  {
    const [link] = findTerminalLinks('改的是 src/App.tsx。');

    expect(link.path).toBe('src/App.tsx');
  });

  it('空行返回空数组，不抛', () =>
  {
    expect(findTerminalLinks('')).toEqual([]);
  });
});

describe('列号换算', () =>
{
  it('纯 ASCII 时列号就是下标加一', () =>
  {
    expect(columnOf('abc def', 4)).toBe(5);
  });

  it('中文按两列算——终端是按显示宽度排版的', () =>
  {
    // 「已改」两个中文 = 4 列，所以第 3 个字符（下标 2）从第 5 列开始。
    expect(columnOf('已改 src/App.tsx', 2)).toBe(5);
  });

  it('下标越界不抛，按整行长度算', () =>
  {
    expect(columnOf('ab', 99)).toBe(3);
  });
});
