import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { insertionSlot } from "@/lib/dock/dock-layout";
import type { PageId } from "@/lib/editor/types";
import { moveDragGhost } from "../drag-ghost";
import { startPointerDrag } from "../pointer-drag";

/** Drop is accepted this far above / below the tab bar (px), so a slightly off drag still counts. */
const VERTICAL_TOLERANCE_PX = 48;
/** Distance from the bar's left / right edge (px) where dragging scrolls the tabs. */
const EDGE_SCROLL_ZONE_PX = 40;
/** Fastest auto-scroll (px per frame), reached at the very edge or beyond it. */
const EDGE_SCROLL_MAX_SPEED = 14;

export interface PageTabDrag {
  readonly id: PageId;
  /** Gap the page would be dropped into (0 = before the first tab), or null when off the bar. */
  readonly slot: number | null;
}

/**
 * Drags page tabs left / right to reorder pages. Same pattern as the tool panel drag: pointer events,
 * a 4 px threshold (clicks and double-click rename still work), Esc cancels, React state changes only
 * when the gap changes and the floating label moves through direct style updates. Near the bar's
 * edges the tabs scroll, so far-away pages can be reached.
 *
 * Args:
 *   tabListRef: The scrolling tab list; tabs inside carry `data-page-id`.
 *   onDrop: Called with the page and the gap when a drag ends over the bar.
 *
 * Returns:
 *   drag: Current drag (null when idle).
 *   startDrag: Pointer-down handler for a tab.
 *   ghostRef: Ref for the floating label.
 */
export function usePageTabDrag(tabListRef: RefObject<HTMLElement | null>, onDrop: (id: PageId, slot: number) => void) {
  const [drag, setDrag] = useState<PageTabDrag | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const onDropRef = useRef(onDrop);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onDropRef.current = onDrop;
  }, [onDrop]);
  // 元件卸載時取消還在進行中的拖曳
  useEffect(() => () => cancelRef.current?.(), []);

  const startDrag = useCallback(
    (id: PageId, event: ReactPointerEvent) => {
      if (event.button !== 0 || cancelRef.current) return;
      let slot: number | null = null;
      let pointer = { x: event.clientX, y: event.clientY };
      let frame = 0;

      const hitTest = (): number | null => {
        const list = tabListRef.current;
        if (!list) return null;
        const rect = list.getBoundingClientRect();
        if (pointer.y < rect.top - VERTICAL_TOLERANCE_PX || pointer.y > rect.bottom + VERTICAL_TOLERANCE_PX) return null;
        const centers = [...list.querySelectorAll<HTMLElement>(":scope > [data-page-id]")].map((tab) => {
          const r = tab.getBoundingClientRect();
          return r.left + r.width / 2;
        });
        return insertionSlot(centers, pointer.x);
      };
      const update = (): void => {
        const next = hitTest();
        if (next !== slot) {
          slot = next;
          setDrag({ id, slot });
        }
      };
      // 游標靠近左右邊緣（或超出）時每一格捲動一點，越靠邊越快；捲動後插入位置跟著重算
      const autoScroll = (): void => {
        const list = tabListRef.current;
        if (list && slot !== null) {
          const rect = list.getBoundingClientRect();
          const left = rect.left + EDGE_SCROLL_ZONE_PX - pointer.x;
          const right = pointer.x - (rect.right - EDGE_SCROLL_ZONE_PX);
          const speed = (depth: number) => Math.min(EDGE_SCROLL_MAX_SPEED, Math.ceil((depth / EDGE_SCROLL_ZONE_PX) * EDGE_SCROLL_MAX_SPEED));
          if (left > 0) list.scrollLeft -= speed(left);
          else if (right > 0) list.scrollLeft += speed(right);
          if (left > 0 || right > 0) update();
        }
        frame = requestAnimationFrame(autoScroll);
      };

      cancelRef.current = startPointerDrag(event, {
        onStart: () => {
          update();
          frame = requestAnimationFrame(autoScroll);
        },
        onMove: (e) => {
          pointer = { x: e.clientX, y: e.clientY };
          update();
          moveDragGhost(ghostRef.current, e.clientX, e.clientY);
        },
        onEnd: (commit) => {
          setDrag(null);
          if (commit && slot !== null) onDropRef.current(id, slot);
        },
        onDone: () => {
          cancelAnimationFrame(frame);
          cancelRef.current = null;
        },
      });
    },
    [tabListRef],
  );

  return { drag, startDrag, ghostRef };
}
