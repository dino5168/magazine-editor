import type { PointerEvent as ReactPointerEvent } from "react";

/** Pointer movement before a press becomes a drag; shorter presses stay clicks (and double-clicks). */
export const DRAG_THRESHOLD_PX = 4;

interface PointerDragHandlers {
  /** The pointer moved past the threshold: the drag starts (called once, before the first `onMove`). */
  readonly onStart: (event: PointerEvent) => void;
  /** Every pointer move once the drag has started. */
  readonly onMove: (event: PointerEvent) => void;
  /** The drag ended: `commit` is true on pointer up, false on Esc / pointer cancel / `cancel()`. Only called after `onStart`. */
  readonly onEnd: (commit: boolean) => void;
  /** Always called once when the press is over (dragged or not), after `onEnd`. */
  readonly onDone?: () => void;
  /** Cursor shown on the whole page while dragging; defaults to "grabbing" (moving things). */
  readonly cursor?: string;
}

/** Distance from a scrolling tab bar's left / right edge (px) where dragging scrolls the tabs. */
const EDGE_SCROLL_ZONE_PX = 40;
/** Fastest auto-scroll (px per frame), reached at the very edge or beyond it. */
const EDGE_SCROLL_MAX_SPEED = 14;

/**
 * How far to scroll a horizontal tab bar this frame while something is dragged near its edges
 * (page tabs, dock tabs): faster the closer the pointer is to (or beyond) the edge.
 *
 * Args:
 *   rect: The scrolling element's bounds (screen px).
 *   x: Pointer x (screen px).
 *
 * Returns:
 *   Change to scrollLeft: negative near the left edge, positive near the right edge, 0 elsewhere.
 */
export function edgeScrollDelta(rect: { readonly left: number; readonly right: number }, x: number): number {
  const speed = (depth: number) => Math.min(EDGE_SCROLL_MAX_SPEED, Math.ceil((depth / EDGE_SCROLL_ZONE_PX) * EDGE_SCROLL_MAX_SPEED));
  const left = rect.left + EDGE_SCROLL_ZONE_PX - x;
  const right = x - (rect.right - EDGE_SCROLL_ZONE_PX);
  if (left > 0) return -speed(left);
  if (right > 0) return speed(right);
  return 0;
}

// 拖曳結束時瀏覽器仍會對按下的元素送出 click，不能讓它變成一般的點擊
function swallowNextClick(): void {
  const stop = (event: MouseEvent): void => {
    event.stopPropagation();
    event.preventDefault();
  };
  window.addEventListener("click", stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 0);
}

/**
 * Follows one press of the primary button as a possible drag (tool panels, page tabs, the Pages
 * panel's section boundary). Listeners go on
 * `window` at the moment of the press, so a quick press-release is never missed. A drag starts after
 * DRAG_THRESHOLD_PX; Esc cancels it without reaching the editor's own Esc; the click that follows a
 * drag is swallowed.
 *
 * Args:
 *   event: The pointerdown event.
 *   handlers: Drag callbacks.
 *
 * Returns:
 *   A function that cancels the press (e.g. when the component unmounts).
 */
export function startPointerDrag(event: ReactPointerEvent | PointerEvent, handlers: PointerDragHandlers): () => void {
  const { pointerId } = event;
  const start = { x: event.clientX, y: event.clientY };
  let active = false;
  let done = false;

  const cleanup = (): void => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("keydown", onKeyDown, { capture: true });
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };
  const finish = (commit: boolean): void => {
    if (done) return;
    done = true;
    cleanup();
    if (active) {
      swallowNextClick();
      handlers.onEnd(commit);
    }
    handlers.onDone?.();
  };

  function onMove(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return;
    if (!active) {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD_PX) return;
      active = true;
      document.body.style.cursor = handlers.cursor ?? "grabbing";
      document.body.style.userSelect = "none";
      handlers.onStart(e);
    }
    handlers.onMove(e);
  }
  function onUp(e: PointerEvent): void {
    if (e.pointerId === pointerId) finish(true);
  }
  function onCancel(e: PointerEvent): void {
    if (e.pointerId === pointerId) finish(false);
  }
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key !== "Escape" || !active) return;
    // 只取消拖曳，不要同時觸發編輯器的 Esc（取消選取）
    e.preventDefault();
    e.stopPropagation();
    finish(false);
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  window.addEventListener("keydown", onKeyDown, { capture: true });
  return () => finish(false);
}
