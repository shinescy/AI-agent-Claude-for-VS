import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { EffortSlider } from './EffortSlider';
import { buildEffortOptions } from '../efforts';

// 真机上是 7 档，档距只剩 20px，按这个数测才作数
const OPTIONS = buildEffortOptions(['low', 'medium', 'high', 'xhigh', 'max', 'ultracode', 'auto']);

/** 轨道在 jsdom 里没有尺寸，换算档位要靠它。 */
function fakeTrack(width: number)
{
  const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
  spy.mockReturnValue({ left: 0, width, top: 0, height: 18, right: width, bottom: 18, x: 0, y: 0, toJSON() {} } as DOMRect);
  return spy;
}

afterEach(() =>
{
  vi.restoreAllMocks();
});

describe('强度滑块的悬浮说明', () =>
{
  it('每一档都有自己的说明，不是都报当前档', () =>
  {
    const view = render(<EffortSlider options={OPTIONS} value="low" onSelect={() => {}} />);

    const titles = OPTIONS.map((o) =>
      view.container.querySelector(`[data-effort="${o.value}"]`)?.getAttribute('title'));

    expect(titles).toEqual(OPTIONS.map((o) => `${o.label}：${o.description}`));
    expect(new Set(titles).size).toBe(OPTIONS.length);
  });

  it('热区盖住轨道也不挡拖动', () =>
  {
    fakeTrack(120);
    const picked: string[] = [];
    const view = render(<EffortSlider options={OPTIONS} value="low" onSelect={(v) => picked.push(v)} />);

    const hit = view.container.querySelector('[data-effort="max"]') as HTMLElement;
    fireEvent.pointerDown(hit, { button: 0, clientX: 80 });

    expect(picked).toEqual(['max']);
  });
});

describe('交回模型默认（auto）时的显示', () =>
{
  it('不点亮任何一档、不画滑块头，文字写「默认」', () =>
  {
    // 现在滑轨不再有 auto 这一档，它只作为「当前值」出现
    const levels = buildEffortOptions(['low', 'medium', 'high', 'xhigh', 'max']);
    const view = render(<EffortSlider options={levels} value="auto" onSelect={() => {}} />);

    expect(view.container.querySelector('.effort-thumb')).toBeNull();
    expect(view.container.querySelectorAll('.effort-notch-on')).toHaveLength(0);
    expect(view.container.querySelector('.effort-label')!.textContent).toBe('默认');
  });

  it('没选中任何档时按右方向键先落到第一档，不跳过它', () =>
  {
    const picked: string[] = [];
    const levels = buildEffortOptions(['low', 'medium', 'high']);
    const view = render(<EffortSlider options={levels} value="auto" onSelect={(v) => picked.push(v)} />);

    fireEvent.keyDown(view.getByRole('slider'), { key: 'ArrowRight' });
    expect(picked).toEqual(['low']);
  });
});