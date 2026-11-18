import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BRAND,
  DEFAULT_MODEL,
  MODEL_BRANDS,
  buildModelOptions,
  describeModel,
  effectiveModels,
  findBrand,
  modelsOf,
  reportedEffortLevels,
  resolveModelForBrand,
} from './models';
import { FALLBACK_EFFORT_LEVELS, buildEffortOptions } from './efforts';

describe('品牌与型号两级结构', () => {
  it('默认品牌存在且可用', () => {
    const brand = findBrand(DEFAULT_BRAND);
    expect(brand.id).toBe(DEFAULT_BRAND);
    expect(brand.available).toBe(true);
  });

  it('未知品牌回退到第一个而不是返回空', () => {
    // 状态里存了个已被移除的品牌 id 时，下拉不该整个空掉
    expect(findBrand('不存在的品牌').id).toBe(MODEL_BRANDS[0].id);
  });

  it('每个品牌都至少有一个型号', () => {
    for (const brand of MODEL_BRANDS)
    {
      expect(brand.models.length).toBeGreaterThan(0);
    }
  });

  it('型号取值在品牌内不重复', () => {
    for (const brand of MODEL_BRANDS)
    {
      const values = brand.models.map((m) => m.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('默认品牌含有默认型号哨兵值', () => {
    expect(modelsOf(DEFAULT_BRAND).some((m) => m.value === DEFAULT_MODEL)).toBe(true);
  });
});

describe('切换品牌时的型号归属', () => {
  it('原型号在新品牌里也有就保留', () => {
    expect(resolveModelForBrand(DEFAULT_BRAND, 'sonnet')).toBe('sonnet');
  });

  it('原型号不属于新品牌就退到第一项', () => {
    // 否则下拉会停在一个不属于当前品牌的值上，看起来像没切换成功
    expect(resolveModelForBrand(DEFAULT_BRAND, '别家的型号')).toBe(modelsOf(DEFAULT_BRAND)[0].value);
  });

  it('未知品牌也能给出一个合法型号', () => {
    const resolved = resolveModelForBrand('不存在的品牌', 'sonnet');
    expect(modelsOf(DEFAULT_BRAND).some((m) => m.value === resolved)).toBe(true);
  });
});

describe('优先使用 CLI 汇报的模型清单', () => {
  const reported = [
    {
      value: 'default', displayName: 'Default (recommended)',
      resolvedModel: 'claude-opus-5[1m]', description: '最强',
      supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
    },
    {
      value: 'haiku', displayName: 'Haiku', resolvedModel: 'claude-haiku-4-5',
      description: '最快', supportsEffort: false, supportedEffortLevels: [],
    },
  ];

  it('有汇报就用汇报的', () => {
    // 写死的清单会在模型换代后过期；CLI 给的那份跟着 CLI 走
    const options = effectiveModels(DEFAULT_BRAND, reported);
    expect(options.map((o) => o.value)).toEqual(['default', 'haiku']);
  });

  it('显示具体模型名而不是 Default 这类占位说法', () => {
    // 用户要知道现在跑的到底是哪个模型；displayName 退到悬停提示里
    const options = effectiveModels(DEFAULT_BRAND, reported);

    expect(options[0].label).toBe('claude-opus-5[1m]');
    expect(options[0].hint).toContain('Default (recommended)');
  });

  it('没有汇报就退回内置清单', () => {
    const options = effectiveModels(DEFAULT_BRAND, []);
    expect(options).toEqual(modelsOf(DEFAULT_BRAND));
  });

  it('别家品牌不受 Claude 汇报影响', () => {
    // 汇报来自 claude CLI，套到别的品牌上是错的
    const options = effectiveModels('其它品牌', reported);
    expect(options).toEqual(modelsOf('其它品牌'));
  });

  it('取所选模型支持的思考档位', () => {
    expect(reportedEffortLevels('default', reported)).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  });

  it('不支持思考档位的模型返回 null', () => {
    expect(reportedEffortLevels('haiku', reported)).toBeNull();
  });

  it('模型不在汇报里时返回 null', () => {
    expect(reportedEffortLevels('不存在', reported)).toBeNull();
  });
});

describe('思考档位选项', () => {
  it('用 CLI 探测到的档位，全部七档都在', () => {
    // 清单来自 /effort 的用法串，不写死——握手里的 supportedEffortLevels
    // 只有五档，比实际接受的少 ultracode 与 auto
    const levels = ['low', 'medium', 'high', 'xhigh', 'max', 'ultracode', 'auto'];
    expect(buildEffortOptions(levels).map((o) => o.value)).toEqual(levels);
  });

  it('每一档都带 CLI 自己的说明', () => {
    // 说明逐字取自 CLI，不是我们编的措辞
    const options = buildEffortOptions(['max']);
    expect(options[0].description).toContain('最难的任务');
  });

  it('探不到时用兜底清单而不是空下拉', () => {
    expect(buildEffortOptions([]).map((o) => o.value)).toEqual(FALLBACK_EFFORT_LEVELS);
  });

  it('未知档位照常列出且不假装有说明', () => {
    // CLI 新增档位不该静默消失，显示原值总好过看不见
    const options = buildEffortOptions(['low', '某个新档位']);

    expect(options.map((o) => o.value)).toContain('某个新档位');
    expect(options.find((o) => o.value === '某个新档位')?.description).toBe('');
  });
});

describe('模型选项', () => {
  // 2026-11-18 实测握手：14 项，名字互不重复；/model 的别名串有 10 个，好几个指向同一模型
  const handshake = [
    { value: 'default', displayName: 'Default (recommended)', resolvedModel: 'claude-opus-5-5', description: 'Opus 5.5 · Best for everyday, complex tasks' },
    { value: 'opus', displayName: 'Opus 5.5', resolvedModel: 'claude-opus-5-5', description: 'For complex work and everyday tasks' },
    { value: 'fable', displayName: 'Fable 5.2', resolvedModel: 'claude-fable-5-2', description: 'For your toughest challenges' },
    { value: 'sonnet', displayName: 'Sonnet 5.5', resolvedModel: 'claude-sonnet-5-5', description: 'Most efficient for simpler tasks' },
    { value: 'haiku', displayName: 'Haiku 5.5', resolvedModel: 'claude-haiku-5-5', description: 'Fastest for quick answers' },
    { value: 'claude-opus-4-8', displayName: 'Opus 4.8', resolvedModel: 'claude-opus-4-8', description: 'Best for everyday, complex tasks' },
  ].map((m) => ({ ...m, supportsEffort: true, supportedEffortLevels: ['low'] }));
  const aliases = ['sonnet', 'opus', 'haiku', 'fable', 'best', 'sonnet[1m]', 'opus[1m]', 'fable[1m]', 'opusplan', 'default'];

  it('有握手清单就只列它，不再把 /model 的别名串摊开（用户报：一堆重复）', () => {
    const options = buildModelOptions(aliases, handshake);

    expect(options.map((o) => o.value)).toEqual(['default', 'opus', 'fable', 'sonnet', 'haiku', 'claude-opus-4-8']);
    expect(options.map((o) => o.label)).toEqual(['默认', 'Opus 5.5', 'Fable 5.2', 'Sonnet 5.5', 'Haiku 5.5', 'Opus 4.8']);
    expect(new Set(options.map((o) => o.label)).size).toBe(options.length);
    expect(options[0].hint).toContain('Opus 5.5');
  });

  it('当前选的不在清单里（以前选过 opus[1m]）补在末尾，不让它凭空消失', () => {
    const options = buildModelOptions(aliases, handshake, 'opus[1m]');

    expect(options[options.length - 1]).toEqual({ value: 'opus[1m]', label: 'Opus (1M)', hint: '' });
  });

  it('当前选的是全名而清单里有对应别名：不重复补一项', () => {
    const options = buildModelOptions(aliases, handshake, 'claude-opus-5-5');

    expect(options.map((o) => o.value)).not.toContain('claude-opus-5-5');
  });

  it('握手没给清单时才退回 /model 的别名串', () => {
    const options = buildModelOptions(['default', 'best', 'opusplan'], []);

    expect(options.map((o) => o.label)).toEqual(['默认', 'Best', 'Opusplan']);
  });

  it('两边都没有时用内置清单', () => {
    expect(buildModelOptions([], [])).toEqual(modelsOf(DEFAULT_BRAND));
  });
});

describe('模型显示名', () => {
  it('优先显示 init 回报的实际模型', () => {
    // 选「默认」时下拉根本不知道实际跑的是哪个，只有 init 说了算
    expect(describeModel('claude-opus-5[1m]', DEFAULT_MODEL)).toBe('claude-opus-5[1m]');
  });

  it('没有实际模型时显示所选型号的标签', () => {
    expect(describeModel('', 'sonnet')).toBe('Sonnet');
  });

  it('两者都取不到时原样返回', () => {
    expect(describeModel('', '某个未知值')).toBe('某个未知值');
  });
});
