import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileHistoryPanel } from './FileHistoryPanel';
import type { PanelItemView } from '../panelState';

function item(partial: Partial<PanelItemView>): PanelItemView {
  return {
    id: 'abc@v3|F:\\repo\\docs\\a.md',
    title: 'a.md',
    subtitle: 'docs\\a.md',
    enabled: true,
    detail: '',
    fields: {
      path: 'F:\\repo\\docs\\a.md',
      version: '3',
      backupTime: '2026-08-19 01:00',
      size: '2 KB',
    },
    currentProject: false,
    scope: '',
    ...partial,
  };
}

describe('文件回滚面板', () => {
  it('点「还原」不直接写盘，要二次确认', () => {
    // 这个动作会覆盖工作区里的文件。一步到位的按钮迟早被误点。
    const onRestore = vi.fn();
    render(<FileHistoryPanel items={[item({})]} onRestore={onRestore} />);

    fireEvent.click(screen.getByRole('button', { name: '还原' }));
    expect(onRestore).not.toHaveBeenCalled();
    expect(screen.getByText('确定覆盖这个文件？')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '确定还原' }));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it('回传的是条目 id，不是路径', () => {
    // 宿主按 id 重读盘拿真实路径，前端传路径等于把「写到哪」的决定权交给前端。
    const onRestore = vi.fn();
    const id = 'abc@v3|F:\\repo\\docs\\a.md';

    render(<FileHistoryPanel items={[item({ id })]} onRestore={onRestore} />);

    fireEvent.click(screen.getByRole('button', { name: '还原' }));
    fireEvent.click(screen.getByRole('button', { name: '确定还原' }));

    expect(onRestore).toHaveBeenCalledWith(id);
  });

  it('取消后回到未确认状态且不还原', () => {
    const onRestore = vi.fn();
    render(<FileHistoryPanel items={[item({})]} onRestore={onRestore} />);

    fireEvent.click(screen.getByRole('button', { name: '还原' }));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(onRestore).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '还原' })).toBeTruthy();
  });

  it('快照已被清理的条目不给按钮而是说明理由', () => {
    // 只给个灰按钮，用户无从判断是坏了还是不该点。
    render(<FileHistoryPanel items={[item({ enabled: false })]} onRestore={() => {}} />);

    expect(screen.getByText('快照已被清理')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '还原' })).toBeNull();
  });

  it('同时只允许一个待确认条目', () => {
    // 两行同时挂着确认，用户很容易点错行——而这个动作会覆盖文件。
    const a = item({ id: 'a@v1|F:\\repo\\a.md', title: 'a.md' });
    const b = item({ id: 'b@v1|F:\\repo\\b.md', title: 'b.md' });

    render(<FileHistoryPanel items={[a, b]} onRestore={() => {}} />);

    const buttons = screen.getAllByRole('button', { name: '还原' });
    fireEvent.click(buttons[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '还原' })[0]);

    expect(screen.getAllByText('确定覆盖这个文件？')).toHaveLength(1);
  });

  it('顶部就说明「覆盖前会另存」', () => {
    // 要在动手之前让用户知道有退路，而不是事后在转录里才发现。
    render(<FileHistoryPanel items={[item({})]} onRestore={() => {}} />);

    expect(screen.getByText(/另存/)).toBeTruthy();
  });

  it('空态与出错时不互相矛盾', () => {
    const { rerender } = render(<FileHistoryPanel items={[]} onRestore={() => {}} />);
    expect(screen.getByText('本会话还没有文件改动记录。')).toBeTruthy();

    rerender(<FileHistoryPanel items={[]} error="读取失败：拒绝访问" onRestore={() => {}} />);
    expect(screen.queryByText('本会话还没有文件改动记录。')).toBeNull();
  });
});
