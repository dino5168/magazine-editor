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
 * Follows one press of the primary button as a possible drag (tool panels, page tabs). Listeners go on
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
      document.body.style.cursor = "grabbing";
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
