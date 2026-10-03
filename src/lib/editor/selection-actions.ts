import type { EditorAction } from "./editor-reducer";
import { createId } from "./element-factory";
import type { CanvasElement } from "./types";

// 快捷鍵與底部動作列共用：作用在整組選取，每個 action 都是一筆復原

/**
 * Deletes the selected elements.
 *
 * Args:
 *   selected: Selected elements.
 *
 * Returns:
 *   Action removing all of them.
 */
export function deleteSelection(selected: readonly CanvasElement[]): EditorAction {
  return { type: "element/delete", ids: selected.map((element) => element.id) };
}

/**
 * Duplicates the selected elements with fresh ids; the copies become the selection.
 *
 * Args:
 *   selected: Selected elements.
 *
 * Returns:
 *   Action copying all of them.
 */
export function duplicateSelection(selected: readonly CanvasElement[]): EditorAction {
  return { type: "element/duplicate", copies: selected.map((element) => ({ id: element.id, newId: createId() })) };
}

/**
 * Moves the selected elements by the same offset.
 *
 * Args:
 *   selected: Selected elements.
 *   dx: Horizontal offset in pt.
 *   dy: Vertical offset in pt.
 *
 * Returns:
 *   Action moving all of them.
 */
export function nudgeSelection(selected: readonly CanvasElement[], dx: number, dy: number): EditorAction {
  return {
    type: "element/updateMany",
    patches: selected.map((element) => ({ id: element.id, patch: { x: element.x + dx, y: element.y + dy } })),
  };
}
