import type { PageView } from "@/lib/preferences/preferences";
import { getElementBounds } from "./geometry";
import { findSheet } from "./master-pages";
import type { Bounds, CanvasElement, EditorDocument, Page, PageId, Sheet } from "./types";

/** Which side of the spine a page sits on. The first page (cover) is a right-hand page. */
export type PageSide = "left" | "right";

/** One page inside a spread, with its horizontal offset in spread coordinates (pt). */
export interface SpreadSlot {
  readonly page: Page;
  /** 0-based index of the page in the document. */
  readonly index: number;
  readonly side: PageSide;
  /** Left edge of the page in spread coordinates; pages are top-aligned at y = 0. */
  readonly x: number;
}

/** Two facing pages (or one, for the cover and an even last page). */
export interface Spread {
  /** Left page first. */
  readonly slots: readonly SpreadSlot[];
  readonly width: number;
  readonly height: number;
}

/**
 * Side of a page in a magazine layout: page 1 on the right, then 2–3, 4–5 … (odd pages right).
 *
 * Args:
 *   index: 0-based page index.
 *
 * Returns:
 *   "right" for odd page numbers, "left" for even ones.
 */
export function pageSide(index: number): PageSide {
  return index % 2 === 0 ? "right" : "left";
}

/**
 * Index of the spread a page belongs to: page 1 alone, then 2–3, 4–5 ….
 *
 * Args:
 *   index: 0-based page index.
 *
 * Returns:
 *   0-based spread index.
 */
export function spreadIndexOf(index: number): number {
  return Math.floor((index + 1) / 2);
}

function buildSpread(pages: readonly Page[], indices: readonly number[]): Spread {
  let x = 0;
  const slots = indices.map((index) => {
    const slot: SpreadSlot = { page: pages[index], index, side: pageSide(index), x };
    x += pages[index].width;
    return slot;
  });
  return { slots, width: x, height: Math.max(...slots.map((slot) => slot.page.height)) };
}

// 跨頁裡有哪些頁：第 n 個跨頁是第 2n 與 2n+1 頁（1 起算）；第 0 個只有封面
function indicesOfSpread(spreadIndex: number, pageCount: number): number[] {
  const left = 2 * spreadIndex - 1;
  return [left, left + 1].filter((index) => index >= 0 && index < pageCount);
}

/**
 * Every spread of the document, in order.
 *
 * Args:
 *   pages: Pages in document order.
 *
 * Returns:
 *   Spreads; a lone page (the cover, an even last page) is a spread of one.
 */
export function spreadsOf(pages: readonly Page[]): Spread[] {
  if (pages.length === 0) return [];
  const count = spreadIndexOf(pages.length - 1) + 1;
  return Array.from({ length: count }, (_, spreadIndex) => buildSpread(pages, indicesOfSpread(spreadIndex, pages.length)));
}

/**
 * The spread a page belongs to.
 *
 * Args:
 *   pages: Pages in document order.
 *   pageId: The page.
 *
 * Returns:
 *   Its spread, or null when the id is not a page (e.g. a master page).
 */
export function spreadOf(pages: readonly Page[], pageId: PageId): Spread | null {
  const index = pages.findIndex((page) => page.id === pageId);
  if (index === -1) return null;
  return buildSpread(pages, indicesOfSpread(spreadIndexOf(index), pages.length));
}

/** An element of the facing page that crosses the spine into a page. */
export interface SpilloverItem {
  readonly element: CanvasElement;
  /** 0-based index of the page the element belongs to (the facing page). */
  readonly sourceIndex: number;
  /** Add to the element's x to place it in the receiving page's coordinates. */
  readonly dx: number;
}

/**
 * The elements of a page's facing page that cross the spine into it: a left page's elements
 * reaching past its right edge, or a right page's elements reaching past its left edge (rotation
 * included). Only the spine side counts: what sticks out of a page's outer, top or bottom edges stays
 * cut off by the paper. A page alone in its spread (the cover, an even last page) receives nothing.
 *
 * The receiving page draws (and exports) these at `x + dx`; its paper crops them, so the two pages
 * join up across the spine.
 *
 * Args:
 *   pages: Pages in document order (spreads follow magazine order: page 1 alone on the right).
 *   pageIndex: The receiving page.
 *
 * Returns:
 *   Crossing elements in their own page's layer order (bottom first).
 */
export function spilloverInto(pages: readonly Page[], pageIndex: number): SpilloverItem[] {
  const page = pages[pageIndex];
  const spread = page ? spreadOf(pages, page.id) : null;
  if (!spread || spread.slots.length < 2) return [];
  const [left, right] = spread.slots;
  const receivingLeft = left.index === pageIndex;
  const source = receivingLeft ? right : left;
  // 右頁的座標原點在左頁寬度處：左頁 → 右頁 減掉左頁寬，右頁 → 左頁 加上左頁寬
  const dx = receivingLeft ? left.page.width : -left.page.width;
  const crosses = (element: CanvasElement): boolean => {
    const bounds = getElementBounds(element);
    return receivingLeft ? bounds.minX < 0 : bounds.maxX > left.page.width;
  };
  return source.page.elements.filter(crosses).map((element) => ({ element, sourceIndex: source.index, dx }));
}

/**
 * The facing page an element should move to when dropped with its centre past the spine.
 *
 * Args:
 *   pages: Pages in document order.
 *   pageIndex: The page the element belongs to.
 *   centerX: Horizontal centre of what was dropped, in that page's coordinates.
 *
 * Returns:
 *   The facing page and the shift into its coordinates, or null when the centre is still on this
 *   page's side of the spine (or the page has no facing page).
 */
export function pageAcrossSpine(
  pages: readonly Page[],
  pageIndex: number,
  centerX: number,
): { readonly pageId: PageId; readonly dx: number } | null {
  const page = pages[pageIndex];
  const spread = page ? spreadOf(pages, page.id) : null;
  if (!spread || spread.slots.length < 2) return null;
  const [left, right] = spread.slots;
  const width = left.page.width;
  if (left.index === pageIndex) return centerX > width ? { pageId: right.page.id, dx: -width } : null;
  return centerX < 0 ? { pageId: left.page.id, dx: width } : null;
}

/** A page or master page the canvas draws, placed at `x` in the canvas layer's coordinates. */
export interface CanvasSlot {
  readonly sheet: Sheet;
  readonly x: number;
  /** 0-based page index; -1 for a master page. */
  readonly pageIndex: number;
}

/** What the canvas shows: one sheet, or the two pages of a spread side by side. */
export interface CanvasSheets {
  readonly slots: readonly CanvasSlot[];
  readonly width: number;
  readonly height: number;
}

/**
 * The sheets the canvas draws around the active one. In spread view a page brings its facing page;
 * a master page is always shown alone (master pages have no left / right side).
 *
 * Args:
 *   document: Document.
 *   activeId: Page or master page being edited (falls back to the first page).
 *   view: "single" or "spread".
 *
 * Returns:
 *   Slots (left first) and the area they cover from (0, 0).
 */
export function canvasSheets(document: EditorDocument, activeId: PageId, view: PageView): CanvasSheets {
  const active = findSheet(document, activeId) ?? document.pages[0];
  const spread = view === "spread" ? spreadOf(document.pages, active.id) : null;
  if (!spread) {
    const pageIndex = document.pages.findIndex((page) => page.id === active.id);
    return { slots: [{ sheet: active, x: 0, pageIndex }], width: active.width, height: active.height };
  }
  return {
    slots: spread.slots.map((slot) => ({ sheet: slot.page, x: slot.x, pageIndex: slot.index })),
    width: spread.width,
    height: spread.height,
  };
}

/**
 * The sheet under a point of the canvas layer; points outside every sheet go to the nearest one
 * horizontally (left of the first → first, right of the last → last).
 *
 * Args:
 *   sheets: What the canvas shows.
 *   x: Horizontal position in the canvas layer's coordinates.
 *
 * Returns:
 *   The slot of that sheet.
 */
export function canvasSlotAt(sheets: CanvasSheets, x: number): CanvasSlot {
  const { slots } = sheets;
  const inside = slots.find((slot) => x >= slot.x && x < slot.x + slot.sheet.width);
  if (inside) return inside;
  return x < slots[0].x ? slots[0] : slots[slots.length - 1];
}

/**
 * The spread's own area (both pages), in spread coordinates.
 *
 * Args:
 *   spread: The spread.
 *
 * Returns:
 *   Bounds from (0, 0) to (width, height).
 */
export function spreadBounds(spread: Spread): Bounds {
  return { minX: 0, minY: 0, maxX: spread.width, maxY: spread.height };
}
