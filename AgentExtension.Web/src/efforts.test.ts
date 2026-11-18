import { describe, it, expect } from 'vitest';
import { effortLevelsForModel } from './efforts';
import type { AgentModelInfo } from './types';

const model = (value: string, levels: string[] | null, resolvedModel = ''): AgentModelInfo => ({
  value, displayName: value, resolvedModel, description: '',
  supportsEffort: levels !== null, supportedEffortLevels: levels ?? [],
});

const MODELS = [
  model('default', ['low', 'medium', 'high', 'xhigh', 'max'], 'claude-opus-5-5'),
  model('opus', ['low', 'medium', 'high', 'xhigh', 'max'], 'claude-opus-5-5'),
  model('claude-opus-4-6', ['low', 'medium', 'high', 'max']),
  model('claude-haiku-4-5-20251001', null),
];

const PROBED = ['low', 'medium', 'high', 'xhigh', 'max', 'auto', 'ultracode'];

describe('滑轨档位跟着当前模型走（与 VS Code 一致）', () => {
  it('用当前模型报的档位，去掉 auto；CLI 支持 ultracode 时补在末尾', () => {
    expect(effortLevelsForModel(MODELS, 'opus', PROBED)).toEqual(['low', 'medium', 'high', 'xhigh', 'max', 'ultracode']);
  });

  it('不支持 xhigh 的模型就没有这一档', () => {
    expect(effortLevelsForModel(MODELS, 'claude-opus-4-6', PROBED)).toEqual(['low', 'medium', 'high', 'max', 'ultracode']);
  });

  it('当前模型按解析后的全名也认得出', () => {
    expect(effortLevelsForModel(MODELS, 'claude-opus-5-5', PROBED)).not.toContain('auto');
  });

  it('不支持调强度的模型返回 null（滑轨不画）', () => {
    expect(effortLevelsForModel(MODELS, 'claude-haiku-4-5-20251001', PROBED)).toBeNull();
  });

  it('认不出当前模型时退回探测清单，同样去掉 auto', () => {
    expect(effortLevelsForModel([], 'something', PROBED)).toEqual(['low', 'medium', 'high', 'xhigh', 'max', 'ultracode']);
  });

  it('CLI 不支持 ultracode 就不补', () => {
    expect(effortLevelsForModel(MODELS, 'opus', ['low', 'high'])).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  });
});
