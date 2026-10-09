import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { insertionSlot, type DockSide, type DropTarget } from "@/lib/dock/dock-layout";
import type { PanelId } from "@/lib/dock/panels";
import { moveDragGhost } from "../drag-ghost";
import { edgeScrollDelta, startPointerDrag } from "../pointer-drag";

export interface DockDrag {
  readonly id: PanelId;
  /** Current drop target, or null when the pointer is not over a dock. */
  readonly target: DropTarget | null;
}

function isDockSide(value: string | undefined): value is DockSide {
  return value === "left" || value === "right";
}

// 停靠區（含空白側的放置區）標 data-dock-side，群組標 data-dock-group，頁籤列標 data-dock-tabbar，頁籤標 data-dock-tab。
// 指到頁籤列 = 併入那一組（頁籤之間的位置）；停靠區其他地方 = 在群組之間另成一組
function hitTest(x: number, y: number): DropTarget | null {
  const hit = document.elementFromPoint(x, y);
  const dock = hit?.closest<HTMLElement>("[data-dock-side]");
  const side = dock?.dataset.dockSide;
  if (!dock || !isDockSide(side)) return null;
  const groups = [...dock.querySelectorAll<HTMLElement>(":scope > [data-dock-group]")];

  const tabBar = hit?.closest<HTMLElement>("[data-dock-tabbar]");
  const group = tabBar ? groups.indexOf(tabBar.closest<HTMLElement>("[data-dock-group]")!) : -1;
  if (tabBar && group >= 0) {
    const centers = [...tabBar.querySelectorAll<HTMLElement>("[data-dock-tab]")].map((tab) => {
      const rect = tab.getBoundingClientRect();
      return rect.left + rect.width / 2;
    });
    return { side, kind: "tab", group, slot: insertionSlot(centers, x) };
  }

  const centers = groups.map((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top + rect.height / 2;
  });
  return { side, kind: "group", slot: insertionSlot(centers, y) };
}

function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (a === b) return true;
  if (a === null || b === null || a.side !== b.side || a.kind !== b.kind || a.slot !== b.slot) return false;
  return a.kind === "group" || (b.kind === "tab" && a.group === b.group);
}

/**
 * Drags tool panels by their tabs: within a tab bar, into another group, or out as a new group.
 * React state changes only when the drop target changes; the floating label follows the pointer
 * through direct style updates so the canvas does not re-render on every pointer move.
 *
 * Args:
 *   onDrop: Called with the panel and target when a drag ends over a dock.
 *
 * Returns:
 *   drag: Current drag (null when idle).
 *   startDrag: Pointer-down handler for a panel tab.
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
    let pointer = { x: event.clientX, y: event.clientY };
    let frame = 0;
    const update = (): void => {
      const next = hitTest(pointer.x, pointer.y);
      if (!sameTarget(next, target)) {
        target = next;
        setDrag({ id, target });
      }
    };
    // 指到頁籤列時，靠近左右邊緣就捲動那一列（頁籤放不下時才拿得到看不到的位置）；捲動後插入位置跟著重算
    const autoScroll = (): void => {
      if (target?.kind === "tab") {
        const list = document
          .elementFromPoint(pointer.x, pointer.y)
          ?.closest("[data-dock-tabbar]")
          ?.querySelector<HTMLElement>('[role="tablist"]');
        const delta = list ? edgeScrollDelta(list.getBoundingClientRect(), pointer.x) : 0;
        if (list && delta !== 0) {
          list.scrollLeft += delta;
          update();
        }
      }
      frame = requestAnimationFrame(autoScroll);
    };
    cleanupRef.current = startPointerDrag(event, {
      onStart: (e) => {
        pointer = { x: e.clientX, y: e.clientY };
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
        if (commit && target) onDropRef.current(id, target);
      },
      onDone: () => {
        cancelAnimationFrame(frame);
        cleanupRef.current = null;
      },
    });
  }, []);

  return { drag, startDrag, ghostRef };
}
