import { useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import {
  COMPOSER_HEIGHT_MAX,
  COMPOSER_HEIGHT_MIN,
  clamp,
  clearComposerHeight,
  loadComposerHeight,
  saveComposerHeight,
} from '../appearance';
import { useT } from '../LangContext';

// 输入框顶边的拖拽把手，以及它背后的高度状态。

/** 把手要用到的那几个事件。 */
export interface GripHandlers
{
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onDoubleClick: () => void;
}

export interface ComposerHeightControl
{
  grip: GripHandlers;

  /** 摊给 textarea 的 style。 */
  textareaStyle: CSSProperties | undefined;
}

/** 输入框高度与顶边拖拽。 */
export function useComposerHeight(
  textareaRef: RefObject<HTMLTextAreaElement>,
  storageKey?: string): ComposerHeightControl
{
  const [height, setHeight] = useState<number | null>(() => loadComposerHeight(undefined, storageKey));
  const dragState = useRef<{ startY: number; startHeight: number } | null>(null);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>): void
  {
    const current = textareaRef.current?.getBoundingClientRect().height ?? COMPOSER_HEIGHT_MIN;
    dragState.current = { startY: e.clientY, startHeight: current };

    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>): void
  {
    const state = dragState.current;

    if (state === null)
    {
      return;
    }

    const next = clamp(
      state.startHeight + (state.startY - e.clientY),
      COMPOSER_HEIGHT_MIN,
      COMPOSER_HEIGHT_MAX,
      COMPOSER_HEIGHT_MIN);

    setHeight(next);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>): void
  {
    if (dragState.current === null)
    {
      return;
    }

    dragState.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);

    if (height !== null)
    {
      saveComposerHeight(height, undefined, storageKey);
    }
  }

  /** 双击把手恢复默认高度。 */
  function onDoubleClick(): void
  {
    setHeight(null);
    clearComposerHeight(undefined, storageKey);
  }

  return {
    grip: { onPointerDown, onPointerMove, onPointerUp, onDoubleClick },
    // 必须连 maxHeight 一起写：CSS 里那条 max-height 会把内联 height 夹回去，
    textareaStyle: height === null ? undefined : { height: `${height}px`, maxHeight: `${height}px` },
  };
}

/** 顶边把手。 */
export function ComposerGrip(handlers: GripHandlers)
{
  const t = useT();

  return (
    <div
      className="composer-grip"
      title={t('拖拽调整输入框高度，双击恢复默认')}
      onPointerDown={handlers.onPointerDown}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={handlers.onPointerUp}
      onDoubleClick={handlers.onDoubleClick}
    />
  );
}
