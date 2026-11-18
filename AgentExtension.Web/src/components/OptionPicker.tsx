// 选项框：状态栏上的下拉替代物。

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useT } from '../LangContext';

export interface PickerOption {
  value: string;
  label: string;
  /** 一句话说明，直接显示在标签下面，不塞 title。 */
  description?: string;
}

interface OptionPickerProps {
  /** 状态栏上显示的标题，如「强度」。 */
  caption: string;
  options: PickerOption[];
  value: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
  /** 展开面板的宽度，字多的（如模型说明）给宽一点。 */
  width?: number;
  open: boolean;
  onToggle: (open: boolean) => void;
  /** 触发按钮上改显示这串字；省略就显示选中项的标签。 */
  display?: string;
  /** 面板顶上的小标题，如「选择模型」。 */
  heading?: string;
  /** 触发按钮上跟在值后面的补充，如当前强度。 */
  suffix?: string;
  /** 选项下面的附加行（强度、开关）；点它们不收起面板。 */
  footer?: ReactNode;
}

export function OptionPicker(props: OptionPickerProps) {
  const { caption, options, value, onSelect, disabled, width = 260, open, onToggle, display, heading, suffix, footer } = props;
  const t = useT();
  const rootRef = useRef<HTMLDivElement>(null);

  const current = options.find((o) => o.value === value);

  // 点面板外面收起来，否则它会一直挡着转录底部
  useEffect(() =>
  {
    if (!open)
    {
      return;
    }

    function onPointerDown(e: MouseEvent)
    {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
      {
        onToggle(false);
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, onToggle]);

  return (
    <div className="picker" ref={rootRef}>
      <button
        type="button"
        className="picker-trigger"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => onToggle(!open)}
      >
        <span className="status-caption">{caption}</span>
        {/* 显示具体值。取不到就说「未知」，不要拿「默认」这种没有信息量的说法搪塞 */}
        <span className="picker-value">
          {display ? display : current ? current.label : (value || t('未知'))}
        </span>
        {suffix && <span className="picker-suffix">{suffix}</span>}
        <span className="picker-caret">▾</span>
      </button>

      {open && (
        <div className="picker-panel" style={{ width }}>
          {heading && <div className="picker-heading">{heading}</div>}
          <div className="picker-options">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`picker-item${o.value === value ? ' picker-item-current' : ''}`}
              onClick={() => { onSelect(o.value); onToggle(false); }}
            >
              <span className="picker-item-head">
                <span className="picker-item-mark">{o.value === value ? '✓' : ''}</span>
                <span className="picker-item-label">{o.label}</span>
              </span>
              {o.description && <span className="picker-item-desc">{o.description}</span>}
            </button>
          ))}
          </div>
          {footer && <div className="picker-footer">{footer}</div>}
        </div>
      )}
    </div>
  );
}
