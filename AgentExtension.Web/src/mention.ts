// 识别输入框里的 @ 文件引用触发。

/** 判断光标处是否正在输入 @ 引用，返回已输入的查询串。 */
export function detectMentionQuery(text: string, caret: number): string | null {
  if (caret <= 0) {
    return null;
  }

  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');

  if (at < 0) {
    return null;
  }

  // @ 之前必须是行首或空白
  if (at > 0) {
    const prev = before[at - 1];
    if (!/\s/.test(prev)) {
      return null;
    }
  }

  const query = before.slice(at + 1);

  if (/\s/.test(query)) {
    return null;
  }

  return query;
}

/** 把选中的路径替换回草稿：替换掉从 @ 到光标的那一段，并补一个空格。 */
export function applyMention(text: string, caret: number, path: string): { text: string; caret: number } {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');

  if (at < 0) {
    return { text, caret };
  }

  const inserted = `@${path} `;
  const next = text.slice(0, at) + inserted + text.slice(caret);

  return { text: next, caret: at + inserted.length };
}

/** 一条已经打进文本里的 @ 引用。 */
export interface Mention {
  /** 原始匹配文本，含 @。 */
  raw: string;
  /** 去掉 @ 与尾随标点后的路径。 */
  path: string;
  index: number;
}

/** 扫出文本里全部已成形的 @ 引用。 */
export function findMentions(text: string): Mention[] {
  if (!text) {
    return [];
  }

  const results: Mention[] = [];
  const pattern = /(^|\s)@(\S+)/g;

  let match = pattern.exec(text);

  while (match !== null) {
    // 句末标点不属于路径，得摘掉，否则拿去读盘必然落空。
    const path = match[2]
      .split(/[，。、；：！？（）【】《》「」『』…]/)[0]
      .replace(/[,;)\]}.]+$/, '');

    if (path.length > 0) {
      const index = match.index + match[1].length;
      results.push({ raw: `@${path}`, path, index });
    }

    match = pattern.exec(text);
  }

  return results;
}

/** 在光标处插入若干条 @ 引用（挑文件 / 拖拽进来的结果）。 */
export function insertPaths(text: string, caret: number, paths: string[]): { text: string; caret: number } {
  const usable = paths.filter((p) => p.trim().length > 0);

  if (usable.length === 0) {
    return { text, caret };
  }

  const position = Math.max(0, Math.min(caret, text.length));
  const before = text.slice(0, position);
  const needsSpace = before.length > 0 && !/\s$/.test(before);
  const inserted = (needsSpace ? ' ' : '') + usable.map((p) => `@${p}`).join(' ') + ' ';

  return { text: before + inserted + text.slice(position), caret: position + inserted.length };
}
