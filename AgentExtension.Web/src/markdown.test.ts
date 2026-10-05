import { describe, it, expect } from 'vitest';
import { isPlainText, renderMarkdown } from './markdown';

// 逐字取自 2026-08-17 真实 /usage 输出（CLI 2.1.233）。
const USAGE_OUTPUT = `You are currently using your subscription to power your Claude Code usage

Current session: 2% used · resets Aug 17, 5:59pm (Asia/Taipei)
Current week (all models): 2% used · resets Aug 24, 9:59am (Asia/Taipei)

Last 24h · 2445 requests · 14 sessions
  100% of your usage came from sessions active for 8+ hours
  93% of your usage was at >150k context
  Top subagents: general-purpose 7%`;

describe('纯文本判定', () => {
  it('usage 这类靠缩进表达层级的输出算纯文本', () => {
    // markdown 会把行首缩进吃掉，层级被压平，和终端里差得远
    expect(isPlainText(USAGE_OUTPUT)).toBe(true);
  });

  it('markdown 渲染确实会吃掉行首缩进', () => {
    // 这条断言是上面那个判定存在的理由，写出来免得将来有人以为多此一举
    const html = renderMarkdown('第一行\n  缩进两格的第二行');
    expect(html).toContain('缩进两格的第二行');
    expect(html).not.toContain('  缩进两格');
  });
});

describe('不得把 markdown 误判成纯文本', () => {
  // 误判的代价远大于漏判：代码块、表格、标题会全部失效
  const cases: [string, string][] = [
    ['标题', '# 标题\n正文'],
    ['无序列表', '- 一项\n- 另一项'],
    ['有序列表', '1. 一项\n2. 另一项'],
    ['引用', '> 引用内容'],
    ['围栏代码块', '```ts\nconst x = 1;\n```'],
    ['波浪围栏', '~~~\ncode\n~~~'],
    ['表格', '| 列 | 值 |\n|---|---|\n| a | b |'],
    ['行内代码', '用 `npm run build` 构建'],
    ['加粗', '这是 **重点**'],
    ['链接', '见 [文档](https://example.com)'],
    ['图片', '![图](a.png)'],
  ];

  for (const [name, text] of cases)
  {
    it(`${name}不算纯文本`, () => {
      expect(isPlainText(text)).toBe(false);
    });
  }
});

describe('边界', () => {
  it('空串不算纯文本', () => {
    // 空内容走哪条路都一样，统一按 markdown 处理，避免多一种空状态
    expect(isPlainText('')).toBe(false);
    expect(isPlainText('   \n  ')).toBe(false);
  });

  it('句中出现的大于号不误判成引用', () => {
    // /usage 里就有 “>150k context”，它不是 markdown 引用
    expect(isPlainText('93% of your usage was at >150k context')).toBe(true);
  });

  it('缩进后的列表标记仍算 markdown', () => {
    expect(isPlainText('  - 缩进的列表项')).toBe(false);
  });
});
