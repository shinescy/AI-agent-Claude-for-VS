import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  applyAppearance,
  clamp,
  clearComposerHeight,
  loadAppearance,
  loadComposerHeight,
  saveAppearance,
  saveComposerHeight,
} from './appearance';
import type { StorageLike, StyleTarget } from './appearance';

/** 内存存储替身。比 DOM 模拟轻，且能精确构造损坏数据。 */
function fakeStorage(seed: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
  };
}

/** 记录写入了哪些 CSS 变量的样式替身。 */
function fakeStyleTarget(): StyleTarget & { props: Map<string, string> } {
  const props = new Map<string, string>();
  return {
    props,
    style: {
      setProperty: (name, value) => { props.set(name, value); },
      removeProperty: (name) => {
        const old = props.get(name) ?? '';
        props.delete(name);
        return old;
      },
    },
  };
}

describe('数值夹取', () => {
  it('区间内原样返回', () => {
    expect(clamp(13, 10, 24, 13)).toBe(13);
  });

  it('低于下限夹到下限', () => {
    expect(clamp(2, 10, 24, 13)).toBe(10);
  });

  it('高于上限夹到上限', () => {
    expect(clamp(999, 10, 24, 13)).toBe(24);
  });

  it('小数取整', () => {
    expect(clamp(13.6, 10, 24, 13)).toBe(14);
  });

  it('NaN 回退到默认值', () => {
    expect(clamp(Number.NaN, 10, 24, 13)).toBe(13);
  });

  it('Infinity 回退到默认值', () => {
    expect(clamp(Number.POSITIVE_INFINITY, 10, 24, 13)).toBe(13);
  });
});

describe('外观设置持久化', () => {
  let store: StorageLike;

  beforeEach(() => {
    store = fakeStorage();
  });

  it('没存过时给默认值', () => {
    expect(loadAppearance(store)).toEqual(DEFAULT_APPEARANCE);
  });

  it('存了能读回来', () => {
    const custom = { fontFamily: 'Consolas, monospace', fontSize: 16, textColor: '#ff0000' };
    saveAppearance(custom, store);
    expect(loadAppearance(store)).toEqual(custom);
  });

  it('损坏的内容回退到默认值而不是抛异常', () => {
    // 旧版本写的格式、或被手工改坏，都不该让整个面板起不来
    const broken = fakeStorage({ 'agent.appearance': '{不是合法 JSON' });
    expect(loadAppearance(broken)).toEqual(DEFAULT_APPEARANCE);
  });

  it('越界字号在读取时被夹回区间', () => {
    const tooBig = fakeStorage({ 'agent.appearance': JSON.stringify({ fontSize: 999 }) });
    expect(loadAppearance(tooBig).fontSize).toBe(FONT_SIZE_MAX);

    const tooSmall = fakeStorage({ 'agent.appearance': JSON.stringify({ fontSize: 1 }) });
    expect(loadAppearance(tooSmall).fontSize).toBe(FONT_SIZE_MIN);
  });

  it('缺字段的旧数据按默认值补齐', () => {
    const partial = fakeStorage({ 'agent.appearance': JSON.stringify({ fontSize: 15 }) });
    const loaded = loadAppearance(partial);

    expect(loaded.fontSize).toBe(15);
    expect(loaded.fontFamily).toBe(DEFAULT_APPEARANCE.fontFamily);
    expect(loaded.textColor).toBe(DEFAULT_APPEARANCE.textColor);
  });
});

describe('输入框高度持久化', () => {
  let store: StorageLike;

  beforeEach(() => {
    store = fakeStorage();
  });

  it('没调整过返回 null', () => {
    expect(loadComposerHeight(store)).toBeNull();
  });

  it('调整后能读回来', () => {
    saveComposerHeight(200, store);
    expect(loadComposerHeight(store)).toBe(200);
  });

  it('清除后回到 null 而不是最小高度', () => {
    // 曾用 saveComposerHeight(0) 表示「恢复默认」，但读取会把 0 夹到下限，
    // 结果是最小高度而非未设置——双击恢复默认因此失效。
    saveComposerHeight(200, store);
    clearComposerHeight(store);
    expect(loadComposerHeight(store)).toBeNull();
  });

  it('非数值内容按未设置处理', () => {
    const junk = fakeStorage({ 'agent.composerHeight': 'abc' });
    expect(loadComposerHeight(junk)).toBeNull();
  });

  it('越界高度被夹回区间', () => {
    const huge = fakeStorage({ 'agent.composerHeight': '99999' });
    expect(loadComposerHeight(huge)).toBe(600);
  });
});

describe('外观应用到 CSS 变量', () => {
  it('设了值就写上变量', () => {
    const target = fakeStyleTarget();
    applyAppearance({ fontFamily: 'Consolas', fontSize: 16, textColor: '#abcdef' }, target);

    expect(target.props.get('--user-font-family')).toBe('Consolas');
    expect(target.props.get('--user-font-size')).toBe('16px');
    expect(target.props.get('--user-text-color')).toBe('#abcdef');
  });

  it('空值要移除属性而不是设成空串', () => {
    // 留一个空值的自定义属性会让 var(--x, fallback) 拿到空串而非回退值，
    // 表现为「选了跟随主题，字体却整个失效」。
    const target = fakeStyleTarget();
    applyAppearance({ fontFamily: 'Consolas', fontSize: 16, textColor: '#abcdef' }, target);
    applyAppearance(DEFAULT_APPEARANCE, target);

    expect(target.props.has('--user-font-family')).toBe(false);
    expect(target.props.has('--user-text-color')).toBe(false);
  });

  it('字号始终写出，没有空值一说', () => {
    const target = fakeStyleTarget();
    applyAppearance(DEFAULT_APPEARANCE, target);

    expect(target.props.get('--user-font-size')).toBe(`${DEFAULT_APPEARANCE.fontSize}px`);
  });
});
