import { describe, it, expect } from 'vitest';
import { findFileReferences } from './fileRefs';

describe('文件引用识别', () => {
  it('识别裸文件名加行号', () => {
    const refs = findFileReferences('见 Foo.cs:12 处');

    expect(refs).toHaveLength(1);
    expect(refs[0].path).toBe('Foo.cs');
    expect(refs[0].line).toBe(12);
    expect(refs[0].raw).toBe('Foo.cs:12');
  });

  it('识别相对路径', () => {
    const refs = findFileReferences('修改了 src/components/App.tsx:45');

    expect(refs).toHaveLength(1);
    expect(refs[0].path).toBe('src/components/App.tsx');
    expect(refs[0].line).toBe(45);
  });

  it('识别 Windows 反斜杠路径', () => {
    const refs = findFileReferences('见 src\\Vs\\Foo.cs:7');

    expect(refs).toHaveLength(1);
    expect(refs[0].line).toBe(7);
  });

  it('识别绝对路径含盘符', () => {
    const refs = findFileReferences('C:\\code\\Foo.cs:99 出错');

    expect(refs).toHaveLength(1);
    expect(refs[0].line).toBe(99);
  });

  it('行号范围只取起始行', () => {
    const refs = findFileReferences('Foo.cs:10-20 这一段');

    expect(refs).toHaveLength(1);
    expect(refs[0].line).toBe(10);
    expect(refs[0].raw).toBe('Foo.cs:10-20');
  });

  it('一段文本里的多个引用都识别', () => {
    const refs = findFileReferences('先看 A.cs:1，再看 B.ts:2');

    expect(refs).toHaveLength(2);
    expect(refs[0].path).toBe('A.cs');
    expect(refs[1].path).toBe('B.ts');
  });

  it('重复调用不受正则游标影响', () => {
    const text = 'Foo.cs:12';

    expect(findFileReferences(text)).toHaveLength(1);
    expect(findFileReferences(text)).toHaveLength(1);
  });
});

describe('文件引用误伤防护', () => {
  it('不把 URL 端口当成文件', () => {
    expect(findFileReferences('打开 http://example.com:8080 看看')).toHaveLength(0);
  });

  it('不把 https 里的路径当成文件', () => {
    expect(findFileReferences('见 https://a.com/x.html:80')).toHaveLength(0);
  });

  it('不把时间当成文件', () => {
    expect(findFileReferences('会议在 12:30 开始')).toHaveLength(0);
  });

  it('没有扩展名的不算', () => {
    expect(findFileReferences('host:8080 和 server:22')).toHaveLength(0);
  });

  it('冒号后不是数字的不算', () => {
    expect(findFileReferences('Foo.cs:abc')).toHaveLength(0);
  });

  it('行号为零的不算', () => {
    expect(findFileReferences('Foo.cs:0')).toHaveLength(0);
  });

  it('空文本返回空数组', () => {
    expect(findFileReferences('')).toEqual([]);
  });

  it('过长的伪扩展名不算', () => {
    expect(findFileReferences('a.verylongextension:12')).toHaveLength(0);
  });
});
