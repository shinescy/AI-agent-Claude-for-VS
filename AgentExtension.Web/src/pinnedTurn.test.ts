// 从 TUI 缓冲里认出「这一屏在回答哪句话」。
//
// 下面这份行数据是**真机抄来的**（2026-08-21，CLI 2.1.238，本仓库终端面板）：
// 起了终端、从输入框发了两条消息，把 xterm 渲染出来的行原样记下。判据是照着它定的，
// 所以它也就是这条功能的契约——CLI 换了渲染方式，这里先红。
//
// 认错的代价是横栏上出现一句用户没说过的话，比不显示更糟：不显示只是没做，
// 认错是在骗人。所以「模型输出里的引用块」「还没发出去的草稿」两条都单独钉住。

import { describe, it, expect } from 'vitest';
import { findPinnedTurn } from './pinnedTurn';

/** 真机抄来的缓冲。行号即数组下标。 */
const REAL = [
  ' ▐▛███▛█   Claude Code v2.1.238',
  '▝▜██████▀  Opus 5 with xhigh effort · Claude Max',
  '  ▝▝ ▝▝    F:\\WrokSpace\\NET',
  '> 这是第一条测试消息，只回一个字：一',
  '● 一',
  '✻ Churned for 5s',
  '> 第二条：这是一条很长的消息，用来看看在终端里换行之后后续那些行长什么样子，会不会也带上大',
  '  于号前缀，还是只有第一行有。只回一个字：二',
  '● 二',
  '✻ Cogitated for 5s',
  '─'.repeat(60),
  '>',
  '─'.repeat(60),
  '  ⏵⏵ accept edits on (shift+tab to cycle)',
];

function reader(lines: string[])
{
  return (row: number) => (row >= 0 && row < lines.length ? lines[row] : null);
}

function pin(lines: string[], topRow: number, maxScan?: number)
{
  return findPinnedTurn(reader(lines), topRow, lines.length, maxScan);
}

describe('终端里钉住的那一轮', () =>
{
  it('可视区顶在回答上，钉的是它上面那句问题', () =>
  {
    expect(pin(REAL, 8)?.text).toBe(
      '第二条：这是一条很长的消息，用来看看在终端里换行之后后续那些行长什么样子，会不会也带上大 于号前缀，还是只有第一行有。只回一个字：二');
  });

  it('续行（缩进两格那些）要拼进来，不能只钉第一行', () =>
  {
    expect(pin(REAL, 8)?.text).toContain('只回一个字：二');
  });

  it('往上翻到上一轮，钉的就换成上一轮那句', () =>
  {
    const found = pin(REAL, 5);

    expect(found?.text).toBe('这是第一条测试消息，只回一个字：一');
    expect(found?.row).toBe(3);
  });

  it('顶在开头（上面一句都没有）时往下找第一句——否则刚开始用时横栏一直空着', () =>
  {
    expect(pin(REAL, 0)?.row).toBe(3);
  });

  it('往下找时撞到输入框边框就停：草稿不是「你问过的话」', () =>
  {
    const onlyDraft = [
      ' ▐▛█   Claude Code v2.1.238',
      '─'.repeat(60),
      '> 我正打到一半还没发',
      '─'.repeat(60),
    ];

    expect(pin(onlyDraft, 0)).toBeNull();
  });

  it('钩子/工具的结果行不算续行——它也缩进两格，接上去就成了用户没说过的话', () =>
  {
    // 真机原样（同一次会话，CLI 2.1.238）：钩子超时的结果就长这样，
    // 缩进两格，和长消息的续行一模一样。第一版没排掉它，横栏上就跟着出现
    // 「…回「甲」 ⎿  UserPromptSubmit hook timed out after 10s…」。
    const withHook = [
      '> 只回一个字，回「甲」',
      '  ⎿  UserPromptSubmit hook timed out after 10s — output discarded.',
      '● 甲',
    ];

    expect(pin(withHook, 2)?.text).toBe('只回一个字，回「甲」');
  });

  it('模型输出里的引用块不算用户消息（它缩进两格，不在行首）', () =>
  {
    const quoted = ['> 真正的问题', '● 文档里是这么写的：', '  > 这是引用不是我说的'];
    const found = pin(quoted, 2);

    expect(found?.text).toBe('真正的问题');
  });

  it('空的输入行只有一个提示符，不该被当成一条消息', () =>
  {
    expect(pin(['>'], 0)).toBeNull();
  });

  it('别的版本用过的提示符也认', () =>
  {
    expect(pin(['❯ 换了提示符的版本'], 0)?.text).toBe('换了提示符的版本');
  });

  it('缓冲全空时返回 null，不抛', () =>
  {
    expect(pin([], 0)).toBeNull();
  });

  it('超过回翻上限就不找了——回滚缓冲有五千行，每次滚动都从头扫是白烧 CPU', () =>
  {
    const long = ['> 很久以前问的', ...Array.from({ length: 50 }, () => '● 一堆输出')];

    expect(pin(long, 50, 10)).toBeNull();
    expect(pin(long, 50, 60)?.row).toBe(0);
  });
});
