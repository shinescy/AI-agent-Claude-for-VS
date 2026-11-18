import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SkillsDialog, nextSkillState, filterSkills } from './SkillsDialog';
import type { SkillRow } from './SkillsDialog';

type Posted = { option?: string; value?: string; requestId?: string };

let posted: Posted[] = [];
let hostHandlers: Set<(event: MessageEvent) => void>;

beforeEach(() => {
  posted = [];
  hostHandlers = new Set();

  (window as unknown as { chrome?: unknown }).chrome = {
    webview: {
      postMessage: (message: unknown) => { posted.push(message as Posted); },
      addEventListener: (_type: string, handler: (event: MessageEvent) => void) => { hostHandlers.add(handler); },
      removeEventListener: (_type: string, handler: (event: MessageEvent) => void) => { hostHandlers.delete(handler); },
    },
  };
});

afterEach(() => {
  delete (window as unknown as { chrome?: unknown }).chrome;
});

function emit(payload: Record<string, unknown>) {
  act(() => { hostHandlers.forEach((handler) => handler({ data: { type: 'context', payload } } as MessageEvent)); });
}

const SKILLS: SkillRow[] = [
  { name: 'p:alpha', display_name: 'alpha', description: 'first', source: 'user', tokens: 10, state: 'on', handles: { unqualified_name: 'alpha' } },
  { name: 'beta', description: 'second', source: 'plugin', state: 'off', locked_by: 'plugin' },
];

function last(option: string): Posted {
  return posted.filter((m) => m.option === option).slice(-1)[0];
}

describe('技能弹窗', () => {
  it('打开就读清单；点状态按下一档发修改，带上 handles；回包刷新列表', () => {
    render(<SkillsDialog onClose={() => undefined} />);

    const read = last('skills');
    expect(read).toBeTruthy();
    emit({ kind: 'skills', requestId: read.requestId, dialog: JSON.stringify({ skills: SKILLS }), error: '' });

    fireEvent.click(screen.getByRole('button', { name: 'alpha: 开' }));
    const edit = last('setSkillState');
    expect(JSON.parse(edit.value!)).toEqual({ name: 'p:alpha', state: 'name-only', handles: { unqualified_name: 'alpha' } });
    expect(screen.getByText('保存中…')).toBeTruthy();

    const updated = [{ ...SKILLS[0], state: 'name-only' }, SKILLS[1]];
    emit({ kind: 'skills', requestId: edit.requestId, dialog: JSON.stringify({ skills: updated }), error: '' });
    expect(screen.getByRole('button', { name: 'alpha: 只给名字' })).toBeTruthy();
  });

  it('被锁定的不给按钮', () => {
    render(<SkillsDialog onClose={() => undefined} />);
    emit({ kind: 'skills', requestId: last('skills').requestId, dialog: JSON.stringify({ skills: SKILLS }), error: '' });

    expect(screen.queryByRole('button', { name: /^beta:/ })).toBeNull();
    expect(screen.getByText(/已锁定/)).toBeTruthy();
  });

  it('说明默认收着，点一下展开看全文，再点收起', () => {
    render(<SkillsDialog onClose={() => undefined} />);
    emit({ kind: 'skills', requestId: last('skills').requestId, dialog: JSON.stringify({ skills: SKILLS }), error: '' });

    const desc = screen.getByText('first');
    expect(desc.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(desc);
    expect(desc.getAttribute('aria-expanded')).toBe('true');
    expect(desc.className).toContain('is-expanded');

    fireEvent.click(desc);
    expect(desc.getAttribute('aria-expanded')).toBe('false');
  });

  it('出错时显示原因', () => {
    render(<SkillsDialog onClose={() => undefined} />);
    emit({ kind: 'skills', requestId: last('skills').requestId, dialog: '', error: '会话还没启动' });
    expect(screen.getByRole('alert').textContent).toContain('会话还没启动');
  });
});

describe('技能状态与筛选', () => {
  it('按 开 → 只给名字 → 仅限你调用 → 关 循环', () => {
    expect(nextSkillState('on')).toBe('name-only');
    expect(nextSkillState('name-only')).toBe('user-invocable-only');
    expect(nextSkillState('user-invocable-only')).toBe('off');
    expect(nextSkillState('off')).toBe('on');
  });

  it('按名字、说明、来源筛', () => {
    expect(filterSkills(SKILLS, 'SECOND').map((s) => s.name)).toEqual(['beta']);
    expect(filterSkills(SKILLS, 'user').map((s) => s.name)).toEqual(['p:alpha']);
    expect(filterSkills(SKILLS, '  ')).toHaveLength(2);
  });
});
