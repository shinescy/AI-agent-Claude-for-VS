// 首屏计时那一行日志：各阶段都要在，取不到的写问号而不是 0。

import { describe, it, expect } from 'vitest';
import { formatBoot } from './bootTiming';

describe('首屏计时', () =>
{
  it('各阶段按毫秒取整，并带上可见性', () =>
  {
    const line = formatBoot({
      responseEnd: 120.4,
      scriptEnd: 900.6,
      domContentLoaded: 950,
      bootAt: 948.2,
      bootVisibility: 'hidden',
      readyAt: 4100,
      readyVisibility: 'visible',
      longTaskTotal: 2500.4,
      longTaskMax: 1800,
      longTaskCount: 3,
    });

    expect(line).toBe(
      '首屏计时 html=120 js=901 dcl=950 入口=948(hidden) ready=4100(visible) 长任务=2500/3个/最长1800');
  });

  it('取不到的写问号，不冒充 0', () =>
  {
    const line = formatBoot({
      responseEnd: -1,
      scriptEnd: -1,
      domContentLoaded: 10,
      bootAt: -1,
      bootVisibility: '?',
      readyAt: 20,
      readyVisibility: 'hidden',
      longTaskTotal: 0,
      longTaskMax: 0,
      longTaskCount: 0,
    });

    expect(line).toContain('html=?');
    expect(line).toContain('js=?');
    expect(line).toContain('入口=?(?)');
  });
});
