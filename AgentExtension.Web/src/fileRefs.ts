// 识别代理输出里的文件位置引用，如 `Foo.cs:12`、`src/app.ts:8-20`。

export interface FileReference {
  /** 原始匹配文本，用于在 DOM 里替换。 */
  raw: string;
  /** 文件路径，可能是相对路径、绝对路径或裸文件名。 */
  path: string;
  /** 起始行号（1 起）。 */
  line: number;
  /** 匹配在原字符串中的起始下标。 */
  index: number;
}

/** 匹配 `路径.扩展名:行号[-结束行]`。 */
const FILE_REF = /(?<![\w:/\\])((?:[A-Za-z]:[\\/])?[\w.\-]*(?:[\\/][\w.\- ]+)*[\w\-]+\.[A-Za-z][A-Za-z0-9]{0,9}):(\d+)(?:-\d+)?\b/g;

/** 按扩展名判断是不是图片；图片在面板里预览，不交给 VS 的图片编辑器。 */
export function isImagePath(path: string): boolean {
  const result = /\.(png|jpe?g|gif|webp|bmp|svg|ico)$/i.test(path.trim());
  return result;
}

/** markdown 链接指向的文件位置；不是文件（网址、页内锚点）时为 null。 */
export function parseFileHref(href: string): { path: string; line: number } | null {
  let raw = (href ?? '').trim();

  if (raw === '' || raw.startsWith('#')) {
    return null;
  }

  // 别的协议（http、mailto…）不是文件；盘符 C:\ 不算协议
  const isFileUrl = /^file:/i.test(raw);
  if (!isFileUrl && /^[A-Za-z][A-Za-z0-9+.-]+:/.test(raw)) {
    return null;
  }

  if (isFileUrl) {
    raw = raw.replace(/^file:\/*/i, '');
    // file:///C:/x 去掉斜杠后是 C:/x；file:///home/x 要补回根
    if (!/^[A-Za-z]:/.test(raw)) {
      raw = '/' + raw;
    }
  }

  let line = 0;
  const hash = raw.indexOf('#');

  if (hash >= 0) {
    const fragment = /^L(\d+)/i.exec(raw.slice(hash + 1));
    line = fragment ? Number.parseInt(fragment[1], 10) : 0;
    raw = raw.slice(0, hash);
  }

  let path: string;
  try {
    path = decodeURIComponent(raw);
  }
  catch {
    path = raw;
  }

  const suffix = /^(.*\.[A-Za-z][A-Za-z0-9]{0,9}):(\d+)(?:-\d+)?$/.exec(path);
  if (suffix) {
    path = suffix[1];
    line = line || Number.parseInt(suffix[2], 10);
  }

  if (path === '') {
    return null;
  }

  const result = { path, line };
  return result;
}

/** 扫出全部文件引用，按出现顺序返回。 */
export function findFileReferences(text: string): FileReference[] {
  if (!text) {
    return [];
  }

  const results: FileReference[] = [];

  FILE_REF.lastIndex = 0;

  let match = FILE_REF.exec(text);

  while (match !== null) {
    const line = Number.parseInt(match[2], 10);

    if (Number.isFinite(line) && line > 0) {
      results.push({
        raw: match[0],
        path: match[1],
        line,
        index: match.index,
      });
    }

    match = FILE_REF.exec(text);
  }

  return results;
}
