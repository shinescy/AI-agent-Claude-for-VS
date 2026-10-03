// 把面板条目 Id（可能是复合值，含空格/反斜杠等）转成安全的 DOM id 片段。

/** 把任意字符串转成可以安全用作 DOM id 的片段。 */
export function domId(value: string): string {
  return encodeURIComponent(value);
}
