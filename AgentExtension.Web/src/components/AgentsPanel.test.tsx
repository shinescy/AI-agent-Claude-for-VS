import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { AgentsPanel } from './AgentsPanel';
import type { PanelItemView } from '../panelState';

// 「当前项目」由宿主标好（C# 侧 MarkCurrentProject），这里直接构造已标注过的 currentProject 字段。
// 强类型字段，不再编码成中文字符串塞进 fields 展示字典——那样键名和取值都没有测试保护。
// 第一、三条同属当前项目仓库，且共享同一个 sessionId、不同 pid——
// 对应 C# 侧「sessionId 不唯一，Id 复合上 pid」那条修复，前端要能同时渲染两行而不撞 key。
const ITEMS: PanelItemView[] = [
  {
    id: 'c9b06976-a791-4a33-a9a2-c97811f96f6a#13220',
    title: 'aifiction-92',
    subtitle: 'interactive · idle',
    enabled: false,
    detail: '',
    fields: {
      cwd: 'F:\\WrokSpace\\NET\\AIFiction\\AIFiction',
      status: 'idle',
      session: 'c9b06976-a791-4a33-a9a2-c97811f96f6a',
      pid: '13220',
    },
    currentProject: true,
  },
  {
    id: 'e553cfb6-d8d2-42c7-a0e3-e6da5adac938#17708',
    title: 'mltradingbit-f6',
    subtitle: 'interactive · busy',
    enabled: true,
    detail: '',
    fields: {
      cwd: 'F:\\WrokSpace\\NET\\MLTradingBit',
      status: 'busy',
      session: 'e553cfb6-d8d2-42c7-a0e3-e6da5adac938',
      pid: '17708',
    },
    currentProject: false,
  },
  {
    id: 'c9b06976-a791-4a33-a9a2-c97811f96f6a#14612',
    title: 'aifiction-9c',
    subtitle: 'interactive · idle',
    enabled: false,
    detail: '',
    fields: {
      cwd: 'F:\\WrokSpace\\NET\\AIFiction\\AIFiction',
      status: 'idle',
      session: 'c9b06976-a791-4a33-a9a2-c97811f96f6a',
      pid: '14612',
    },
    currentProject: true,
  },
];

function setup(items: PanelItemView[] = ITEMS) {
  render(<AgentsPanel items={items} />);
}

function getRow(title: string) {
  const el = screen.getByText(title).closest('.panel-row');

  if (!el) {
    throw new Error(`未找到「${title}」所在的行`);
  }

  return el as HTMLElement;
}

describe('后台代理面板', () => {
  it('默认勾选「只看当前项目」时只显示当前项目的会话', () => {
    setup();

    expect(screen.getByText('aifiction-92')).toBeTruthy();
    expect(screen.getByText('aifiction-9c')).toBeTruthy();
    // mltradingbit-f6 的「当前项目」是「否」，默认应被过滤掉
    expect(screen.queryByText('mltradingbit-f6')).toBeNull();
  });

  it('取消勾选后显示全部会话，含「当前项目」为否的', () => {
    setup();

    fireEvent.click(screen.getByRole('checkbox'));

    expect(screen.getByText('aifiction-92')).toBeTruthy();
    expect(screen.getByText('aifiction-9c')).toBeTruthy();
    expect(screen.getByText('mltradingbit-f6')).toBeTruthy();
  });

  it('空列表时渲染「没有活动会话」', () => {
    setup([]);

    expect(screen.getByText('没有活动会话。')).toBeTruthy();
  });

  it('enabled 为 true 时圆点是实心●', () => {
    setup();
    fireEvent.click(screen.getByRole('checkbox')); // 取消过滤才能看到 mltradingbit-f6

    const row = getRow('mltradingbit-f6');
    const dot = within(row).getByText('●');

    expect(dot.className).toBe('panel-dot-on');
  });

  it('enabled 为 false 时圆点是空心○', () => {
    setup();

    const row = getRow('aifiction-92');
    const dot = within(row).getByText('○');

    expect(dot.className).toBe('panel-dot-off');
  });

  it('同 sessionId 不同 pid 的两条记录能同时渲染出来', () => {
    // C# 侧实测 sessionId 可能重复（同一会话被多个进程共享），
    // Id 复合上 pid 后前端 key 不再撞车，两行都应正常出现。
    setup();

    expect(screen.getByText('aifiction-92')).toBeTruthy();
    expect(screen.getByText('aifiction-9c')).toBeTruthy();
  });

  it('有错误且列表为空时，不再显示与错误横幅矛盾的空态文案', () => {
    render(<AgentsPanel items={[]} error="命令失败" />);
    expect(screen.queryByText('没有活动会话。')).toBeNull();
  });

  it('没有错误时空态文案照常显示', () => {
    render(<AgentsPanel items={[]} error="" />);
    expect(screen.getByText('没有活动会话。')).toBeTruthy();
  });

  it('会话 id 与进程号在行内可见', () => {
    // P7：解析器填了 Fields["会话"]（sessionId）与 Fields["进程号"]（pid），
    // 此前全项目没有任何地方渲染它们。
    setup();

    const row = getRow('aifiction-92');
    expect(within(row).getByText(/c9b06976-a791-4a33-a9a2-c97811f96f6a/)).toBeTruthy();
    expect(within(row).getByText('PID 13220')).toBeTruthy();
  });

  it('缺 status 时显示「状态未知」而不是只剩一个没有文字解释的空心点', () => {
    const missingStatus: PanelItemView[] = [
      {
        id: 'no-status#999',
        title: 'no-status-agent',
        subtitle: 'interactive',
        enabled: false,
        detail: '',
        fields: { cwd: 'F:\\WrokSpace\\NET\\AIFiction\\AIFiction', session: 'no-status', pid: '999' },
        currentProject: true,
      },
    ];

    setup(missingStatus);

    const row = getRow('no-status-agent');
    expect(within(row).getByText('状态未知')).toBeTruthy();
  });

  it('有 status 时行内显示实际状态文本，不显示「状态未知」', () => {
    setup();

    const row = getRow('aifiction-92');
    expect(within(row).getByText('idle')).toBeTruthy();
    expect(within(row).queryByText('状态未知')).toBeNull();
  });
});
