// tab 标题的翻译。标题是宿主用中文拼好推过来的，前端只能按形状认。

import { describe, it, expect } from 'vitest';
import { tabTitle } from './i18n';

describe('tabTitle', () => {
  it('默认标题在英文下换成 Session', () => {
    expect(tabTitle('en', '会话 1')).toBe('Session 1');
    expect(tabTitle('en', '会话 12')).toBe('Session 12');
  });

  it('中文下原样返回', () => {
    expect(tabTitle('zh', '会话 1')).toBe('会话 1');
  });

  it('宿主那边的空格写法有出入也认', () => {
    // C# 侧是 "会话 " + n，但记录文件是用户可以手改的。
    expect(tabTitle('en', '会话1')).toBe('Session 1');
    expect(tabTitle('en', '  会话 3  ')).toBe('Session 3');
  });

  it('认不出的标题原样返回，绝不吞掉', () => {
    // 记录文件里可以是任意字符串，翻译不该把它变成空或者别的东西。
    expect(tabTitle('en', '我自己起的名字')).toBe('我自己起的名字');
    expect(tabTitle('en', 'Session 1')).toBe('Session 1');
    expect(tabTitle('en', '会话 一')).toBe('会话 一');
    expect(tabTitle('en', '')).toBe('');
  });
});
