import { describe, it, expect } from 'vitest';
import { detectCommandPicker, detectCurrentValue } from './commandPicker';

// 下面的样本逐字取自 2026-08-17 的真实 CLI 回复（2.1.233）。
const EFFORT_USAGE = 'Usage: /effort <low|medium|high|xhigh|max|ultracode|auto>';

const MODEL_USAGE =
  'Current model: Opus 5 (1M context) (effort: high)\n'
  + 'Usage: /model <name>. Available: sonnet, opus, haiku, fable, best, '
  + 'sonnet[1m], opus[1m], fable[1m], opusplan, default, or a full model ID.';

describe('用法串识别成选项框', () => {
  it('识别竖线枚举形式', () => {
    const picker = detectCommandPicker(EFFORT_USAGE);

    expect(picker?.command).toBe('effort');
    expect(picker?.options).toEqual(['low', 'medium', 'high', 'xhigh', 'max', 'ultracode', 'auto']);
  });

  it('识别 Available 清单形式', () => {
    const picker = detectCommandPicker(MODEL_USAGE);

    expect(picker?.command).toBe('model');
    expect(picker?.options).toContain('opusplan');
    expect(picker?.options).toContain('sonnet[1m]');
  });

  it('丢掉说明性尾巴', () => {
    // 「or a full model ID.」不是可选值，做成按钮点了没用
    const picker = detectCommandPicker(MODEL_USAGE);

    expect(picker?.options.every((o) => !o.includes(' '))).toBe(true);
    expect(picker?.options.every((o) => !o.endsWith('.'))).toBe(true);
  });

  it('普通回复不误判成选项框', () => {
    expect(detectCommandPicker('好的，我来看看这段代码。')).toBeNull();
    expect(detectCommandPicker('')).toBeNull();
  });

  it('只有一个候选时不做成选项框', () => {
    // 一个按钮的选项框没有意义，反而像是出了错
    expect(detectCommandPicker('Usage: /foo <only>')).toBeNull();
  });

  it('按形状识别，不认命令名', () => {
    // 将来 CLI 新增同样形状的命令，不必逐个适配
    const picker = detectCommandPicker('Usage: /某个新命令 <甲|乙|丙>');

    expect(picker?.command).toBe('某个新命令');
    expect(picker?.options).toEqual(['甲', '乙', '丙']);
  });
});

describe('识别当前值', () => {
  it('从 Current model 行取出当前值', () => {
    // 模型名自带括号，不能在第一个左括号处截断
    expect(detectCurrentValue(MODEL_USAGE)).toBe('Opus 5 (1M context)');
  });

  it('没有当前值时返回空串', () => {
    expect(detectCurrentValue(EFFORT_USAGE)).toBe('');
  });
});
