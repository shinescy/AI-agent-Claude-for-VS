// 对话侧的吸顶栏：整个转录只有一条，钉最后一条已滚出视野的用户消息。
//
// 位置在 jsdom 里量不出来，这里按消息正文假造每条消息的底边，测的是：
//  1. 钉哪条——最后一条整个滚到吸顶栏上方的；
//  2. 点一下跳回原消息，它回到眼前后吸顶换成上一条，能一路往回走；
//  3. 钉出来的文本剥掉开头那段固定提示词，多行折成一行。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Transcript, pickPinned } from './Transcript';
import type { Block } from '../state';

let seq = 0;

function block(kind: Block['kind'], text: string): Block
{
  seq += 1;
  return { id: seq, kind, text, streaming: false };
}

/** 每条用户消息的底边（按正文找）；视口顶在 0，高 500。 */
let bottoms: Record<string, number> = {};
let viewHeight = 500;

function rect(top: number, bottom: number): DOMRect
{
  return { top, bottom, height: bottom - top, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
}

beforeEach(() =>
{
  window.localStorage.removeItem('agent.chatPrompt');
  bottoms = {};
  viewHeight = 500;

  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element)
  {
    if (this.classList.contains('transcript'))
    {
      return rect(0, viewHeight);
    }

    const head = (this as HTMLElement).dataset?.turnHead;

    if (head !== undefined)
    {
      const bottom = bottoms[this.querySelector('.block-text')?.textContent ?? ''] ?? 9999;
      return rect(bottom - 40, bottom);
    }

    return rect(0, 0);
  });
});

afterEach(() =>
{
  vi.restoreAllMocks();
});

function show(blocks: Block[])
{
  return render(<Transcript blocks={blocks} onRunCommand={vi.fn()} />);
}

function pinnedText(container: HTMLElement): string | null
{
  return container.querySelector('.turn-head.is-stuck .pinned-turn-text')?.textContent ?? null;
}

function scroll(container: HTMLElement)
{
  fireEvent.scroll(container.querySelector('.transcript')!);
}

describe('吸顶该钉哪一条', () =>
{
  it('最后一条整个滚到吸顶栏上方的；都还在眼前就不钉', () =>
  {
    expect(pickPinned([-100, -20, 300], 0, 30)).toBe(1);
    expect(pickPinned([-100, 25, 300], 0, 30)).toBe(1);
    expect(pickPinned([40, 300], 0, 30)).toBe(-1);
    expect(pickPinned([], 0, 30)).toBe(-1);
  });
});

describe('转录里的吸顶栏', () =>
{
  it('全在眼前时不钉；滚过去的钉最近那条', () =>
  {
    bottoms = { 第一问: 60, 第二问: 200 };
    const view = show([block('user', '第一问'), block('assistant', '答'), block('user', '第二问')]);
    expect(pinnedText(view.container)).toBeNull();

    bottoms = { 第一问: -300, 第二问: -10 };
    scroll(view.container);
    expect(pinnedText(view.container)).toBe('第二问');
  });

  it('点一下跳回原消息，它回到眼前后吸顶换成上一条，一路往回走', () =>
  {
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element)
    {
      // 跳过去：这条落在吸顶栏下面，前面的都在上方
      const text = this.querySelector('.block-text')?.textContent ?? '';
      bottoms = text === '第三问'
        ? { 第一问: -400, 第二问: -200, 第三问: 80 }
        : { 第一问: -100, 第二问: 80, 第三问: 300 };
    });

    bottoms = { 第一问: -600, 第二问: -400, 第三问: -50 };
    const view = show([block('user', '第一问'), block('user', '第二问'), block('user', '第三问')]);
    scroll(view.container);
    expect(pinnedText(view.container)).toBe('第三问');

    fireEvent.click(view.container.querySelector('.pinned-turn')!);
    scroll(view.container);
    expect(pinnedText(view.container)).toBe('第二问');

    fireEvent.click(view.container.querySelector('.pinned-turn')!);
    scroll(view.container);
    expect(pinnedText(view.container)).toBe('第一问');
    expect(scrolled).toHaveBeenCalledTimes(2);
  });

  it('第一条用户消息之前的块也在，不凭空长出吸顶', () =>
  {
    const view = show([block('notice', '已恢复会话'), block('user', '问题')]);

    expect(view.container.textContent).toContain('已恢复会话');
    expect(view.container.querySelectorAll('.turn-head')).toHaveLength(1);
  });

  it('整个转录被藏起来时量不出矩形，一律不钉', () =>
  {
    bottoms = { 问题: -40 };
    viewHeight = 0;
    const view = show([block('user', '问题')]);

    expect(pinnedText(view.container)).toBeNull();
  });

  it('剥掉开头那段固定提示词，钉的是这一次真正问的', () =>
  {
    window.localStorage.setItem('agent.chatPrompt', '用中文回答');
    bottoms = { '用中文回答\n1+1 等于几': -40 };
    const view = show([block('user', '用中文回答\n1+1 等于几')]);

    expect(pinnedText(view.container)).toBe('1+1 等于几');
  });

  it('多行消息折成一行——钉住的东西必须是固定高度的', () =>
  {
    bottoms = { '第一行\n第二行': -40 };
    const view = show([block('user', '第一行\n第二行')]);

    expect(pinnedText(view.container)).toBe('第一行 第二行');
  });

  it('对读屏隐藏：同一句话下面就有原件，念两遍反而更糟', () =>
  {
    bottoms = { 问题: -40 };
    const view = show([block('user', '问题')]);

    expect(view.container.querySelector('.pinned-turn')!.getAttribute('aria-hidden')).toBe('true');
  });
});
