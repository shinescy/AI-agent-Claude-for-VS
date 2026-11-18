// 首屏埋点：页面从导航到发 ready 的各阶段耗时，见 docs/memory/terminal-fixes-2026-11.md。

/** 入口执行时记下的时刻与可见性。 */
interface BootMark
{
  at: number;
  visibility: string;
}

let boot: BootMark | null = null;

/** 中途打的点：名字 → 第一次到达的时刻。 */
const phases: Array<{ name: string; at: number }> = [];

/** 打一个点；同名只记第一次。 */
export function markPhase(name: string): void
{
  if (!phases.some((phase) => phase.name === name))
  {
    phases.push({ name, at: performance.now() });
  }
}

/** 已打的点，拼成「名=毫秒」。 */
export function describePhases(): string
{
  return phases.map((phase) => phase.name + '=' + Math.round(phase.at)).join(' ');
}

/** 这个环境支不支持长任务统计。 */
export function longTaskSupported(): boolean
{
  const types = (PerformanceObserver as unknown as { supportedEntryTypes?: readonly string[] }).supportedEntryTypes;

  return Array.isArray(types) && types.indexOf('longtask') >= 0;
}

/** 入口之后主线程长任务的累计与最长耗时。 */
const longTasks = { total: 0, max: 0, count: 0 };

/** 入口模块开始执行时调一次。 */
export function markBoot(): void
{
  boot = { at: performance.now(), visibility: document.visibilityState };

  try
  {
    // 累计接近总耗时说明是渲染本身重；远小于说明在排队等 CPU
    new PerformanceObserver((list) =>
    {
      for (const entry of list.getEntries())
      {
        longTasks.total += entry.duration;
        longTasks.max = Math.max(longTasks.max, entry.duration);
        longTasks.count += 1;
      }
    }).observe({ type: 'longtask', buffered: true });
  }
  catch
  {
    // 不支持 longtask 的环境就不统计
  }
}

/** 一段计时原料；拆出来好测。 */
export interface BootSample
{
  /** 页面 HTML 收完。 */
  responseEnd: number;

  /** 主脚本下载完；取不到为 -1。 */
  scriptEnd: number;

  domContentLoaded: number;

  /** 入口开始执行；没记到为 -1。 */
  bootAt: number;

  bootVisibility: string;

  readyAt: number;

  readyVisibility: string;

  /** 长任务累计毫秒。 */
  longTaskTotal: number;

  /** 最长那个长任务的毫秒。 */
  longTaskMax: number;

  /** 长任务个数。 */
  longTaskCount: number;
}

/** 拼成一行日志：各阶段毫秒数，相对导航起点。 */
export function formatBoot(sample: BootSample): string
{
  const ms = (value: number): string => (value < 0 ? '?' : String(Math.round(value)));

  return '首屏计时 html=' + ms(sample.responseEnd)
    + ' js=' + ms(sample.scriptEnd)
    + ' dcl=' + ms(sample.domContentLoaded)
    + ' 入口=' + ms(sample.bootAt) + '(' + sample.bootVisibility + ')'
    + ' ready=' + ms(sample.readyAt) + '(' + sample.readyVisibility + ')'
    + ' 长任务=' + ms(sample.longTaskTotal) + '/' + sample.longTaskCount + '个/最长' + ms(sample.longTaskMax);
}

/** 采当前页面的计时。 */
export function sampleBoot(): BootSample
{
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const script = performance.getEntriesByType('resource')
    .find((entry) => /\/assets\/index-[^/]*\.js$/.test(entry.name)) as PerformanceResourceTiming | undefined;

  return {
    responseEnd: nav?.responseEnd ?? -1,
    scriptEnd: script?.responseEnd ?? -1,
    domContentLoaded: nav?.domContentLoadedEventEnd ?? -1,
    bootAt: boot?.at ?? -1,
    bootVisibility: boot?.visibility ?? '?',
    readyAt: performance.now(),
    readyVisibility: document.visibilityState,
    longTaskTotal: longTasks.total,
    longTaskMax: longTasks.max,
    longTaskCount: longTasks.count,
  };
}
