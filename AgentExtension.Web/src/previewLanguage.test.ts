import { describe, it, expect } from 'vitest';
import { previewLanguage, fenceFor } from './previewLanguage';

describe('预览高亮语言', () => {
  it('常见扩展名认得出来', () => {
    expect(previewLanguage('src/App.tsx')).toBe('tsx');
    expect(previewLanguage('a/b/Program.cs')).toBe('csharp');
    expect(previewLanguage('README.md')).toBe('markdown');
    expect(previewLanguage('AgentExtension.csproj')).toBe('xml');
  });

  it('大小写不敏感', () => {
    expect(previewLanguage('A.TS')).toBe('typescript');
  });

  it('反斜杠路径也能取到文件名', () => {
    expect(previewLanguage('a\b\c.py')).toBe('python');
  });

  it('没打进包的语言给空串，走朴素代码块', () => {
    // 给一个 shiki 没加载的名字，它会抛异常再被上层接住——能用，但白扔一次异常。
    expect(previewLanguage('a.zig')).toBe('');
    expect(previewLanguage('Makefile')).toBe('');
    expect(previewLanguage('')).toBe('');
    expect(previewLanguage('trailing.')).toBe('');
  });
});

describe('围栏长度', () => {
  it('普通内容用三个反引号', () => {
    expect(fenceFor('const a = 1;')).toBe('```');
  });

  it('内容里有围栏就加长——不然预览到一半会「变成网页」', () => {
    // 预览的正文是别人的文件，md 文档里本来就有 ```。
    expect(fenceFor('见下：\n```ts\nx\n```\n')).toBe('````');
  });

  it('按最长的一串算', () => {
    expect(fenceFor('a ````` b')).toBe('``````');
  });
});
