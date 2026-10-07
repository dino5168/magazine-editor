import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from "react";
import { startPointerDrag } from "@/components/pointer-drag";
import { MASTERS_RATIO_DEFAULT, PAGES_SECTION_KEY_STEP_PX, resizeMastersRatio } from "@/lib/dock/pages-panel-layout";

/** Flex value of a section body taking `share` of the free height. */
export function sectionFlex(share: number): string {
  return `${share} 1 0px`;
}

interface SectionResize {
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  readonly onDoubleClick: (event: MouseEvent<HTMLElement>) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

// 按在按鈕上（收合鈕、新增 / 複製 / 刪除）是在操作按鈕，不是要拖曳
const onButton = (target: EventTarget): boolean => target instanceof Element && target.closest("button") !== null;

/**
 * Drag (or ↑ / ↓, or double-click) the 頁面 title bar to share the height between the Pages panel's
 * two section bodies.
 *
 * The press goes through `startPointerDrag` (threshold, Esc cancels, no click after a drag). While
 * dragging, the bodies' `flex` is written straight to the DOM so the thumbnails do not re-render on
 * every pointer move; the new share is committed once on release (same rule as the dock splitter:
 * preview locally, write back at the end). Esc puts the old share back.
 *
 * Args:
 *   rootRef: The panel's flex column; its `role="region"` children are the two section bodies.
 *   ratio: Current master pages share.
 *   enabled: False while a section is collapsed (nothing to share).
 *   onCommit: Receives the new share.
 *
 * Returns:
 *   Handlers for the 頁面 title bar (pointer / double-click) and its separator (keys).
 */
export function useSectionResize(
  rootRef: RefObject<HTMLElement | null>,
  ratio: number,
  enabled: boolean,
  onCommit: (ratio: number) => void,
): SectionResize {
  const cancelRef = useRef<(() => void) | null>(null);
  // 拖曳中卸載（例如關閉面板）時結束這次按壓
  useEffect(() => () => cancelRef.current?.(), []);

  const bodies = (): HTMLElement[] => [...(rootRef.current?.querySelectorAll<HTMLElement>(':scope > [role="region"]') ?? [])];
  const available = (): number => bodies().reduce((sum, body) => sum + body.getBoundingClientRect().height, 0);
  const preview = (share: number): void => {
    const [masters, pages] = bodies();
    if (!masters || !pages) return;
    masters.style.flex = sectionFlex(share);
    pages.style.flex = sectionFlex(1 - share);
  };

  return {
    onPointerDown: (event) => {
      if (!enabled || event.button !== 0 || onButton(event.target)) return;
      const startY = event.clientY;
      const height = available();
      let next = ratio;
      cancelRef.current = startPointerDrag(event, {
        cursor: "row-resize",
        onStart: () => undefined,
        onMove: (move) => {
          next = resizeMastersRatio(ratio, move.clientY - startY, height);
          preview(next);
        },
        onEnd: (commit) => {
          if (commit) onCommit(next);
          else preview(ratio);
        },
        onDone: () => {
          cancelRef.current = null;
        },
      });
    },
    onDoubleClick: (event) => {
      if (enabled && !onButton(event.target)) onCommit(MASTERS_RATIO_DEFAULT);
    },
    onKeyDown: (event) => {
      if (!enabled || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? PAGES_SECTION_KEY_STEP_PX : -PAGES_SECTION_KEY_STEP_PX;
      onCommit(resizeMastersRatio(ratio, step, available()));
    },
  };
}
