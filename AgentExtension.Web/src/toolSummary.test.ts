import { describe, it, expect } from 'vitest';
import { summarizeTool } from './toolSummary';
import type { AgentToolCall } from './types';

function call(name: string, input: unknown): AgentToolCall {
  return { toolUseId: 't1', name, inputJson: JSON.stringify(input), resultText: '', isError: false };
}

describe('工具摘要', () => {
  it('Edit 提取文件名与新旧文本', () => {
    const s = summarizeTool(call('Edit', {
      file_path: 'C:\\code\\src\\Foo.cs', old_string: 'a', new_string: 'b',
    }));

    expect(s.title).toBe('Edit');
    expect(s.detail).toBe('Foo.cs');
    expect(s.diff).not.toBeNull();
    expect(s.diff!.oldText).toBe('a');
    expect(s.diff!.newText).toBe('b');
  });

  it('Write 把整个内容当作新增', () => {
    const s = summarizeTool(call('Write', { file_path: '/tmp/new.txt', content: 'hello' }));

    expect(s.diff!.oldText).toBe('');
    expect(s.diff!.newText).toBe('hello');
  });

  it('Read 显示文件名但没有 diff', () => {
    const s = summarizeTool(call('Read', { file_path: 'a/b/c.md' }));

    expect(s.detail).toBe('c.md');
    expect(s.diff).toBeNull();
  });

  it('Bash 显示命令本身', () => {
    const s = summarizeTool(call('Bash', { command: 'git status' }));

    expect(s.detail).toBe('git status');
  });

  it('过长的命令被截断', () => {
    const s = summarizeTool(call('Bash', { command: 'x'.repeat(200) }));

    expect(s.detail.length).toBeLessThanOrEqual(80);
  });

  it('未知工具退化为工具名', () => {
    const s = summarizeTool(call('SomethingNew', { whatever: 1 }));

    expect(s.title).toBe('SomethingNew');
    expect(s.diff).toBeNull();
  });

  it('坏 JSON 不抛异常', () => {
    const broken: AgentToolCall = {
      toolUseId: 't1', name: 'Edit', inputJson: '{not json', resultText: '', isError: false,
    };

    expect(() => summarizeTool(broken)).not.toThrow();
  });
});
