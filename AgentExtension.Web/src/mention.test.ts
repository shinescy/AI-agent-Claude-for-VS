import { describe, it, expect } from 'vitest';
import { detectMentionQuery, applyMention, findMentions, insertPaths } from './mention';

describe('@ 引用触发检测', () => {
  it('行首的 @ 触发', () => {
    expect(detectMentionQuery('@src', 4)).toBe('src');
  });

  it('句中空白后的 @ 也触发', () => {
    const t = '看看 @App';
    expect(detectMentionQuery(t, t.length)).toBe('App');
  });

  it('只有 @ 时查询为空串而非 null', () => {
    expect(detectMentionQuery('@', 1)).toBe('');
  });

  it('邮箱里的 @ 不触发', () => {
    expect(detectMentionQuery('foo@bar.com', 11)).toBeNull();
  });

  it('装饰器写法不触发', () => {
    expect(detectMentionQuery('用了@Component', 12)).toBeNull();
  });

  it('@ 后有空格则引用已结束', () => {
    expect(detectMentionQuery('@src/App.tsx 为什么', 16)).toBeNull();
  });

  it('没有 @ 时返回 null', () => {
    expect(detectMentionQuery('普通文本', 4)).toBeNull();
  });

  it('取最后一个 @', () => {
    const t = '@a 和 @b';
    expect(detectMentionQuery(t, t.length)).toBe('b');
  });

  it('空文本不触发', () => {
    expect(detectMentionQuery('', 0)).toBeNull();
  });
});

describe('@ 引用插入', () => {
  it('替换掉从 @ 到光标的那段并补空格', () => {
    const r = applyMention('@sr', 3, 'src/App.tsx');
    expect(r.text).toBe('@src/App.tsx ');
    expect(r.caret).toBe(r.text.length);
  });

  it('保留 @ 之前的内容', () => {
    const r = applyMention('看看 @sr', 6, 'src/App.tsx');
    expect(r.text).toBe('看看 @src/App.tsx ');
  });

  it('保留光标之后的内容', () => {
    const r = applyMention('@sr 为什么慢', 3, 'src/App.tsx');
    expect(r.text).toBe('@src/App.tsx  为什么慢');
  });

  it('没有 @ 时原样返回', () => {
    const r = applyMention('普通文本', 4, 'x.cs');
    expect(r.text).toBe('普通文本');
  });
});

describe('findMentions', () => {
  it('扫得出已经打进文本的引用', () => {
    const found = findMentions('看看 @src/App.tsx 为什么慢');

    expect(found).toHaveLength(1);
    expect(found[0].path).toBe('src/App.tsx');
    expect(found[0].raw).toBe('@src/App.tsx');
    expect('看看 @src/App.tsx 为什么慢'.slice(found[0].index, found[0].index + found[0].raw.length))
      .toBe('@src/App.tsx');
  });

  it('行首的也算', () => {
    expect(findMentions('@a/b.ts 讲讲').map((m) => m.path)).toEqual(['a/b.ts']);
  });

  it('邮箱不算——判据与补全那边保持一致', () => {
    // 补全里不弹、卡片里却冒出来，是最让人摸不着头脑的那种不一致。
    expect(findMentions('联系 me@example.com')).toEqual([]);
  });

  it('句末标点不算路径的一部分', () => {
    expect(findMentions('看 @src/a.ts，然后呢').map((m) => m.path)).toEqual(['src/a.ts']);
    expect(findMentions('看 @src/a.ts。').map((m) => m.path)).toEqual(['src/a.ts']);
  });

  it('冒号留着——那是行号的写法', () => {
    expect(findMentions('@src/a.ts:12 这一行').map((m) => m.path)).toEqual(['src/a.ts:12']);
  });

  it('多条按出现顺序给出', () => {
    expect(findMentions('@a.ts 和 @b/c.md 比一比').map((m) => m.path)).toEqual(['a.ts', 'b/c.md']);
  });

  it('空文本没有引用', () => {
    expect(findMentions('')).toEqual([]);
  });
});

describe('insertPaths', () => {
  it('插在光标处并补尾随空格', () => {
    const next = insertPaths('', 0, ['src/a.ts']);

    expect(next.text).toBe('@src/a.ts ');
    expect(next.caret).toBe(next.text.length);
  });

  it('前面贴着字就补一个空格——否则那个 @ 不会被当成引用', () => {
    const next = insertPaths('看看', 2, ['src/a.ts']);

    expect(next.text).toBe('看看 @src/a.ts ');
  });

  it('前面已经是空白就不再补', () => {
    const next = insertPaths('看看 ', 3, ['src/a.ts']);

    expect(next.text).toBe('看看 @src/a.ts ');
  });

  it('多个路径之间用空格隔开', () => {
    const next = insertPaths('', 0, ['a.ts', 'b.ts']);

    expect(next.text).toBe('@a.ts @b.ts ');
  });

  it('插在中间时保住后半截', () => {
    const next = insertPaths('前 后', 2, ['a.ts']);

    expect(next.text).toBe('前 @a.ts 后');
  });

  it('空清单什么都不做', () => {
    const next = insertPaths('原样', 2, []);

    expect(next.text).toBe('原样');
    expect(next.caret).toBe(2);
  });
});
