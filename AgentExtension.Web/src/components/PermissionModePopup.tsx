// 权限模式：一个显示当前模式的按钮，点开是向上弹出的小弹层。
// 弹层上半是模式清单，分隔线下面是 Ultracode 开关。

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { PERMISSION_MODES, WIDE_OPEN_MODES } from '../permissionModes';
import { useT } from '../LangContext';
import { ToggleSwitch } from './ToggleSwitch';

interface PermissionModePopupProps {
  mode: string;
  onModeChange: (mode: string) => void;


  /** Ultracode 开关；visible 为假时不画这一行。 */
  ultracode: { visible: boolean; on: boolean };
  onUltracodeChange: (on: boolean) => void;
}

/** 弹层离面板边缘至少留这么多。 */
const EDGE_GAP = 8;

/** 各模式的线条图标（16×16，跟随文字颜色）。 */
const MODE_ICONS: Record<string, ReactNode> = {
  // 铅笔
  acceptEdits: <path d="M3 13l.8-3.2L10.6 3l2.4 2.4-6.8 6.8L3 13zM9.2 4.4l2.4 2.4" />,
  // 闪电
  auto: <path d="M9 2L4 9h3.4L7 14l5-7H8.6L9 2z" />,
  // 开着的锁
  bypassPermissions: (
    <>
      <rect x="3.5" y="7.5" width="9" height="6" rx="1" />
      <path d="M5.5 7.5V5.2a2.5 2.5 0 0 1 4.8-1" />
    </>
  ),
  // 停一下
  manual: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M6.6 6v4M9.4 6v4" />
    </>
  ),
  // 禁止
  dontAsk: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M4.2 11.8l7.6-7.6" />
    </>
  ),
  // 清单
  plan: <path d="M3 4.5h1.2M3 8h1.2M3 11.5h1.2M6.6 4.5H13M6.6 8H13M6.6 11.5H13" />,
  // 警告三角
  dangerously: (
    <>
      <path d="M8 2.6L14 13H2L8 2.6z" />
      <path d="M8 6.6v3.2M8 11.3v.2" />
    </>
  ),
};

/** 一个模式的图标；认不出的模式画个圆点。 */
function ModeIcon({ mode }: { mode: string }) {
  return (
    <svg
      className="mode-icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {MODE_ICONS[mode] ?? <circle cx="8" cy="8" r="2" />}
    </svg>
  );
}

export function PermissionModePopup(props: PermissionModePopupProps) {
  const {
    mode, onModeChange, ultracode, onUltracodeChange,
  } = props;

  const t = useT();
  const [open, setOpen] = useState(false);

  /** 键盘停在第几个模式上。 */
  const [activeIndex, setActiveIndex] = useState(0);

  /** 量出来的摆放：横向挪多少、最高多高。 */
  const [placement, setPlacement] = useState<{ shift: number; maxHeight: number | null }>(
    { shift: 0, maxHeight: null });

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const current = PERMISSION_MODES.find((item) => item.value === mode);
  const wideOpen = WIDE_OPEN_MODES.has(mode);

  function openPopup()
  {
    setActiveIndex(Math.max(0, PERMISSION_MODES.findIndex((item) => item.value === mode)));
    setPlacement({ shift: 0, maxHeight: null });
    setOpen(true);
  }

  /** 关掉；refocus 为真时把焦点还给按钮。 */
  function closePopup(refocus: boolean)
  {
    setOpen(false);

    if (refocus)
    {
      buttonRef.current?.focus();
    }
  }

  function choose(value: string)
  {
    closePopup(true);

    if (value !== mode)
    {
      onModeChange(value);
    }
  }

  // 点在外面就关。
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
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // 打开后量一次：伸出面板右缘就往左挪，比按钮上方的空间高就限高。
  useLayoutEffect(() =>
  {
    if (!open)
    {
      return;
    }

    listRef.current?.focus();

    const popup = popupRef.current;
    const button = buttonRef.current;

    if (!popup || !button)
    {
      return;
    }

    const rect = popup.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    const overflow = rect.right - (viewport - EDGE_GAP);
    const room = Math.max(0, rect.left - EDGE_GAP);
    const shift = overflow > 0 ? -Math.min(overflow, room) : 0;

    const above = button.getBoundingClientRect().top - EDGE_GAP * 2;
    const maxHeight = above > 120 ? above : null;

    setPlacement({ shift, maxHeight });
  }, [open]);

  /** 弹层里的按键：Esc 在哪儿都关；上下与回车只在模式清单上管。 */
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>)
  {
    if (e.key === 'Escape')
    {
      // 拦下来：不然外层会把这个 Esc 当成「中断」或「交还焦点」。
      e.preventDefault();
      e.stopPropagation();
      closePopup(true);
      return;
    }

    if (e.target !== listRef.current)
    {
      return;
    }

    const count = PERMISSION_MODES.length;

    if (e.key === 'ArrowDown')
    {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % count);
      return;
    }

    if (e.key === 'ArrowUp')
    {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + count) % count);
      return;
    }

    if (e.key === 'Home' || e.key === 'End')
    {
      e.preventDefault();
      setActiveIndex(e.key === 'Home' ? 0 : count - 1);
      return;
    }

    if (e.key === 'Enter' || e.key === ' ')
    {
      e.preventDefault();
      choose(PERMISSION_MODES[activeIndex].value);
    }
  }

  const ultracodeHint = t('每个任务都用动态工作流编排（仅本次会话）');

  return (
    <div className="mode-picker" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`mode-button${wideOpen ? ' mode-button-danger' : ''}`}
        title={current ? t(current.hint) : t('权限模式')}
        aria-label={t('权限模式')}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-mode={mode}
        onClick={() => (open ? closePopup(false) : openPopup())}
      >
        <ModeIcon mode={mode} />
        <span className="mode-button-label">{current ? t(current.label) : mode}</span>
      </button>

      {open && (
        <div
          ref={popupRef}
          className="mode-popup"
          role="dialog"
          aria-label={t('权限模式')}
          // 可聚焦：点到标题、说明这类空白处焦点仍留在弹层里，Esc 才接得住。
          tabIndex={-1}
          style={{
            transform: placement.shift !== 0 ? `translateX(${placement.shift}px)` : undefined,
            maxHeight: placement.maxHeight !== null ? `${placement.maxHeight}px` : undefined,
          }}
          onKeyDown={handleKeyDown}
        >
          <div className="mode-popup-title">{t('权限模式')}</div>

          <div
            ref={listRef}
            className="mode-list"
            role="listbox"
            tabIndex={0}
            aria-label={t('权限模式')}
            aria-activedescendant={`mode-option-${PERMISSION_MODES[activeIndex].value}`}
          >
            {PERMISSION_MODES.map((item, index) =>
            {
              const selected = item.value === mode;
              const danger = WIDE_OPEN_MODES.has(item.value);

              return (
                <div
                  key={item.value}
                  id={`mode-option-${item.value}`}
                  role="option"
                  aria-selected={selected}
                  title={t(item.hint)}
                  className={
                    `mode-option${index === activeIndex ? ' is-active' : ''}`
                    + (danger ? ' mode-option-danger' : '')
                  }
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => choose(item.value)}
                >
                  <ModeIcon mode={item.value} />
                  <span className="mode-option-text">
                    <span className="mode-option-name">{t(item.label)}</span>
                    <span className="mode-option-description">{t(item.description)}</span>
                  </span>
                  <span className="mode-option-check" aria-hidden="true">{selected ? '✓' : ''}</span>
                </div>
              );
            })}
          </div>

          {ultracode.visible && <div className="mode-popup-divider" aria-hidden="true" />}

          {ultracode.visible && (
            <div className="mode-popup-row" title={ultracodeHint}>
              <span className="mode-popup-row-label">
                Ultracode
                <span className="mode-option-description">{ultracodeHint}</span>
              </span>
              <ToggleSwitch
                checked={ultracode.on}
                label="Ultracode"
                title={ultracodeHint}
                onChange={onUltracodeChange}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
