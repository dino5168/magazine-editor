import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { insertionSlot, type DockSide, type DropTarget } from "@/lib/dock/dock-layout";
import type { PanelId } from "@/lib/dock/panels";

/** Pointer movement before a press on a title bar becomes a drag; shorter presses stay clicks (collapse). */
const DRAG_THRESHOLD_PX = 4;

export interface DockDrag {
  readonly id: PanelId;
  /** Current drop target, or null when the pointer is not over a dock. */
  readonly target: DropTarget | null;
}

function isDockSide(value: string | undefined): value is DockSide {
  return value === "left" || value === "right";
}

// 停靠區（含空白側的放置區）標 data-dock-side，面板標 data-dock-panel
function hitTest(x: number, y: number): DropTarget | null {
  const dock = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-dock-side]");
  const side = dock?.dataset.dockSide;
  if (!dock || !isDockSide(side)) return null;
  const centers = [...dock.querySelectorAll<HTMLElement>(":scope > [data-dock-panel]")].map((panel) => {
    const rect = panel.getBoundingClientRect();
    return rect.top + rect.height / 2;
  });
  return { side, slot: insertionSlot(centers, y) };
}

function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  return a === b || (a !== null && b !== null && a.side === b.side && a.slot === b.slot);
}

// 拖曳結束時瀏覽器仍會對標題列送出 click，不能讓它變成「收合」
function swallowNextClick(): void {
  const stop = (event: MouseEvent): void => {
    event.stopPropagation();
    event.preventDefault();
  };
  window.addEventListener("click", stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 0);
}

/**
 * Drags tool panels by their title bars between and within the docks.
 * React state changes only when the drop target changes; the floating label follows the pointer
 * through direct style updates so the canvas does not re-render on every pointer move.
 *
 * Args:
 *   onDrop: Called with the panel and target when a drag ends over a dock.
 *
 * Returns:
 *   drag: Current drag (null when idle).
 *   startDrag: Pointer-down handler for a panel title bar.
 *   ghostRef: Ref for the floating label element.
 */
export function useDockDrag(onDrop: (id: PanelId, target: DropTarget) => void) {
  const [drag, setDrag] = useState<DockDrag | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const onDropRef = useRef(onDrop);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onDropRef.current = onDrop;
  }, [onDrop]);

  // 元件卸載時移除還在進行中的拖曳監聽
  useEffect(() => () => cleanupRef.current?.(), []);

  const startDrag = useCallback((id: PanelId, event: ReactPointerEvent) => {
    if (event.button !== 0 || cleanupRef.current) return;
    const { pointerId } = event;
    const start = { x: event.clientX, y: event.clientY };
    let active = false;
    let target: DropTarget | null = null;

    const moveGhost = (x: number, y: number): void => {
      if (ghostRef.current) ghostRef.current.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
    };

    const onMove = (e: PointerEvent): void => {
      if (e.pointerId !== pointerId) return;
      if (!active) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD_PX) return;
        active = true;
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
        target = hitTest(e.clientX, e.clientY);
        setDrag({ id, target });
      } else {
        const next = hitTest(e.clientX, e.clientY);
        if (!sameTarget(next, target)) {
          target = next;
          setDrag({ id, target });
        }
      }
      moveGhost(e.clientX, e.clientY);
    };

    const finish = (commit: boolean): void => {
      cleanupRef.current?.();
      if (!active) return;
      swallowNextClick();
      setDrag(null);
      if (commit && target) onDropRef.current(id, target);
    };
    const onUp = (e: PointerEvent): void => {
      if (e.pointerId === pointerId) finish(true);
    };
    const onCancel = (e: PointerEvent): void => {
      if (e.pointerId === pointerId) finish(false);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      // 只取消拖曳，不要同時觸發編輯器的 Esc（取消選取）
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKeyDown, { capture: true });
    cleanupRef.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      cleanupRef.current = null;
    };
  }, []);

  return { drag, startDrag, ghostRef };
}
