import { describe, it, expect, beforeEach } from 'vitest';
import { bookmarkId, loadBookmarks, saveBookmarks, toggleBookmark } from './bookmarks';

beforeEach(() => {
  localStorage.clear();
});

describe('书签', () => {
  it('键只看正文：实时与回放时刻不同也认得出是同一条', () => {
    expect(bookmarkId('a')).toBe(bookmarkId('a\n'));
    expect(bookmarkId('a')).not.toBe(bookmarkId('b'));
    expect(toggleBookmark([], 1, 'x', 1)[0].id).toBe(bookmarkId('x'));
  });

  it('切换：没有就加在最前，有就去掉', () => {
    const one = toggleBookmark([], 1, 'first', 100);
    const two = toggleBookmark(one, 2, 'second', 200);

    expect(two.map((item) => item.text)).toEqual(['second', 'first']);
    expect(toggleBookmark(two, 1, 'first', 300).map((item) => item.text)).toEqual(['second']);
  });

  it('按会话分开存，读回来一样；清空就删键', () => {
    const list = toggleBookmark([], 1, 'reply', 100);
    saveBookmarks('s1', list);

    expect(loadBookmarks('s1')).toEqual(list);
    expect(loadBookmarks('s2')).toEqual([]);

    saveBookmarks('s1', []);
    expect(localStorage.getItem('agentext.bookmarks.s1')).toBeNull();
  });

  it('坏数据与空会话 id 都当作没有', () => {
    localStorage.setItem('agentext.bookmarks.bad', '{坏的');
    expect(loadBookmarks('bad')).toEqual([]);
    expect(loadBookmarks('')).toEqual([]);

    localStorage.clear();
    saveBookmarks('', toggleBookmark([], 1, 'x', 1));
    expect(localStorage.length).toBe(0);
  });
});
