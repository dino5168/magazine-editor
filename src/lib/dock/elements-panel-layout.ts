import { SHAPE_CATEGORIES, type ShapeCategoryId } from "@/lib/editor/shape-presets";

/**
 * Layout of the Elements panel: its shape categories are an accordion with at most one open.
 * An App preference like the Pages panel layout: kept on this computer, never in the project or
 * undo history.
 */
export interface ElementsPanelLayout {
  /** The open category; null = all collapsed (the user closed the open one). */
  readonly openCategory: ShapeCategoryId | null;
}

/** First time: the 基本 shapes are open. */
export const DEFAULT_ELEMENTS_PANEL_LAYOUT: ElementsPanelLayout = { openCategory: "basic" };

function isCategoryId(value: unknown): value is ShapeCategoryId {
  return SHAPE_CATEGORIES.some((category) => category.id === value);
}

/**
 * Reads a stored layout. A category this version does not have (removed or renamed) falls back
 * to the default, so the panel never opens on nothing by accident; a stored null (all collapsed)
 * is kept.
 *
 * Args:
 *   value: Parsed JSON of unknown shape.
 *
 * Returns:
 *   A valid layout.
 */
export function parseElementsPanelLayout(value: unknown): ElementsPanelLayout {
  if (typeof value !== "object" || value === null) return DEFAULT_ELEMENTS_PANEL_LAYOUT;
  const { openCategory } = value as Record<string, unknown>;
  if (openCategory === null) return { openCategory: null };
  return isCategoryId(openCategory) ? { openCategory } : DEFAULT_ELEMENTS_PANEL_LAYOUT;
}

/**
 * The accordion's value for a layout (Radix single accordions use "" for all collapsed).
 *
 * Args:
 *   layout: Current layout.
 *
 * Returns:
 *   The open category id, or "".
 */
export function accordionValue(layout: ElementsPanelLayout): string {
  return layout.openCategory ?? "";
}

/**
 * The layout after the accordion changed.
 *
 * Args:
 *   value: The accordion's new value: a category id, or "" when the open one was closed.
 *
 * Returns:
 *   New layout (an unknown value counts as all collapsed).
 */
export function layoutFromAccordion(value: string): ElementsPanelLayout {
  return { openCategory: isCategoryId(value) ? value : null };
}

// 版本號放在 key 裡：格式不相容時換新 key（和 pagesPanel、dockLayout 相同）
export const ELEMENTS_PANEL_STORAGE_KEY = "magazine-editor.elementsPanel.v1";

/**
 * Loads the saved layout. Missing, unreadable or malformed data yields the default.
 *
 * Args:
 *   storage: Storage to read from, or null (see `getBrowserStorage`).
 *
 * Returns:
 *   A valid layout.
 */
export function loadElementsPanelLayout(storage: Pick<Storage, "getItem"> | null): ElementsPanelLayout {
  try {
    const raw = storage?.getItem(ELEMENTS_PANEL_STORAGE_KEY);
    return raw ? parseElementsPanelLayout(JSON.parse(raw)) : DEFAULT_ELEMENTS_PANEL_LAYOUT;
  } catch {
    return DEFAULT_ELEMENTS_PANEL_LAYOUT;
  }
}

/**
 * Saves the layout. Failures (quota, disabled storage) are ignored: it is a convenience.
 *
 * Args:
 *   storage: Storage to write to, or null.
 *   layout: Layout to save.
 */
export function saveElementsPanelLayout(storage: Pick<Storage, "setItem"> | null, layout: ElementsPanelLayout): void {
  try {
    storage?.setItem(ELEMENTS_PANEL_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // 面板版面只是便利功能，寫入失敗不影響編輯
  }
}
