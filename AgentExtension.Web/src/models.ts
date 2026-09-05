// 模型选项，按「品牌 → 型号」两级组织。

import type { AgentModelInfo } from './types';

export interface ModelOption {
  value: string;
  label: string;
  hint: string;
}

export interface ModelBrand {
  /** 品牌标识。 */
  id: string;
  label: string;
  /** 是否已经有可用的适配器。 */
  available: boolean;
  models: ModelOption[];
}

/** 不传 --model 的哨兵值。 */
export const DEFAULT_MODEL = 'default';

export const DEFAULT_BRAND = 'anthropic';

export const MODEL_BRANDS: ModelBrand[] = [
  {
    id: 'anthropic',
    label: 'Claude',
    available: true,
    models: [
      {
        value: DEFAULT_MODEL,
        label: '默认',
        hint: '不传 --model，由 CLI 决定（通常跟随你的账号设置）。',
      },
      {
        value: 'opus',
        label: 'Opus',
        hint: '能力最强，速度与成本也最高。别名始终指向最新的 Opus。',
      },
      {
        value: 'sonnet',
        label: 'Sonnet',
        hint: '能力与速度较均衡。',
      },
      {
        value: 'haiku',
        label: 'Haiku',
        hint: '最快、最省，适合简单任务。',
      },
      {
        value: 'fable',
        label: 'Fable',
        hint: '别名指向最新的 Fable 模型。',
      },
    ],
  },
];

/** 按 id 取品牌；找不到时回退到默认品牌，避免状态里存了个不存在的 id 就整个空掉。 */
export function findBrand(brandId: string): ModelBrand {
  const found = MODEL_BRANDS.find((b) => b.id === brandId);
  if (found)
  {
    return found;
  }

  return MODEL_BRANDS[0];
}

/** 取某品牌下的型号列表。 */
export function modelsOf(brandId: string): ModelOption[] {
  return findBrand(brandId).models;
}

/** 切换品牌后该选哪个型号。 */
export function resolveModelForBrand(brandId: string, currentModel: string): string {
  const models = modelsOf(brandId);
  const kept = models.find((m) => m.value === currentModel);
  return kept ? kept.value : models[0].value;
}

/** 决定下拉里到底列哪些型号。 */
/** 把 CLI 探测到的模型清单变成选项。 */
export function buildModelOptions(
  available: readonly string[],
  reported: AgentModelInfo[]): ModelOption[] {
  if (available.length === 0)
  {
    return effectiveModels(DEFAULT_BRAND, reported);
  }

  return available.map((value) => {
    const info = reported.find((m) => m.value === value);
    return {
      value,
      label: info?.resolvedModel || info?.displayName || value,
      hint: info?.description ?? '',
    };
  });
}

export function effectiveModels(brandId: string, reported: AgentModelInfo[]): ModelOption[] {
  if (brandId === DEFAULT_BRAND && reported.length > 0)
  {
    return reported.map((m) => ({
      value: m.value,
      label: m.resolvedModel || m.displayName || m.value,
      hint: m.displayName
        ? `${m.displayName}${m.description ? ' — ' + m.description : ''}`
        : m.description,
    }));
  }

  return modelsOf(brandId);
}

/** 当前所选模型支持的 effort 档位。 */
export function reportedEffortLevels(
  selectedModel: string,
  reported: AgentModelInfo[]): string[] | null {
  const found = reported.find((m) => m.value === selectedModel);

  if (!found || !found.supportsEffort || found.supportedEffortLevels.length === 0)
  {
    return null;
  }

  return found.supportedEffortLevels;
}

/** 状态栏上显示的模型名。 */
export function describeModel(actual: string, selected: string): string {
  if (actual)
  {
    return actual;
  }

  for (const brand of MODEL_BRANDS)
  {
    const option = brand.models.find((m) => m.value === selected);
    if (option)
    {
      return option.label;
    }
  }

  return selected;
}
