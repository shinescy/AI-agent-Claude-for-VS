// 每秒推进一次的「当前时刻」。

import { useEffect, useState } from 'react';

/** 返回当前 Unix 秒，每秒更新。 */
export function useNowSeconds(enabled: boolean): number {
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (!enabled) {
      return;
    }

    setNowSeconds(Math.floor(Date.now() / 1000));

    const timer = window.setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  return nowSeconds;
}
