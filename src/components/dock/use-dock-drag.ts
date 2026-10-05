import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { insertionSlot, type DockSide, type DropTarget } from "@/lib/dock/dock-layout";
import type { PanelId } from "@/lib/dock/panels";
import { moveDragGhost } from "../drag-ghost";
import { startPointerDrag } from "../pointer-drag";

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
    let target: DropTarget | null = null;
    cleanupRef.current = startPointerDrag(event, {
      onStart: (e) => {
        target = hitTest(e.clientX, e.clientY);
        setDrag({ id, target });
      },
      onMove: (e) => {
        const next = hitTest(e.clientX, e.clientY);
        if (!sameTarget(next, target)) {
          target = next;
          setDrag({ id, target });
        }
        moveDragGhost(ghostRef.current, e.clientX, e.clientY);
      },
      onEnd: (commit) => {
        setDrag(null);
        if (commit && target) onDropRef.current(id, target);
      },
      onDone: () => {
        cleanupRef.current = null;
      },
    });
  }, []);

  return { drag, startDrag, ghostRef };
}
