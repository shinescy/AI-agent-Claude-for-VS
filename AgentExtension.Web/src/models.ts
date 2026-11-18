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

/** 决定下拉里列哪些型号：优先握手清单，当前所选不在其中时补在末尾。 */
export function buildModelOptions(
  available: readonly string[],
  reported: AgentModelInfo[],
  selected = ''): ModelOption[] {
  const options = reported.length > 0
    ? reportedOptions(reported)
    : available.length > 0 ? aliasOptions(available) : modelsOf(DEFAULT_BRAND);

  const values = options.map((o) => o.value);

  if (selected === '' || matchModelValue(values, selected, reported) !== '')
  {
    return options;
  }

  return [...options, { value: selected, label: friendlyModelName(selected), hint: '' }];
}

/** 握手清单：CLI 给界面的那份，一项一个模型、不重名。 */
function reportedOptions(reported: AgentModelInfo[]): ModelOption[] {
  return reported.map((m) => ({
    value: m.value,
    label: m.value === DEFAULT_MODEL ? '默认' : (m.displayName || friendlyModelName(m.value)),
    hint: m.description ?? '',
  }));
}

/** /model 的别名串：只在握手没给清单时兜底，别名多指向同一模型。 */
function aliasOptions(available: readonly string[]): ModelOption[] {
  return available.map((value) => ({
    value,
    label: value === DEFAULT_MODEL ? '默认' : friendlyModelName(value),
    hint: '',
  }));
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

/** 把模型取值拆成家族、版本与是否 1M 上下文。 */
function parseModelId(value: string): { family: string; version: string; wide: boolean } | null {
  const wide = /\[1m\]$/i.test(value);
  const bare = value.replace(/\[1m\]$/i, '').toLowerCase();
  const full = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{6,})?$/.exec(bare);

  if (full)
  {
    return { family: full[1], version: full[3] ? `${full[2]}.${full[3]}` : full[2], wide };
  }

  if (/^[a-z]+$/.test(bare))
  {
    return { family: bare, version: '', wide };
  }

  return null;
}

/** 把展示名（如 Fable 5.2、Opus 5.5 (1M context)）拆成同样的三项。 */
function parseModelName(name: string): { family: string; version: string; wide: boolean } | null {
  const lower = name.trim().toLowerCase();
  const match = /^(?:claude\s+)?([a-z]+)\s+(\d+(?:\.\d+)?)/.exec(lower);

  if (!match)
  {
    return null;
  }

  return { family: match[1], version: match[2], wide: /1m/.test(lower) };
}

/** 给人看的模型名，如 claude-opus-5-5 → Opus 5.5。 */
export function friendlyModelName(value: string): string {
  const parsed = parseModelId(value);

  if (parsed === null)
  {
    return value;
  }

  const family = parsed.family.charAt(0).toUpperCase() + parsed.family.slice(1);
  const name = parsed.version === '' ? family : `${family} ${parsed.version}`;
  return parsed.wide ? `${name} (1M)` : name;
}

/** 当前在跑的模型对应清单里的哪一项；对不上返回空串。 */
export function matchModelValue(
  values: readonly string[],
  current: string,
  reported: AgentModelInfo[]): string {
  if (current === '')
  {
    return '';
  }

  if (values.includes(current))
  {
    return current;
  }

  // 握手里写明了「这个取值解析成哪个模型」的，以它为准。
  const resolved = reported.find((m) => m.resolvedModel === current && values.includes(m.value));

  if (resolved)
  {
    return resolved.value;
  }

  const target = parseModelId(current) ?? parseModelName(current);

  if (target === null)
  {
    return '';
  }

  const sameFamily = values.filter((value) =>
  {
    const parsed = parseModelId(value);
    return parsed !== null && parsed.family === target.family && parsed.wide === target.wide;
  });

  // 先找版本也一致的全名，再退到别名（fable 指向最新的 Fable）。
  const exact = sameFamily.find((value) => parseModelId(value)?.version === target.version);
  const alias = sameFamily.find((value) => parseModelId(value)?.version === '');
  return exact ?? alias ?? '';
}
