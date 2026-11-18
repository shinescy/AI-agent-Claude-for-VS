// textarea 随内容长高：从一行起，到 CSS 的 max-height 为止，再多就滚动。

import { useEffect, useLayoutEffect } from 'react';
import type { RefObject } from 'react';

/** 按 scrollHeight 重设高度。 */
function fitHeight(element: HTMLTextAreaElement): void
{
  // 先收到 auto 才量得出变短后的高度；边框不在 scrollHeight 里，要补上
  element.style.height = 'auto';
  const border = element.offsetHeight - element.clientHeight;
  element.style.height = `${element.scrollHeight + border}px`;
}

/** 内容或宽度一变就重设高度。 */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement>, value: string): void
{
  useLayoutEffect(() =>
  {
    if (ref.current !== null)
    {
      fitHeight(ref.current);
    }
  }, [ref, value]);

  // 宽度变了折行数就变：面板拖宽窄、左侧标签量完宽度后都会触发
  useEffect(() =>
  {
    const element = ref.current;

    if (element === null || typeof ResizeObserver === 'undefined')
    {
      return;
    }

    let lastWidth = element.offsetWidth;
    const observer = new ResizeObserver(() =>
    {
      if (element.offsetWidth !== lastWidth)
      {
        lastWidth = element.offsetWidth;
        fitHeight(element);
      }
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, [ref]);
}
