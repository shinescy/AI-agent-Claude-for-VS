import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DoctorPanel } from './DoctorPanel';

describe('健康检查面板', () => {
  it('原始文本原样渲染', () => {
    const rawText = 'Claude Code Doctor\n  ✔ 一切正常';
    const { container } = render(<DoctorPanel rawText={rawText} />);

    const pre = container.querySelector('pre.panel-plain-text');
    expect(pre).toBeTruthy();
    expect(pre?.textContent).toBe(rawText);
  });

  it('行首缩进被保留', () => {
    // doctor 靠缩进表达层级，这是本面板存在的全部意义：
    // 走 markdown 渲染会把行首缩进吃掉，层级就压平了。
    const rawText = '顶层\n  二级缩进\n    三级缩进';
    const { container } = render(<DoctorPanel rawText={rawText} />);

    const pre = container.querySelector('pre.panel-plain-text');
    expect(pre?.textContent).toContain('\n  二级缩进');
    expect(pre?.textContent).toContain('\n    三级缩进');
  });

  it('空文本时不崩', () => {
    const { container } = render(<DoctorPanel rawText="" />);

    const pre = container.querySelector('pre.panel-plain-text');
    expect(pre).toBeTruthy();
    expect(pre?.textContent).toBe('');
  });
});
