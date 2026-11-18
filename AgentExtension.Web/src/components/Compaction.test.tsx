import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Transcript } from './Transcript';
import { reducer, initialState } from '../state';
import type { TranscriptState } from '../state';
import type { AgentCompaction, AgentEvent } from '../types';

function compaction(data: Partial<AgentCompaction>): AgentEvent {
  const payload: AgentCompaction = {
    phase: 'started', trigger: '', preTokens: 0, postTokens: 0, durationMs: 0,
    boundaryUuid: '', summary: '', error: '', ...data,
  };
  return { kind: 'Compaction', content: '', compactionData: payload } as unknown as AgentEvent;
}

function apply(...events: AgentEvent[]): TranscriptState {
  let state = reducer(initialState, { type: 'userSent', text: '/compact', at: 1 });

  for (const event of events)
  {
    state = reducer(state, { type: 'agentEvent', event });
  }

  return state;
}

function show(state: TranscriptState) {
  return render(<Transcript blocks={state.blocks} onRunCommand={() => undefined} />);
}

describe('上下文压缩块', () => {
  it('进行中只占一块：CLI 每 30 秒重报的开始不再加块', () => {
    const state = apply(compaction({ phase: 'started' }), compaction({ phase: 'started' }));

    expect(state.blocks.filter((b) => b.kind === 'compaction').length).toBe(1);
    show(state);
    expect(screen.getByRole('status').textContent).toContain('正在压缩上下文…');
  });

  it('点了压缩就先显示正在压缩；CLI 随后报的开始不重复加块，完成改的是同一块', () => {
    let state = reducer(reducer(initialState, { type: 'userSent', text: '/compact', at: 1 }), { type: 'compactRequested', at: 2 });
    expect(state.blocks.filter((b) => b.kind === 'compaction').map((b) => b.compaction?.phase)).toEqual(['running']);

    state = reducer(state, { type: 'agentEvent', event: compaction({ phase: 'started' }) });
    state = reducer(state, { type: 'agentEvent', event: compaction({ phase: 'completed', trigger: 'manual', preTokens: 1000, boundaryUuid: 'b-9' }) });

    expect(state.blocks.filter((b) => b.kind === 'compaction').map((b) => b.compaction?.phase)).toEqual(['done']);
  });

  it('完成后一行写明手动与释放多少，展开看摘要，下面有分隔线', () => {
    const state = apply(
      compaction({ phase: 'started' }),
      compaction({ phase: 'completed', trigger: 'manual', preTokens: 243745, postTokens: 128000, boundaryUuid: 'b-1' }),
      compaction({ phase: 'summary', boundaryUuid: 'b-1', summary: '<system-reminder>\n## 摘要标题\n正文\n</system-reminder>' }));

    const blocks = state.blocks.filter((b) => b.kind === 'compaction');
    expect(blocks.length).toBe(1);

    const { container } = show(state);
    expect(container.querySelector('.compaction-line')?.textContent).toBe('已压缩对话 · 手动 · 释放 115.7k tokens');
    expect(container.querySelector('.compaction-divider[role="separator"]')?.textContent).toBe('已压缩');
    expect(container.querySelector('.compaction-body')?.textContent).toContain('正文');
    expect(container.querySelector('.compaction-body')?.textContent).not.toContain('system-reminder');
  });

  it('CLI 没报压缩后的数时写压缩前多少', () => {
    const { container } = show(apply(
      compaction({ phase: 'completed', trigger: 'auto', preTokens: 200000, boundaryUuid: 'b-2' })));

    expect(container.querySelector('.compaction-line')?.textContent).toBe('已压缩对话 · 自动 · 压缩前 200.0k tokens');
    expect(container.querySelector('.compaction-body')?.textContent).toContain('摘要还没读到');
  });

  it('失败写原因；一轮结束还在压缩中的算没压完', () => {
    const failed = apply(compaction({ phase: 'started' }), compaction({ phase: 'failed', error: 'Not enough messages to compact.' }));
    const { unmount } = show(failed);
    expect(screen.getByRole('status').textContent).toBe('压缩失败：Not enough messages to compact.');
    unmount();

    const cut = apply(compaction({ phase: 'started' }), { kind: 'TurnCompleted', content: '' } as unknown as AgentEvent);
    show(cut);
    expect(screen.getByRole('status').textContent).toBe('压缩没有完成。');
  });

  it('出错也收掉还在转圈的压缩块', () => {
    const state = apply(compaction({ phase: 'started' }), { kind: 'Failed', content: '进程退出' } as unknown as AgentEvent);

    expect(state.blocks.find((b) => b.kind === 'compaction')?.compaction?.phase).toBe('failed');
  });

  it('第二次压缩不继承上一次的摘要', () => {
    const state = apply(
      compaction({ phase: 'completed', trigger: 'manual', preTokens: 10, boundaryUuid: 'b-1' }),
      compaction({ phase: 'summary', boundaryUuid: 'b-1', summary: '第一次的摘要' }),
      compaction({ phase: 'completed', trigger: 'auto', preTokens: 20, boundaryUuid: 'b-2' }));

    const blocks = state.blocks.filter((b) => b.kind === 'compaction');
    expect(blocks.map((b) => b.compaction?.summary)).toEqual(['第一次的摘要', '']);
  });

  it('同一次压缩重复回放不多出块；只有摘要也给一块', () => {
    const done = compaction({ phase: 'completed', trigger: 'manual', preTokens: 10, boundaryUuid: 'b-1' });
    const twice = apply(done, done);
    expect(twice.blocks.filter((b) => b.kind === 'compaction').length).toBe(1);

    const orphan = apply(compaction({ phase: 'summary', boundaryUuid: 'gone', summary: '只剩摘要' }));
    const blocks = orphan.blocks.filter((b) => b.kind === 'compaction');
    expect(blocks.length).toBe(1);
    expect(blocks[0].compaction?.phase).toBe('done');
    expect(blocks[0].compaction?.summary).toBe('只剩摘要');
  });
});
