// 输入框顶边拖拽调高。
//
// 这段逻辑原本只长在对话那个输入框里，且没有任何测试。抽成两边共用的一份时补上——
// 里头有几处一错就很难看出来的细节：往上拖要变高、必须连 maxHeight 一起写、
// 拖到边界要夹住。错了的表现都是「拖不动」或者「拖着拖着就断了」，不报错。

import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { ComposerGrip, useComposerHeight } from './ComposerGrip';
import { COMPOSER_HEIGHT_MAX, COMPOSER_HEIGHT_MIN } from '../appearance';

/** 一个最小宿主：一条把手加一个 textarea，与两个真实输入框的结构一致。 */
function Host()
{
  const ref = useRef<HTMLTextAreaElement>(null);
  const { grip, textareaStyle } = useComposerHeight(ref);

  return (
    <div>
      <ComposerGrip {...grip} />
      <textarea ref={ref} style={textareaStyle} />
    </div>
  );
}

function setup(measured = 100)
{
  const view = render(<Host />);
  const box = view.container.querySelector('textarea')!;

  // jsdom 不做布局，getBoundingClientRect 一律返回 0。
  // 把「当前多高」钉住，拖拽才有个起算点。
  box.getBoundingClientRect = () => ({ height: measured } as DOMRect);

  return { view, box, grip: view.container.querySelector('.composer-grip')! };
}

/** 走一遍完整的按下—移动—抬起。 */
function drag(grip: Element, fromY: number, toY: number): void
{
  fireEvent.pointerDown(grip, { clientY: fromY, pointerId: 1 });
  fireEvent.pointerMove(grip, { clientY: toY, pointerId: 1 });
  fireEvent.pointerUp(grip, { clientY: toY, pointerId: 1 });
}

beforeEach(() =>
{
  window.localStorage.removeItem('agent.composerHeight');
});

describe('输入框拖拽调高', () =>
{
  it('往上拖是变高', () =>
  {
    const { box, grip } = setup(100);

    // 输入框是从下往上长的：向下拖变大与直觉相反，这也是没用 CSS 原生 resize 的原因。
    drag(grip, 300, 240);

    expect(box.style.height).toBe('160px');
  });

  it('往下拖是变矮', () =>
  {
    const { box, grip } = setup(200);

    drag(grip, 300, 350);

    expect(box.style.height).toBe('150px');
  });

  it('必须连 maxHeight 一起写', () =>
  {
    const { box, grip } = setup(100);

    drag(grip, 300, 100);

    // CSS 里那条 max-height 会把内联 height 夹回去，只设 height 的话
    // 拖过 10em 就再也拖不动了——而且看起来就像把手坏了。
    expect(box.style.maxHeight).toBe(box.style.height);
  });

  it('夹在上下限之内', () =>
  {
    const big = setup(100);
    drag(big.grip, 3000, 0);
    expect(Number.parseInt(big.box.style.height, 10)).toBeLessThanOrEqual(COMPOSER_HEIGHT_MAX);

    const small = setup(100);
    drag(small.grip, 0, 3000);
    expect(Number.parseInt(small.box.style.height, 10)).toBeGreaterThanOrEqual(COMPOSER_HEIGHT_MIN);
  });

  it('没按下就移动不改高度', () =>
  {
    const { box, grip } = setup(100);

    // 鼠标扫过把手不该动它。
    fireEvent.pointerMove(grip, { clientY: 100, pointerId: 1 });

    expect(box.style.height).toBe('');
  });

  it('抬起时存下来，下次挂载还在', () =>
  {
    const first = setup(100);
    drag(first.grip, 300, 250);
    first.view.unmount();

    const second = setup(100);

    expect(second.box.style.height).toBe('150px');
  });

  it('双击恢复默认，且把存档也清掉', () =>
  {
    const first = setup(100);
    drag(first.grip, 300, 250);

    fireEvent.doubleClick(first.grip);

    // 内联 style 撤掉，交还给 CSS 里的默认高度。
    expect(first.box.style.height).toBe('');
    first.view.unmount();

    // 只清当前这一屏而不清存档的话，下次打开又会变回拖过的高度。
    const second = setup(100);
    expect(second.box.style.height).toBe('');
  });
});
