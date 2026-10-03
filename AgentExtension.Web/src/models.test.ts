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
  const reported = [
    {
      value: 'default', displayName: 'Default (recommended)',
      resolvedModel: 'claude-opus-5[1m]', description: '最强',
      supportsEffort: true, supportedEffortLevels: ['low'],
    },
  ];

  it('以 /model 的 Available 为准列出全部取值', () => {
    // 它比握手的 models 更全（多出 best / opusplan / sonnet[1m] 等）
    const options = buildModelOptions(['default', 'best', 'opusplan'], reported);
    expect(options.map((o) => o.value)).toEqual(['default', 'best', 'opusplan']);
  });

  it('能从握手里找到的补上具体模型名', () => {
    const options = buildModelOptions(['default', 'best'], reported);

    expect(options[0].label).toBe('claude-opus-5[1m]');
    expect(options[1].label).toBe('best');
  });

  it('探不到 Available 时退回握手清单', () => {
    const options = buildModelOptions([], reported);
    expect(options.map((o) => o.value)).toEqual(['default']);
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
