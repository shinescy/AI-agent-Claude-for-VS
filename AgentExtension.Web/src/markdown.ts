// markdown 渲染：把代理输出的 markdown 文本转成 HTML 字符串。

import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

/** 把 markdown 文本渲染成 HTML 字符串。 */
export function renderMarkdown(text: string): string {
  return md.render(text);
}

/** 判断一段回复是否**根本不是 markdown**。 */
export function isPlainText(text: string): boolean {
  if (!text.trim())
  {
    return false;
  }

  if (/^[ \t]*(#{1,6} |[-*+] |\d+[.)] |> |```|~~~|\|)/m.test(text))
  {
    return false;
  }

  if (/\*\*|__|`|\[[^\]]*\]\([^)]*\)|!\[/.test(text))
  {
    return false;
  }

  return true;
}
