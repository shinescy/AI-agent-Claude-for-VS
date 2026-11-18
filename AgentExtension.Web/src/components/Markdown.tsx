// 渲染一段 markdown 文本，并异步用 shiki 高亮其中的代码块。

import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { ImageFileLightbox } from './ImageLightbox';
import { highlightCode } from '../markdownHighlighter';
import { isPlainText, renderMarkdown } from '../markdown';
import { findFileReferences, isImagePath, parseFileHref } from '../fileRefs';
import { sendOpenFile, sendOpenWebLink } from '../bridge';
import { useT } from '../LangContext';

interface MarkdownProps {
  text: string;
}

/** 给每个代码块套一层外壳，右上角放复制按钮；高亮换 pre 时外壳不动。 */
function addCopyButtons(container: HTMLElement, label: string): void {
  for (const pre of Array.from(container.querySelectorAll('pre'))) {
    const parent = pre.parentElement;

    if (!parent || parent.classList.contains('code-block')) {
      continue;
    }

    const shell = document.createElement('div');
    shell.className = 'code-block';
    parent.insertBefore(shell, pre);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'code-copy';
    button.textContent = label;
    button.setAttribute('aria-label', label);

    shell.appendChild(button);
    shell.appendChild(pre);
  }
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
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const closeImage = useCallback(() => setImagePath(null), []);

  const plain = isPlainText(text);
  const html = plain ? '' : renderMarkdown(text);

  useEffect(() => {
    const container = containerRef.current;
    if (!container)
    {
      return;
    }

    linkifyFileReferences(container);
    addCopyButtons(container, t('复制'));

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
    const copy = (e.target as HTMLElement).closest<HTMLButtonElement>('.code-copy');

    if (copy) {
      copyCode(copy);
      return;
    }

    const anchor = (e.target as HTMLElement).closest<HTMLElement>('a');

    if (!anchor) {
      return;
    }

    // 任何链接都不许让面板本身跳走，那样整个聊天页就没了
    e.preventDefault();

    if (anchor.classList.contains('file-ref')) {
      const path = anchor.dataset.path ?? '';
      const line = Number.parseInt(anchor.dataset.line ?? '0', 10);

      if (path) {
        openTarget(path, Number.isFinite(line) ? line : 0);
      }
      return;
    }

    const href = anchor.getAttribute('href') ?? '';

    if (/^https?:\/\//i.test(href)) {
      sendOpenWebLink(href);
      return;
    }

    const target = parseFileHref(href);
    if (target) {
      openTarget(target.path, target.line);
    }
  }

  /** 把按钮所在代码块的源码写进剪贴板，按钮上短暂显示结果。 */
  function copyCode(button: HTMLButtonElement) {
    const source = button.parentElement?.querySelector('pre')?.textContent ?? '';
    const done = (label: string) => {
      button.textContent = label;
      window.setTimeout(() => { button.textContent = t('复制'); }, 1500);
    };

    navigator.clipboard.writeText(source).then(
      () => done(t('已复制')),
      () => done(t('复制失败')),
    );
  }

  /** 图片在面板里预览，其他文件交给 VS 编辑器。 */
  function openTarget(path: string, line: number) {
    if (isImagePath(path)) {
      setImagePath(path);
      return;
    }

    sendOpenFile(path, line);
  }

  if (plain)
  {
    return <div className="plain-body">{text}</div>;
  }

  return (
    <>
      <div
        ref={containerRef}
        className="markdown-body"
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {imagePath !== null && <ImageFileLightbox path={imagePath} onClose={closeImage} />}
    </>
  );
}
