// 轮次分组与钉住那一行的文本。
//
// 分组本身很简单，但错了不报错：少一组只表现为「有一段内容不跟着钉」，
// 而开头那段（第一条用户消息之前的通知、恢复会话的提示）漏掉的话是**整段不显示**——
// 面板比实际内容少，且毫无迹象。所以两头都钉死。

import { describe, it, expect } from 'vitest';
import { groupTurns, pinnedLabel, LEAD_KEY } from './turnGroups';
import type { Block } from './state';

let seq = 0;

function block(kind: Block['kind'], text: string): Block
{
  seq += 1;
  return { id: seq, kind, text, streaming: false };
}

describe('轮次分组', () =>
{
  it('一条用户消息领头，后面的块都算它这一轮', () =>
  {
    const user = block('user', '问题');
    const groups = groupTurns([user, block('assistant', '回答'), block('tool', '工具')]);

    expect(groups).toHaveLength(1);
    expect(groups[0].head).toBe(user);
    expect(groups[0].body.map((b) => b.kind)).toEqual(['assistant', 'tool']);
  });

  it('下一条用户消息另起一轮', () =>
  {
    const groups = groupTurns([
      block('user', '第一问'),
      block('assistant', '第一答'),
      block('user', '第二问'),
      block('assistant', '第二答'),
    ]);

    expect(groups.map((g) => g.head?.text)).toEqual(['第一问', '第二问']);
    expect(groups[0].body.map((b) => b.text)).toEqual(['第一答']);
    expect(groups[1].body.map((b) => b.text)).toEqual(['第二答']);
  });

  it('第一条用户消息之前的块单独成一组，不能丢', () =>
  {
    const groups = groupTurns([block('notice', '已恢复会话'), block('user', '问题')]);

    expect(groups).toHaveLength(2);
    expect(groups[0].key).toBe(LEAD_KEY);
    expect(groups[0].head).toBeNull();
    expect(groups[0].body.map((b) => b.text)).toEqual(['已恢复会话']);
  });

  it('连着两条用户消息，各占一轮（第一轮身子是空的）', () =>
  {
    const groups = groupTurns([block('user', '一'), block('user', '二')]);

    expect(groups).toHaveLength(2);
    expect(groups[0].body).toEqual([]);
  });

  it('空转录就是空数组', () =>
  {
    expect(groupTurns([])).toEqual([]);
  });

  it('key 用领头消息的 id，两轮不会撞', () =>
  {
    const groups = groupTurns([block('user', '一'), block('user', '二')]);

    expect(new Set(groups.map((g) => g.key)).size).toBe(2);
  });
});

describe('钉住那一行的文本', () =>
{
  it('多行折成一行——钉住的东西必须是固定高度的', () =>
  {
    expect(pinnedLabel('第一行\n第二行\n第三行')).toBe('第一行 第二行 第三行');
  });

  it('剥掉开头那段固定提示词，留下这一次真正问的', () =>
  {
    expect(pinnedLabel('用中文回答\n1+1 等于几', '用中文回答')).toBe('1+1 等于几');
  });

  it('提示词的空白与消息里的对不上也照剥（终端那侧的换行是 TUI 折的）', () =>
  {
    // TUI 按终端宽度折行，折在哪儿与原文无关；拼回来的空白必然和原文不一样。
    expect(pinnedLabel('用中文 回答 问题 1+1 等于几', '用中文回答问题')).toBe('1+1 等于几');
  });

  it('提示词对不上就整条钉上，不猜', () =>
  {
    expect(pinnedLabel('随便说点什么', '用中文回答')).toBe('随便说点什么');
  });

  it('消息比提示词还短，也不能瞎剥', () =>
  {
    expect(pinnedLabel('用中文', '用中文回答')).toBe('用中文');
  });

  it('整条就只有提示词时，还是钉提示词——钉一片空白等于这一轮没有头', () =>
  {
    expect(pinnedLabel('用中文回答', '用中文回答')).toBe('用中文回答');
  });

  it('没给提示词就原样折行', () =>
  {
    expect(pinnedLabel('用中文回答\n1+1 等于几')).toBe('用中文回答 1+1 等于几');
  });
});
