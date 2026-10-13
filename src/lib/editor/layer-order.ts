/**
 * 圖層順序（`element/reorder`）的方向與停用判斷：屬性面板、底部動作列的 `⋮` 與畫布的右鍵選單共用。
 * `elements` 的 index 0 是最底層。
 */
import type { CanvasElement, ElementId } from "./types";

export const REORDER_DIRECTIONS = ["top", "bottom", "up", "down"] as const;

export type ReorderDirection = (typeof REORDER_DIRECTIONS)[number];

/**
 * Whether moving the element in this direction changes the layer order (what `element/reorder` would do).
 *
 * Args:
 *   elements: The sheet's elements, bottom first.
 *   id: Element to move.
 *   direction: `top` / `up` need something above it, `bottom` / `down` something below.
 *
 * Returns:
 *   False when the element is not on the sheet or is already at that end.
 */
export function canReorder(elements: readonly CanvasElement[], id: ElementId, direction: ReorderDirection): boolean {
  const index = elements.findIndex((element) => element.id === id);
  if (index === -1) return false;
  return direction === "top" || direction === "up" ? index < elements.length - 1 : index > 0;
}
