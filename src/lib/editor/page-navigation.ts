import type { PageShift } from "./page-order";

/** 頁面切換的目標：上一頁 / 下一頁 / 第一頁 / 最後一頁。 */
export type PageStep = "prev" | "next" | "first" | "last";

/**
 * Parses the page number typed into the page bar.
 *
 * Args:
 *   draft: Raw input text (1-based page number).
 *   pageCount: Number of pages in the document.
 *
 * Returns:
 *   The 0-based page index, clamped to the first / last page; null when the text is not a whole number.
 */
export function parsePageNumber(draft: string, pageCount: number): number | null {
  const text = draft.trim();
  if (!/^\d+$/.test(text) || pageCount < 1) return null;
  return Math.min(Math.max(Number(text), 1), pageCount) - 1;
}

/**
 * Resolves a page step from the current page.
 *
 * Args:
 *   step: Which page to go to.
 *   index: Current 0-based page index.
 *   pageCount: Number of pages in the document.
 *
 * Returns:
 *   The target 0-based index, or null when there is nowhere to go (already at that end).
 */
export function stepPageIndex(step: PageStep, index: number, pageCount: number): number | null {
  const target = { prev: index - 1, next: index + 1, first: 0, last: pageCount - 1 }[step];
  return target === index || target < 0 || target >= pageCount ? null : target;
}

interface PageKeyEvent {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

/**
 * Maps a keydown to a page step: PageUp / PageDown and Ctrl+Home / Ctrl+End.
 *
 * Args:
 *   event: The keyboard event (only key and modifiers are read).
 *
 * Returns:
 *   The page step, or null when the key is not a page shortcut.
 */
export function findPageShortcut(event: PageKeyEvent): PageStep | null {
  if (event.shiftKey || event.altKey) return null;
  const mod = event.ctrlKey || event.metaKey;
  if (!mod && event.key === "PageUp") return "prev";
  if (!mod && event.key === "PageDown") return "next";
  if (mod && event.key === "Home") return "first";
  if (mod && event.key === "End") return "last";
  return null;
}

/** Labels of the page move shortcuts, shown in the page menu. */
export const PAGE_MOVE_SHORTCUT_LABELS: { readonly [S in "left" | "right"]: string } = {
  left: "Ctrl+Shift+PgUp",
  right: "Ctrl+Shift+PgDn",
};

/**
 * Maps a keydown to moving the active page: Ctrl+Shift+PageUp / PageDown (the browser / VS Code
 * convention for moving a tab; PageUp / PageDown alone switch pages).
 *
 * Args:
 *   event: The keyboard event (only key and modifiers are read).
 *
 * Returns:
 *   "left" / "right", or null when the key is not a page move shortcut.
 */
export function findPageMoveShortcut(event: PageKeyEvent): Extract<PageShift, "left" | "right"> | null {
  if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey) return null;
  if (event.key === "PageUp") return "left";
  if (event.key === "PageDown") return "right";
  return null;
}
