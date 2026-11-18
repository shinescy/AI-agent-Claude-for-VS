// @ 文件引用的检索回路：从草稿里认出 `@查询`，向宿主要一次结果，丢弃过期回包。

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { detectMentionQuery } from './mention';
import { sendFileQuery } from './bridge';

/** 宿主的文件检索回包。 */
export interface FileQueryResults
{
  requestId: string;
  results: string[];
}

/** 检索回路交出来的东西：候选、当前高亮项，以及一副接管好的键盘。 */
export interface MentionSearch
{
  /** 命中的文件路径（宿主给的是相对工作目录、正斜杠的形式）。 */
  matches: string[];

  /** 当前高亮到第几条。 */
  selectedIndex: number;

  /** 收起弹层，并作废正在等的那次请求。 */
  clear(): void;

  /** 弹层开着时接管方向键 / Enter / Tab / Esc，返回是否已经吃掉这一下。 */
  handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>, insert: (path: string) => void): boolean;
}

// 请求序号是**模块级**的，不是每个输入框各算各的。
let mentionSeq = 0;

/** 移动光标不改文本，不会触发重渲染，现读会一直用着上一次的旧值 */
export function useMentionSearch(
  text: string,
  caret: number,
  fileResults: FileQueryResults | null): MentionSearch
{
  const [matches, setMatches] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  /** 正在等的那次请求。 */
  const pendingId = useRef('');

  const query = detectMentionQuery(text, caret);

  useEffect(() =>
  {
    if (query === null)
    {
      setMatches([]);
      pendingId.current = '';
      return;
    }

    const id = String(++mentionSeq);
    pendingId.current = id;
    setSelectedIndex(0);
    sendFileQuery(query, id);
  }, [query]);

  useEffect(() =>
  {
    if (fileResults === null || fileResults.requestId !== pendingId.current)
    {
      return;
    }

    setMatches(fileResults.results);
  }, [fileResults]);

  function clear(): void
  {
    setMatches([]);

    pendingId.current = '';
  }

  function handleKeyDown(
    e: KeyboardEvent<HTMLTextAreaElement>,
    insert: (path: string) => void): boolean
  {
    if (matches.length === 0)
    {
      return false;
    }

    if (e.key === 'ArrowDown')
    {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % matches.length);
      return true;
    }

    if (e.key === 'ArrowUp')
    {
      e.preventDefault();
      setSelectedIndex((i) => (i - 1 + matches.length) % matches.length);
      return true;
    }

    if (e.key === 'Enter' || e.key === 'Tab')
    {
      e.preventDefault();
      insert(matches[Math.min(selectedIndex, matches.length - 1)]);
      return true;
    }

    if (e.key === 'Escape')
    {
      e.preventDefault();
      clear();
      return true;
    }

    return false;
  }

  return { matches, selectedIndex, clear, handleKeyDown };
}
