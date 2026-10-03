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
