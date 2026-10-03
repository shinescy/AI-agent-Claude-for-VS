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
