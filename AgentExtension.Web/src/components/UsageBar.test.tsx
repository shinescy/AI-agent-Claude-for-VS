import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { UsageBar } from './UsageBar';
import { formatRemaining } from '../usageFormat';
import type { UsageWindow } from '../types';

/** 固定「现在」，否则倒计时断言会随运行时刻时好时坏。 */
const NOW_SECONDS = 1787000000;

function win(overrides: Partial<UsageWindow> = {}): UsageWindow {
  return {
    label: 'Current session',
    percentUsed: 11,
    resetsAtText: 'Aug 18, 5:59pm (Asia/Taipei)',
    resetsAtUnix: NOW_SECONDS + 3600,
    model: '',
    ...overrides,
  };
}

function setup(windows: UsageWindow[]) {
  const onRefresh = vi.fn();
  render(<UsageBar windows={windows} onRefresh={onRefresh} />);
  return { onRefresh };
}

afterEach(() => {
  vi.useRealTimers();
});

const t = (zh: string, params?: Record<string, string | number>) => {
  let out = zh;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
};

describe('剩余时间排版', () => {
  it('还剩多天时给天与小时，不给秒', () => {
    // 还剩两天时精确到秒毫无意义，反而要读三段才知道「还很多」。
    expect(formatRemaining(2 * 86400 + 3 * 3600 + 45, t)).toBe('2 天 3 小时');
  });

  it('不到一天时给小时与分', () => {
    expect(formatRemaining(5 * 3600 + 9 * 60 + 30, t)).toBe('5 小时 9 分');
  });

  it('最后一小时内给到秒', () => {
    // 这时候用户是真的在盯着它。
    expect(formatRemaining(9 * 60 + 5, t)).toBe('9 分 5 秒');
  });

  it('已过重置时刻时说已重置而不是显示负数', () => {
    expect(formatRemaining(0, t)).toBe('已重置');
    expect(formatRemaining(-120, t)).toBe('已重置');
  });
});

describe('额度用量条', () => {
  it('还没探到时说获取中，而不是留一条空栏', () => {
    // 空栏会被当成渲染坏了；「获取中」会自己变好。
    setup([]);
    expect(screen.getByText(/获取中/)).toBeTruthy();
  });

  it('每个窗口各显示一行，行数不写死', () => {
    setup([
      win({ label: 'Current session', percentUsed: 11 }),
      win({ label: 'Current week (all models)', percentUsed: 35 }),
      win({ label: 'Current week (Fable)', percentUsed: 1, model: 'Fable' }),
    ]);

    expect(screen.getByText('当前会话')).toBeTruthy();
    expect(screen.getByText('本周')).toBeTruthy();
    expect(screen.getByText('本周（Fable）')).toBeTruthy();
    expect(screen.getByText('11%')).toBeTruthy();
    expect(screen.getByText('35%')).toBeTruthy();
  });

  it('认不出的窗口标签原样显示而不是被丢掉', () => {
    // CLI 将来新增窗口时，宁可露出英文原文，也不能让它从界面上消失。
    setup([win({ label: 'Current fortnight (whatever)', model: '' })]);

    expect(screen.getByText('Current fortnight (whatever)')).toBeTruthy();
  });

  it('有绝对时刻时显示倒计时，并每秒自己走', () => {
    // 「实时」的一半靠这个：两次重探之间那一分钟里，剩余时间必须自己在动。
    vi.useFakeTimers();
    vi.setSystemTime(NOW_SECONDS * 1000);

    setup([win({ resetsAtUnix: NOW_SECONDS + 65 })]);

    expect(screen.getByText('余 1 分 5 秒')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText('余 1 分 0 秒')).toBeTruthy();
  });

  it('没有绝对时刻时只显示 CLI 原文，不编倒计时', () => {
    // 实测 rate_limit_event 与 /usage 指的不是同一个窗口（差三天），
    // 拿另一个来源的时间戳去补会显示一个错的倒计时。
    setup([win({ resetsAtUnix: 0, resetsAtText: 'Aug 21, 10:59am (Asia/Taipei)' })]);

    expect(screen.getByText('重置于 Aug 21, 10:59am (Asia/Taipei)')).toBeTruthy();
    expect(screen.queryByText(/^余 /)).toBeNull();
  });

  it('点刷新会请求重探', () => {
    const { onRefresh } = setup([win()]);

    fireEvent.click(screen.getByRole('button'));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('忙碌时照样能手动重探', () => {
    // 探测改走独立短进程后，跟当前这一轮再无瓜葛，没有理由拦着不让点。
    const { onRefresh } = setup([win()]);
    const button = screen.getByRole('button') as HTMLButtonElement;

    expect(button.disabled).toBe(false);

    fireEvent.click(button);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('用量高时标出醒目样式', () => {
    setup([win({ percentUsed: 88 })]);

    const item = screen.getByText('88%').closest('.usage-item');
    expect(item?.className).toContain('usage-item-loud');
  });
});
