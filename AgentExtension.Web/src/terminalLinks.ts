// 认出终端输出里的文件位置，好让它能点开。

/** 终端里一处可点的文件位置。start/end 是行内下标，左闭右开。 */
export interface TerminalLink
{
  start: number;
  end: number;
  /** 原样的匹配文本，交给 xterm 当链接文字。 */
  raw: string;
  path: string;
  /** 行号（1 起）；没写行号时是 1。 */
  line: number;
}

/**
 * 不带行号也照样认的扩展名。带了行号（<c>foo.xyz:12</c>）则不限扩展名——
 * 那个形状本身已经说明它是个位置。
 */
const KNOWN = new Set([
  'cs', 'csproj', 'sln', 'slnx', 'xaml', 'config', 'props', 'targets', 'vb', 'razor',
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'css', 'scss', 'html', 'vue', 'svelte',
  'py', 'java', 'kt', 'go', 'rs', 'rb', 'php', 'swift', 'cpp', 'cc', 'hpp', 'sql',
  'md', 'txt', 'log', 'yml', 'yaml', 'toml', 'ini', 'xml', 'sh', 'ps1', 'psm1', 'bat', 'cmd',
]);

/**
 * 路径 + 可选的 <c>:行[:列]</c>。
 *
 * 扩展名至少两个字符：一个字符的话「e.g」「i.e」这种缩写会被当成文件，
 * 而终端里这类词比 .c/.h 常见得多。
 */
const CANDIDATE =
  /(?:[A-Za-z]:[\\/])?(?:[\w.\-]+[\\/])*[\w\-]+\.[A-Za-z][A-Za-z0-9]{1,9}(?::\d+){0,2}/g;

/**
 * 前面紧挨着这些就不认：它多半是更长一个词的尾巴。
 *
 * 网址也是靠这条挡掉的——`https://x/y.html` 里 `y.html` 前面是 `/`。
 * 不含 `@`：那正是本项目引用文件的写法（`@src/App.tsx`），挡掉等于自己人不认。
 */
const GLUED_BEFORE = /[\w:/\\.-]$/;

/**
 * 扫出一行里全部可点的文件位置。
 *
 * 宁可少认不可错认：点开一个猜错的文件，比不给点更糟——它会把用户的编辑器切走。
 */
export function findTerminalLinks(text: string): TerminalLink[]
{
  if (!text)
  {
    return [];
  }

  const found: TerminalLink[] = [];

  CANDIDATE.lastIndex = 0;

  let match = CANDIDATE.exec(text);

  while (match !== null)
  {
    const raw = match[0];
    const start = match.index;

    if (accept(text, start, raw))
    {
      // 只从结尾认行号：盘符那个冒号（C:\a\b.cs）不能当分隔。
      const tail = /:(\d+)(?::\d+)?$/.exec(raw);
      const path = tail === null ? raw : raw.slice(0, tail.index);
      const line = tail === null ? 1 : Number.parseInt(tail[1], 10);

      found.push({
        start,
        end: start + raw.length,
        raw,
        path,
        line: Number.isFinite(line) && line > 0 ? line : 1,
      });
    }

    match = CANDIDATE.exec(text);
  }

  return found;
}

function accept(text: string, start: number, raw: string): boolean
{
  const before = text.slice(0, start);

  if (GLUED_BEFORE.test(before))
  {
    return false;
  }

  const tail = /:(\d+)(?::\d+)?$/.exec(raw);

  if (tail !== null)
  {
    return true;
  }

  const ext = raw.slice(raw.lastIndexOf('.') + 1).toLowerCase();

  return KNOWN.has(ext);
}

/**
 * 行内下标换算成终端列号（1 起）。
 *
 * 不能直接拿下标当列：终端按**显示宽度**排版，中日韩文字占两列。TUI 的输出里中文很常见，
 * 不换算的话链接的下划线会整体左移，点上去也不是那个位置。
 */
export function columnOf(text: string, index: number): number
{
  let column = 1;

  for (let i = 0; i < index && i < text.length; i++)
  {
    column += isWide(text.codePointAt(i) ?? 0) ? 2 : 1;
  }

  return column;
}

function isWide(code: number): boolean
{
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  );
}
