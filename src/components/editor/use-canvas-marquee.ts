import { useEffect, useRef, useState, type RefObject } from "react";
import { boundsFromPoints } from "@/lib/editor/element-factory";
import type { Bounds, Point } from "@/lib/editor/types";

/** Pointer movement below this (screen px, in both directions) is a click, not a marquee. */
const CLICK_TOLERANCE_PX = 4;

interface Marquee {
  /** Screen position relative to the scroll container. */
  readonly start: Point;
  current: Point;
  readonly additive: boolean;
}

interface UseCanvasMarqueeOptions {
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  /** Converts a container-relative screen point to page pt with the current zoom and scroll. */
  readonly toPt: (screen: Point) => Point;
  /** Called once on release with the marquee in pt; `additive` when Ctrl was held at the start. */
  readonly onSelectBox: (box: Bounds, additive: boolean) => void;
}

function relative(element: HTMLElement, event: { clientX: number; clientY: number }): Point {
  const rect = element.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

/**
 * Marquee selection with the select tool: drag on empty canvas to select the enclosed elements.
 *
 * The canvas calls `start` from the stage's mousedown when nothing was hit. Movement is tracked on
 * `window` (the drag may leave the canvas); the preview box is positioned directly, and one
 * `onSelectBox` call happens on release. A press without a drag does nothing here (the canvas has
 * already cleared the selection). Esc cancels.
 *
 * Args:
 *   options: See `UseCanvasMarqueeOptions`.
 *
 * Returns:
 *   previewRef: Ref for the dashed marquee box.
 *   previewVisible: Whether a marquee is being dragged.
 *   start: Starts a marquee at a mouse event.
 */
export function useCanvasMarquee({ scrollRef, toPt, onSelectBox }: UseCanvasMarqueeOptions) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  // listener 在按下時註冊，放開時才執行：要讀到當下最新的換算與 callback
  const latest = useRef({ toPt, onSelectBox });
  latest.current = { toPt, onSelectBox };

  useEffect(() => () => stopRef.current?.(), []);

  const updatePreview = (marquee: Marquee): void => {
    const box = previewRef.current;
    if (!box) return;
    box.style.left = `${Math.min(marquee.start.x, marquee.current.x)}px`;
    box.style.top = `${Math.min(marquee.start.y, marquee.current.y)}px`;
    box.style.width = `${Math.abs(marquee.current.x - marquee.start.x)}px`;
    box.style.height = `${Math.abs(marquee.current.y - marquee.start.y)}px`;
  };

  const start = (event: MouseEvent, additive: boolean): void => {
    const element = scrollRef.current;
    if (event.button !== 0 || !element) return;
    stopRef.current?.();
    const point = relative(element, event);
    const marquee: Marquee = { start: point, current: point, additive };

    // 在按下的當下就註冊（不等 effect）：快速點一下時 pointerup 可能比 effect 先到
    const onPointerMove = (moveEvent: PointerEvent): void => {
      marquee.current = relative(element, moveEvent);
      updatePreview(marquee);
    };
    const onPointerUp = (upEvent: PointerEvent): void => {
      stop();
      marquee.current = relative(element, upEvent);
      const dx = Math.abs(marquee.current.x - marquee.start.x);
      const dy = Math.abs(marquee.current.y - marquee.start.y);
      if (dx < CLICK_TOLERANCE_PX && dy < CLICK_TOLERANCE_PX) return;
      const { toPt: convert, onSelectBox: select } = latest.current;
      select(boundsFromPoints(convert(marquee.start), convert(marquee.current)), marquee.additive);
    };
    // capture + stopImmediatePropagation：Esc 只取消框選，不讓編輯器的 Esc 也觸發
    const onKeyDown = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      keyEvent.stopImmediatePropagation();
      stop();
    };
    const stop = (): void => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("blur", stop);
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      stopRef.current = null;
      setPreviewVisible(false);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("blur", stop);
    window.addEventListener("keydown", onKeyDown, { capture: true });
    stopRef.current = stop;

    updatePreview(marquee);
    setPreviewVisible(true);
  };

  return { previewRef, previewVisible, start };
}
