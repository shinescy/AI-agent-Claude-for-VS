// Ultracode 开关的纯逻辑：显示条件、状态折叠、强度档位的取舍。

import type { AgentModelInfo, AppliedSettingsInfo } from './types';

/** 开关状态。null 表示 CLI 没报过：available 走兜底，on 以界面的乐观值为准。 */
export interface UltracodeState {
  available: boolean | null;
  on: boolean | null;
}

/** 会话没起、或 CLI 还没报过时的状态。 */
export const ULTRACODE_UNKNOWN: UltracodeState = { available: null, on: null };

/** effort 档位清单里代表 Ultracode 的那一档。 */
export const ULTRACODE_EFFORT = 'ultracode';

/** 把 CLI 的一次回报折成开关状态；每次都给新对象。 */
export function ultracodeFromApplied(applied: AppliedSettingsInfo): UltracodeState {
  const available = applied.ultracodeAvailable ?? null;

  if (available === false)
  {
    return { available, on: false };
  }

  // 没报「是否已请求」时只在确实生效时认它开着，否则算没说
  const on = applied.ultracodeRequested ?? (applied.ultracode ? true : null);
  return { available, on };
}

/** 开关画成开还是关：刚点的乐观值优先，其次 CLI 报的，都没有算关。 */
export function ultracodeShownOn(state: UltracodeState, optimistic: boolean | null): boolean {
  return optimistic ?? state.on ?? false;
}

/** 当前型号支不支持思考强度；查不到型号信息时不拦。 */
export function modelSupportsEffort(model: string, reported: readonly AgentModelInfo[]): boolean {
  const found = reported.find((item) => item.value === model || item.resolvedModel === model);
  return found === undefined ? true : found.supportsEffort;
}

/**
 * 开关该不该显示。
 * CLI 报了可用性就以它为准；没报时保守兜底：档位清单里有 ultracode 才显示。
 */
export function isUltracodeVisible(
  state: UltracodeState, effortLevels: readonly string[], supportsEffort: boolean): boolean {
  if (!supportsEffort)
  {
    return false;
  }

  if (state.available !== null)
  {
    return state.available;
  }

  return effortLevels.includes(ULTRACODE_EFFORT);
}

/**
 * 强度滑轨该列哪些档。开关可见时去掉 ultracode 这一档（两个入口说的是一件事）；
 * 当前正停在这一档时留着，否则滑块没处落。
 */
export function sliderEffortLevels(
  levels: readonly string[], switchVisible: boolean, current: string): string[] {
  if (!switchVisible || current === ULTRACODE_EFFORT)
  {
    return [...levels];
  }

  return levels.filter((level) => level !== ULTRACODE_EFFORT);
}
