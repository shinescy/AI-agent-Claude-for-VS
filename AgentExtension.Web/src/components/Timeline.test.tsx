import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Transcript, timelineDot } from './Transcript';
import { ToolCard } from './ToolCard';
import { toolInput } from '../toolSummary';
import type { Block } from '../state';
import type { AgentToolCall } from '../types';

function call(name: string, input: object, resultText = '', isError = false): AgentToolCall {
  return { toolUseId: name, name, inputJson: JSON.stringify(input), resultText, isError } as AgentToolCall;
}

function block(id: number, kind: Block['kind'], extra: Partial<Block> = {}): Block {
  return { id, kind, text: '', streaming: false, ...extra };
}

describe('工具卡片的 IN / OUT', () => {
  it('Bash：标题带说明，IN 是命令，OUT 是结果，默认摊开', () => {
    const { container } = render(
      <ToolCard call={call('Bash', { command: 'git status', description: '看工作区' }, 'clean')} running={false} />);

    expect(container.querySelector('.tool-card-title')?.textContent).toBe('Bash:');
    expect(container.querySelector('.tool-card-headline')?.textContent).toBe('看工作区');

    const boxes = Array.from(container.querySelectorAll('.io-box'));
    expect(boxes.map((box) => box.querySelector('.io-label')?.textContent)).toEqual(['IN', 'OUT']);
    expect(boxes[0].textContent).toContain('git status');
    expect(boxes[1].textContent).toContain('clean');
  });

  it('Agent：标题是「Agent: 任务名」，IN 是交代的任务', () => {
    const view = toolInput(call('Agent', { description: '写入待办文档', prompt: '在目录里建一个文件夹' }));

    expect(view).toEqual({ headline: '写入待办文档', input: '在目录里建一个文件夹', compact: false });
  });

  it('其它执行类工具逐项列参数', () => {
    expect(toolInput(call('TodoWrite', { todos: [1], note: 'x', empty: '' })).input).toBe('todos: [1]\nnote: x');
  });

  it('查找类只占一行：Glob 写模式、Read 写完整路径，结果点开才看', () => {
    const glob = render(<ToolCard call={call('Glob', { pattern: 'check/**/*' }, 'a.md\nb.md')} running={false} />);

    expect(glob.container.querySelector('.tool-card-title')?.textContent).toBe('Glob');
    expect(glob.container.querySelector('.tool-card-headline')?.textContent).toBe('pattern: "check/**/*"');
    expect(glob.container.querySelector('.tool-card-body')).toBeNull();

    fireEvent.click(glob.container.querySelector('.tool-card-header')!);
    expect(glob.container.querySelector('.io-label')?.textContent).toBe('OUT');
    glob.unmount();

    const read = render(<ToolCard call={call('Read', { file_path: 'f:\\SERVER\\check\\README.md' }, '内容')} running={false} />);
    expect(read.container.querySelector('.tool-card-file')?.textContent).toBe('f:\\SERVER\\check\\README.md');
    expect(read.container.querySelector('.tool-card-body')).toBeNull();
  });

  it('输出很长先截断，点「展开全部」看全部；出错的 OUT 标红', () => {
    const long = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const { container } = render(<ToolCard call={call('Bash', { command: 'x' }, long, true)} running={false} />);

    const out = container.querySelectorAll('.io-box')[1];
    expect(out.className).toContain('is-clamped');
    expect(out.className).toContain('is-error');

    fireEvent.click(screen.getByText('展开全部'));
    expect(out.className).not.toContain('is-clamped');
    expect(screen.getByText('收起')).toBeTruthy();
  });

  it('两行就收成一行并给「展开全部」；一行放得下的不给按钮', () => {
    const { container } = render(
      <ToolCard call={call('Bash', { command: 'ls' }, 'a.txt\nb.txt')} running={false} />);

    const [input, output] = Array.from(container.querySelectorAll('.io-box'));
    expect(input.className).not.toContain('is-clamped');
    expect(input.querySelector('.io-more')).toBeNull();
    expect(output.className).toContain('is-clamped');
    expect(output.querySelector('.io-more')?.textContent).toBe('展开全部');
  });

  it('首尾空行不算：收起时那一行不会是空的', () => {
    const { container } = render(
      <ToolCard call={call('Bash', { command: 'ls' }, '\n\nonly line\n\n')} running={false} />);

    const output = container.querySelectorAll('.io-box')[1];
    expect(output.querySelector('.io-text')?.textContent).toBe('only line');
    expect(output.querySelector('.io-more')).toBeNull();
  });

  it('改文件的 diff 收起时只留增删统计，展开才有逐行', () => {
    const { container } = render(
      <ToolCard call={call('Edit', { file_path: 'a.ts', old_string: 'x', new_string: 'y' })} running={false} />);

    const box = container.querySelector('.io-box')!;
    expect(box.className).toContain('is-clamped');
    expect(box.querySelector('.diff-stat')).toBeTruthy();

    fireEvent.click(screen.getByText('展开全部'));
    expect(box.className).toContain('is-full');
  });

  it('点标题收起整张卡片', () => {
    const { container } = render(<ToolCard call={call('Bash', { command: 'ls' }, 'a')} running={false} />);

    fireEvent.click(container.querySelector('.tool-card-header')!);
    expect(container.querySelector('.tool-card-body')).toBeNull();
  });
});

describe('时间线', () => {
  it('工具按成败上色，进行中闪，文字实心，轮末不画点', () => {
    expect(timelineDot(block(1, 'tool', { tool: call('Bash', {}) }))).toBe('ok');
    expect(timelineDot(block(1, 'tool', { tool: call('Bash', {}, '', true) }))).toBe('error');
    expect(timelineDot(block(1, 'tool', { streaming: true, tool: call('Bash', {}) }))).toBe('running');
    expect(timelineDot(block(1, 'assistant'))).toBe('text');
    expect(timelineDot(block(1, 'thinking'))).toBe('muted');
    expect(timelineDot(block(1, 'turnEnd'))).toBe('none');
  });

  it('思考块写「思考了 N 秒」：到下一块开始为止；没有原文就不能展开', () => {
    const { container } = render(
      <Transcript
        blocks={[
          block(1, 'user', { text: '问', at: 1000 }),
          block(2, 'thinking', { at: 2000 }),
          block(3, 'assistant', { text: '答', at: 9000 }),
        ]}
        onRunCommand={() => undefined}
      />);

    expect(screen.getByText('思考了 7 秒')).toBeTruthy();
    expect(container.querySelector('.thinking-block button')).toBeNull();
    expect(Array.from(container.querySelectorAll('.timeline-item')).map((item) => item.getAttribute('data-dot')))
      .toEqual(['muted', 'text']);
  });

  it('忙着的时候末尾一行「✱ 思考中…」；文字正在流出或不忙时不画', () => {
    const tool = block(2, 'tool', { tool: call('Read', { file_path: 'a' }, 'x') });
    const blocks = [block(1, 'user', { text: '问' }), tool];

    const { rerender } = render(<Transcript blocks={blocks} busy onRunCommand={() => undefined} />);
    expect(document.querySelector('.working-line')?.textContent).toContain('中…');

    rerender(<Transcript blocks={[...blocks, block(3, 'assistant', { text: '写到', streaming: true })]} busy onRunCommand={() => undefined} />);
    expect(document.querySelector('.working-line')).toBeNull();

    rerender(<Transcript blocks={blocks} busy={false} onRunCommand={() => undefined} />);
    expect(document.querySelector('.working-line')).toBeNull();
  });

  it('还在思考时写「正在思考…」，有原文可以展开', () => {
    render(
      <Transcript blocks={[block(1, 'thinking', { text: '想一想', streaming: true, at: 1 })]} onRunCommand={() => undefined} />);

    fireEvent.click(screen.getByRole('button', { name: /正在思考/ }));
    expect(screen.getByText('想一想')).toBeTruthy();
  });
});
