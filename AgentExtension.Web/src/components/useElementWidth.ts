// 量一个元素的宽度，随它变化更新：让提示词标签与下面那排按钮同宽。

import { useEffect, useRef, useState } from 'react';

/** 返回挂到元素上的 ref 与它当前的宽度；量不到时为 0。 */
export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T>, number]
{
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() =>
  {
    const element = ref.current;

    if (element === null)
    {
      return undefined;
    }

    const measure = () => setWidth(element.offsetWidth);
    measure();

    if (typeof ResizeObserver === 'undefined')
    {
      return undefined;
    }

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
