import type { PageId } from "./types";

/**
 * 頁面排序的純邏輯：頁籤拖曳、目前頁選單的移動項目與快捷鍵都在這裡算出新順序，
 * 再交給 reducer 的 `page/reorder`（一次 = 一筆復原）。
 */

/** Where the current page moves: one step, or to an end. */
export type PageShift = "left" | "right" | "first" | "last";

/**
 * Checks that `order` lists exactly the ids of `current`, each once (a permutation).
 *
 * Args:
 *   current: Page ids in the current order.
 *   order: Candidate new order.
 *
 * Returns:
 *   True when `order` is a reordering of `current`.
 */
export function isPageOrder(current: readonly PageId[], order: readonly PageId[]): boolean {
  if (order.length !== current.length) return false;
  const ids = new Set(current);
  return new Set(order).size === order.length && order.every((id) => ids.has(id));
}

/**
 * Moves one page so it ends up at `toIndex` (clamped to the list).
 *
 * Args:
 *   order: Page ids in the current order.
 *   id: Page to move.
 *   toIndex: Wanted 0-based index in the result.
 *
 * Returns:
 *   The new order; the same array when the page is unknown or does not move.
 */
export function movePage(order: readonly PageId[], id: PageId, toIndex: number): readonly PageId[] {
  const from = order.indexOf(id);
  const to = Math.min(Math.max(0, Math.trunc(toIndex)), order.length - 1);
  if (from === -1 || from === to) return order;
  const next = order.filter((pageId) => pageId !== id);
  next.splice(to, 0, id);
  return next;
}

/**
 * Moves one page a step left / right, or to the first / last place.
 *
 * Args:
 *   order: Page ids in the current order.
 *   id: Page to move.
 *   shift: Direction.
 *
 * Returns:
 *   The new order; the same array when the page is already there.
 */
export function shiftPage(order: readonly PageId[], id: PageId, shift: PageShift): readonly PageId[] {
  const from = order.indexOf(id);
  if (from === -1) return order;
  switch (shift) {
    case "left":
      return movePage(order, id, from - 1);
    case "right":
      return movePage(order, id, from + 1);
    case "first":
      return movePage(order, id, 0);
    case "last":
      return movePage(order, id, order.length - 1);
    default: {
      const exhaustive: never = shift;
      return exhaustive;
    }
  }
}

/**
 * New page order after moving one page, for the page menu and the shortcut.
 *
 * Args:
 *   pages: Pages in the current order.
 *   id: Page to move (the active page).
 *   shift: Direction.
 *
 * Returns:
 *   The new order, or null when the page is already there (menu items are disabled then).
 */
export function shiftedPageOrder(
  pages: readonly { readonly id: PageId }[],
  id: PageId,
  shift: PageShift,
): readonly PageId[] | null {
  const order = pages.map((page) => page.id);
  const next = shiftPage(order, id, shift);
  return next === order ? null : next;
}

/**
 * Converts a drop slot of the tab bar (the gap before tab `slot`; `length` = after the last tab)
 * into the index the dragged page ends up at.
 *
 * Args:
 *   slot: Gap index, 0..length.
 *   fromIndex: Current index of the dragged page.
 *
 * Returns:
 *   Target index for `movePage`.
 */
export function slotToIndex(slot: number, fromIndex: number): number {
  // 拖曳的頁面先拿掉：右邊的空隙都往左一格
  return slot > fromIndex ? slot - 1 : slot;
}
