// 思考强度的横向调节滑轨。

import { useRef } from 'react';
import type { EffortOption } from '../efforts';
import { useT } from '../LangContext';

interface EffortSliderProps {
  options: EffortOption[];
  value: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
  /** 只画滑轨，不带标题和档位名（放进菜单行尾时用）。 */
  compact?: boolean;
}

export function EffortSlider({ options, value, onSelect, disabled, compact = false }: EffortSliderProps) {
  const t = useT();
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const count = options.length;
  const found = options.findIndex((o) => o.value === value);

  // 不在清单里（交回模型默认的 auto、还没读到）：不点亮任何一档，免得看着像选了「低」
  const unset = found < 0;
  const index = Math.max(0, found);
  const current = unset ? undefined : options[index];

  const ratio = count > 1 && !unset ? index / (count - 1) : 0;

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
      apply(unset ? 0 : Math.max(0, index - 1));
      return;
    }

    if (e.key === 'ArrowRight' || e.key === 'ArrowUp')
    {
      e.preventDefault();
      // 没选中任何档时先落到第一档，别跳过它
      apply(unset ? 0 : Math.min(count - 1, index + 1));
    }
  }

  /** 一档的悬浮说明。 */
  function describe(option: EffortOption): string
  {
    const text = option.description === ''
      ? t(option.label)
      : t('{label}：{description}', { label: t(option.label), description: t(option.description) });
    return text;
  }

  function title(): string
  {
    if (!current)
    {
      return t('思考强度');
    }

    const text = describe(current);
    return text;
  }

  /** 一档热区的横向范围，首末两档补出圆点伸到轨道外的那半边。 */
  function hitArea(i: number): { left: string; width: string }
  {
    const pad = 5;

    if (count <= 1)
    {
      return { left: `-${pad}px`, width: `calc(100% + ${pad * 2}px)` };
    }

    const step = 100 / (count - 1);

    if (i === 0)
    {
      return { left: `-${pad}px`, width: `calc(${step / 2}% + ${pad}px)` };
    }

    if (i === count - 1)
    {
      return { left: `${100 - step / 2}%`, width: `calc(${step / 2}% + ${pad}px)` };
    }

    return { left: `${i * step - step / 2}%`, width: `${step}%` };
  }

  return (
    <span className={compact ? 'effort effort-compact' : 'effort'} title={title()}>
      {!compact && <span className="status-caption">{t('强度')}</span>}

      <div
        ref={trackRef}
        className={`effort-track${disabled ? ' effort-track-disabled' : ''}`}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={t('思考强度')}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, count - 1)}
        aria-valuenow={unset ? undefined : index}
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
            className={`effort-notch${!unset && i <= index ? ' effort-notch-on' : ''}`}
            style={{ left: `${count > 1 ? (i / (count - 1)) * 100 : 0}%` }}
          />
        ))}

        {!unset && <span className="effort-thumb" style={{ left: `${ratio * 100}%` }} />}

        {/* 整条轨道的提示只说当前档，指到哪档就得说哪档 */}
        {options.map((option, i) => (
          <span
            key={`hit-${option.value}`}
            className="effort-hit"
            title={describe(option)}
            data-effort={option.value}
            style={hitArea(i)}
          />
        ))}
      </div>

      {/* 滑轨本身说不出当前是哪一档，名字必须写出来 */}
      {!compact && (
        <span className="effort-label">
          {current ? t(current.label) : value === 'auto' || value === '' ? t('默认') : value}
        </span>
      )}
    </span>
  );
}
