// 上下文圆环：悬停文案、点击压缩，以及它在工具栏上的位置。

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { ContextRing, COMPACT_START_TIMEOUT_MS } from './ContextRing';
import { StatusBar } from './StatusBar';

function ring(over: Partial<React.ComponentProps<typeof ContextRing>> = {})
{
  const props = { remaining: 0.944, autoCompact: true, busy: false, onCompact: vi.fn(), ...over };
  const view = render(<ContextRing {...props} />);
  return { props, el: view.container.querySelector('.context-ring') as HTMLElement };
}

describe('上下文圆环', () =>
{
  it('悬停文案带一位小数与换行', () =>
  {
    expect(ring().el.getAttribute('title')).toBe('94.4% 上下文剩余，用完后将自动压缩。\n单击以立即压缩。');
  });

  it('关闭自动压缩时提示不会自动压缩', () =>
  {
    expect(ring({ autoCompact: false }).el.getAttribute('title')).toContain('不会自动压缩');
  });

  it('用量未知也能点：重开 VS 接回的会话还没说话时就是这样', () =>
  {
    const { el, props } = ring({ remaining: null });
    expect(el.getAttribute('title')).toBe('发一条消息后显示上下文用量。\n单击以立即压缩。');
    fireEvent.click(el);
    expect(props.onCompact).toHaveBeenCalledTimes(1);
  });

  it('忙时点击无效，空闲点击触发一次', () =>
  {
    const busy = ring({ busy: true });
    fireEvent.click(busy.el);
    expect(busy.props.onCompact).not.toHaveBeenCalled();

    const idle = ring();
    fireEvent.click(idle.el);
    expect(idle.props.onCompact).toHaveBeenCalledTimes(1);
  });

  it('点了就转圈并改说正在压缩，压缩跑完（忙过又闲）才停', () =>
  {
    const onCompact = vi.fn();
    const props = { remaining: 0.5, autoCompact: true, onCompact };
    const view = render(<ContextRing {...props} busy={false} />);
    const el = () => view.container.querySelector('.context-ring') as HTMLElement;

    fireEvent.click(el());
    expect(el().classList.contains('is-compacting')).toBe(true);
    expect(el().getAttribute('title')).toBe('正在压缩上下文…');

    // 转圈期间再点不会重复压缩
    fireEvent.click(el());
    expect(onCompact).toHaveBeenCalledTimes(1);

    view.rerender(<ContextRing {...props} busy />);
    expect(el().classList.contains('is-compacting')).toBe(true);

    view.rerender(<ContextRing {...props} busy={false} />);
    expect(el().classList.contains('is-compacting')).toBe(false);
  });

  it('点了却一直没忙起来，过一会儿自己停，不永远转', () =>
  {
    vi.useFakeTimers();
    try
    {
      const { el } = ring();
      fireEvent.click(el);
      expect(el.classList.contains('is-compacting')).toBe(true);

      act(() =>
      {
        vi.advanceTimersByTime(COMPACT_START_TIMEOUT_MS);
      });
      expect(el.classList.contains('is-compacting')).toBe(false);
    }
    finally
    {
      vi.useRealTimers();
    }
  });

  it('忙时标 aria-disabled，空闲时不标（用量未知也不标）', () =>
  {
    expect(ring({ remaining: null }).el.getAttribute('aria-disabled')).toBe('false');
    expect(ring({ busy: true }).el.getAttribute('aria-disabled')).toBe('true');
    expect(ring().el.getAttribute('aria-disabled')).toBe('false');
  });

  it('放在工具栏右侧、远程按钮之前', () =>
  {
    const view = render(
      <StatusBar
        contextRing={<ContextRing remaining={0.5} autoCompact busy={false} onCompact={() => undefined} />}
        permissionMode="acceptEdits"
        onPermissionModeChange={() => undefined}
        ultracode={{ visible: false, on: false }}
        onUltracodeChange={() => undefined}
        remoteControl={false}
        onRemoteControlChange={() => undefined}
        promptCache={null}
        onOpenSettings={() => undefined}
      />);

    const items = Array.from(view.container.querySelector('.status-bar')!.children);
    const spacer = items.findIndex((e) => e.classList.contains('status-spacer'));
    const ringAt = items.findIndex((e) => e.classList.contains('context-ring'));
    const remoteAt = items.findIndex((e) => /远程/.test(e.textContent ?? ''));

    expect(ringAt).toBeGreaterThan(spacer);
    expect(ringAt).toBeLessThan(remoteAt);
  });
});
