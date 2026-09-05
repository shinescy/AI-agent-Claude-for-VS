// 思考强度的横向调节滑轨。

import { useRef } from 'react';
import type { EffortOption } from '../efforts';
import { useT } from '../LangContext';

interface EffortSliderProps {
  options: EffortOption[];
  value: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
}

export function EffortSlider({ options, value, onSelect, disabled }: EffortSliderProps) {
  const t = useT();
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const count = options.length;
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const current = options[index];

  const ratio = count > 1 ? index / (count - 1) : 0;

  /** 按指针横坐标换算档位。 */
  function indexAt(clientX: number): number {
    const track = trackRef.current;
    if (!track || count <= 1)
    {
      return 0;
    }

    const rect = track.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(fraction * (count - 1));
  }

  function apply(next: number)
  {
    const option = options[next];
    if (option && option.value !== value)
    {
      onSelect(option.value);
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>)
  {
    if (disabled || e.button !== 0)
    {
      return;
    }

    dragging.current = true;

    try
    {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    catch
    {
      // 退化成「只能在轨道内拖动」，功能仍可用
    }

    apply(indexAt(e.clientX));
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>)
  {
    if (!dragging.current)
    {
      return;
    }
    apply(indexAt(e.clientX));
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>)
  {
    if (!dragging.current)
    {
      return;
    }
    dragging.current = false;

    try
    {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    catch
    {
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>)
  {
    if (disabled)
    {
      return;
    }

    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown')
    {
      e.preventDefault();
      apply(Math.max(0, index - 1));
      return;
    }

    if (e.key === 'ArrowRight' || e.key === 'ArrowUp')
    {
      e.preventDefault();
      apply(Math.min(count - 1, index + 1));
    }
  }

  function title(): string {
    if (!current) {
      return t('思考强度');
    }

    return current.description === ''
      ? t(current.label)
      : t('{label}：{description}', { label: t(current.label), description: t(current.description) });
  }

  return (
    <span className="effort" title={title()}>
      <span className="status-caption">{t('强度')}</span>

      <div
        ref={trackRef}
        className={`effort-track${disabled ? ' effort-track-disabled' : ''}`}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={t('思考强度')}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, count - 1)}
        aria-valuenow={index}
        aria-valuetext={current ? t(current.label) : ''}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <span className="effort-fill" style={{ width: `${ratio * 100}%` }} />

        {options.map((option, i) => (
          <span
            key={option.value}
            className={`effort-notch${i <= index ? ' effort-notch-on' : ''}`}
            style={{ left: `${count > 1 ? (i / (count - 1)) * 100 : 0}%` }}
          />
        ))}

        <span className="effort-thumb" style={{ left: `${ratio * 100}%` }} />
      </div>

      {/* 滑轨本身说不出当前是哪一档，名字必须写出来 */}
      <span className="effort-label">{current ? t(current.label) : t('未知')}</span>
    </span>
  );
}
