// 渲染一段 markdown 文本，并异步用 shiki 高亮其中的代码块。

import { useEffect, useRef } from 'react';
import type React from 'react';
import { highlightCode } from '../markdownHighlighter';
import { isPlainText, renderMarkdown } from '../markdown';
import { findFileReferences } from '../fileRefs';
import { sendOpenFile } from '../bridge';

interface MarkdownProps {
  text: string;
}

/** 把正文里的 `Foo.cs:12` 变成可点链接。 */
function linkifyFileReferences(container: HTMLElement): void {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let parent = node.parentElement;
      while (parent && parent !== container) {
        const tag = parent.tagName;
        if (tag === 'CODE' || tag === 'PRE' || tag === 'A') {
          return NodeFilter.FILTER_REJECT;
        }
        parent = parent.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const targets: Text[] = [];
  let current = walker.nextNode();

  while (current !== null) {
    targets.push(current as Text);
    current = walker.nextNode();
  }

  for (const textNode of targets) {
    const text = textNode.textContent ?? '';
    const refs = findFileReferences(text);

    if (refs.length === 0) {
      continue;
    }

    const fragment = document.createDocumentFragment();
    let cursor = 0;

    for (const ref of refs) {
      if (ref.index > cursor) {
        fragment.appendChild(document.createTextNode(text.slice(cursor, ref.index)));
      }

      const anchor = document.createElement('a');
      anchor.className = 'file-ref';
      anchor.textContent = ref.raw;
      anchor.dataset.path = ref.path;
      anchor.dataset.line = String(ref.line);
      anchor.href = '#';
      fragment.appendChild(anchor);

      cursor = ref.index + ref.raw.length;
    }

    if (cursor < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(cursor)));
    }

    textNode.replaceWith(fragment);
  }
}

export function Markdown({ text }: MarkdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const plain = isPlainText(text);
  const html = plain ? '' : renderMarkdown(text);

  useEffect(() => {
    const container = containerRef.current;
    if (!container)
    {
      return;
    }

    linkifyFileReferences(container);

    let cancelled = false;
    const codeBlocks = Array.from(container.querySelectorAll('pre > code'));

    void (async () => {
      for (const codeEl of codeBlocks)
      {
        const langMatch = /language-(\S+)/.exec(codeEl.className);
        if (!langMatch)
        {
          continue;
        }
        const lang = langMatch[1];
        const source = codeEl.textContent ?? '';

        let highlighted: string;
        try
        {
          highlighted = await highlightCode(source, lang);
        }
        catch
        {
          continue;
        }

        if (cancelled)
        {
          return;
        }

        const pre = codeEl.parentElement;
        if (!pre || !pre.parentElement)
        {
          continue;
        }
        const wrapper = document.createElement('div');
        wrapper.innerHTML = highlighted;
        const highlightedPre = wrapper.firstElementChild;
        if (highlightedPre)
        {
          pre.replaceWith(highlightedPre);
        }
      }
    })();

    return () =>
    {
      cancelled = true;
    };
  }, [html]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const anchor = (e.target as HTMLElement).closest<HTMLElement>('.file-ref');

    if (!anchor) {
      return;
    }

    e.preventDefault();

    const path = anchor.dataset.path ?? '';
    const line = Number.parseInt(anchor.dataset.line ?? '0', 10);

    if (path) {
      sendOpenFile(path, Number.isFinite(line) ? line : 0);
    }
  }

  if (plain)
  {
    return <div className="plain-body">{text}</div>;
  }

  return (
    <div
      ref={containerRef}
      className="markdown-body"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
