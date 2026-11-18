import { describe, it, expect } from 'vitest';
import { domId } from './domId';

describe('domId', () => {
  it('不含特殊字符的值原样可用', () => {
    expect(domId('context7@claude-plugins-official')).not.toMatch(/\s/);
  });

  it('含空格的复合 Id 转换后不再含空白符', () => {
    // PluginListParser 复合出的 Id 形如 id#scope#projectPath，
    // projectPath 常见形如 "C:\Program Files\Foo"，含空格。
    const id = 'foo@bar#local#C:\\Program Files\\Foo';

    const converted = domId(id);

    expect(converted).not.toMatch(/\s/);
  });

  it('不同的原始值转换后不会撞车', () => {
    const a = domId('foo bar');
    const b = domId('foo_bar');

    expect(a).not.toBe(b);
  });

  it('同一个值每次转换结果一致（稳定）', () => {
    const id = 'foo@bar#user#C:\\Program Files\\Foo';

    expect(domId(id)).toBe(domId(id));
  });
});
