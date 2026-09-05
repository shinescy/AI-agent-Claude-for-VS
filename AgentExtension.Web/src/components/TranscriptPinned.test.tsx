// 对话侧「把我说的话钉在顶上」。
//
// 钉住这件事本身是 CSS 干的（position:sticky），测不了也不该测——那是浏览器的事。
// 这里钉的是三样错了不报错的东西：
//  1. 每一轮真的被包进了各自的容器（不分组的话所有头会挤在顶部互相叠着，
//     而不是轮流交接，且 CSS 侧看不出任何异常）；
//  2. 「什么时候算钉住」的判定——原件还在屏幕上时那条头必须隐形，否则同一句话
//     在同一个位置画两遍；
//  3. 钉出来的文本剥掉了开头那段固定提示词。不剥的话每一轮的头都长一个样，
//     真正问的那句被省略号吃掉——功能在，但等于没有。

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { Transcript } from './Transcript';
import { fakeObservers } from '../testSetup';
import type { Block } from '../state';

let seq = 0;

function block(kind: Block['kind'], text: string): Block
{
  seq += 1;
  return { id: seq, kind, text, streaming: false };
}

function show(blocks: Block[])
{
  return render(<Transcript blocks={blocks} onRunCommand={vi.fn()} />);
}

/** 造一条 IntersectionObserver 的观察结果投给组件。 */
function report(entry: { isIntersecting: boolean; top: number; rootTop: number | null })
{
  const observer = fakeObservers[fakeObservers.length - 1];

  // 包一层 act：这是从 React 之外投进来的回调，不包的话 setState 不会刷到 DOM，
  // 断言看到的永远是上一帧——一条永远绿的假测试。
  act(() =>
  {
    observer.callback([{
      isIntersecting: entry.isIntersecting,
      boundingClientRect: { top: entry.top },
      rootBounds: entry.rootTop === null ? null : { top: entry.rootTop },
    }]);
  });
}

beforeEach(() =>
{
  window.localStorage.removeItem('agent.chatPrompt');
  fakeObservers.length = 0;
});

describe('转录里钉在顶上的那一轮', () =>
{
  it('一轮一个容器，用户消息领头', () =>
  {
    const view = show([
      block('user', '第一问'),
      block('assistant', '第一答'),
      block('user', '第二问'),
    ]);

    expect(view.container.querySelectorAll('.turn')).toHaveLength(2);
    expect(view.container.querySelectorAll('.turn-head')).toHaveLength(2);
  });

  it('第一条用户消息之前的块也在，没被分组吃掉', () =>
  {
    const view = show([block('notice', '已恢复会话'), block('user', '问题')]);

    expect(view.container.textContent).toContain('已恢复会话');
    // 那一组没有头，不该凭空长出一条横栏。
    expect(view.container.querySelectorAll('.turn-head')).toHaveLength(1);
  });

  it('钉住那行写的是这条消息', () =>
  {
    const view = show([block('user', '1+1 等于几')]);

    expect(view.container.querySelector('.pinned-turn-text')!.textContent).toBe('1+1 等于几');
  });

  it('默认不钉——原件还在屏幕上，钉了就是同一句话画两遍', () =>
  {
    const view = show([block('user', '问题')]);

    expect(view.container.querySelector('.turn-head')!.className).not.toContain('is-stuck');
  });

  it('原件从上边滚出去了才钉', () =>
  {
    const view = show([block('user', '问题')]);

    report({ isIntersecting: false, top: -40, rootTop: 0 });

    expect(view.container.querySelector('.turn-head')!.className).toContain('is-stuck');
  });

  it('这一轮整个还在屏幕下方（从下边出去）不算钉住', () =>
  {
    const view = show([block('user', '问题')]);

    report({ isIntersecting: false, top: 400, rootTop: 0 });

    expect(view.container.querySelector('.turn-head')!.className).not.toContain('is-stuck');
  });

  it('整个转录被藏起来时量不出矩形，一律不钉', () =>
  {
    const view = show([block('user', '问题')]);

    report({ isIntersecting: false, top: -40, rootTop: 0 });
    report({ isIntersecting: false, top: -40, rootTop: null });

    expect(view.container.querySelector('.turn-head')!.className).not.toContain('is-stuck');
  });

  it('剥掉开头那段固定提示词，钉的是这一次真正问的', () =>
  {
    window.localStorage.setItem('agent.chatPrompt', '用中文回答');
    const view = show([block('user', '用中文回答\n1+1 等于几')]);

    expect(view.container.querySelector('.pinned-turn-text')!.textContent).toBe('1+1 等于几');
  });

  it('多行消息折成一行——钉住的东西必须是固定高度的', () =>
  {
    const view = show([block('user', '第一行\n第二行')]);

    expect(view.container.querySelector('.pinned-turn-text')!.textContent).toBe('第一行 第二行');
  });

  it('点一下跳回原消息', () =>
  {
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    const view = show([block('user', '问题')]);

    fireEvent.click(view.container.querySelector('.pinned-turn')!);

    expect(scrolled).toHaveBeenCalled();
    scrolled.mockRestore();
  });

  it('对读屏隐藏：同一句话下面就有原件，念两遍反而更糟', () =>
  {
    const view = show([block('user', '问题')]);

    expect(view.container.querySelector('.pinned-turn')!.getAttribute('aria-hidden')).toBe('true');
  });
});
