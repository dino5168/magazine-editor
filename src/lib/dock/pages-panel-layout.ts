/**
 * Layout of the Pages panel: its 主頁 and 頁面 sections each collapse on their own, and while
 * both are open the 頁面 title bar can be dragged to share the height between them. An App
 * preference like the dock layout: kept on this computer, never in the project or undo history.
 */
export interface PagesPanelLayout {
  readonly mastersCollapsed: boolean;
  readonly pagesCollapsed: boolean;
  /**
   * Share of the height left for the two section bodies that goes to the master pages, while both
   * are open. A ratio, not pixels, so both sections scale when the dock gets taller or shorter.
   */
  readonly mastersRatio: number;
}

export type PagesPanelSection = "masters" | "pages";

/** Master pages get about a third of the panel by default (there are usually few). */
export const MASTERS_RATIO_DEFAULT = 0.35;
/** Smallest height (CSS px) a section body is dragged down to. */
export const PAGES_SECTION_MIN_PX = 80;
/** One ↑ / ↓ key press on the 頁面 title bar (same as the dock splitter's keyboard step feel). */
export const PAGES_SECTION_KEY_STEP_PX = 16;

export const DEFAULT_PAGES_PANEL_LAYOUT: PagesPanelLayout = {
  mastersCollapsed: false,
  pagesCollapsed: false,
  mastersRatio: MASTERS_RATIO_DEFAULT,
};

const isRatio = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1;

/**
 * Whether the height can be shared by dragging: only while both sections are open.
 *
 * Args:
 *   layout: Current layout.
 *
 * Returns:
 *   True when both sections are expanded.
 */
export function canResizeSections(layout: PagesPanelLayout): boolean {
  return !layout.mastersCollapsed && !layout.pagesCollapsed;
}

/**
 * Collapses or expands one section.
 *
 * Args:
 *   layout: Current layout.
 *   section: Section whose collapse button was pressed.
 *
 * Returns:
 *   New layout.
 */
export function toggleSection(layout: PagesPanelLayout, section: PagesPanelSection): PagesPanelLayout {
  return section === "masters"
    ? { ...layout, mastersCollapsed: !layout.mastersCollapsed }
    : { ...layout, pagesCollapsed: !layout.pagesCollapsed };
}

/**
 * The master pages' share after dragging the 頁面 title bar by `deltaY`, keeping both section
 * bodies at least PAGES_SECTION_MIN_PX tall.
 *
 * Args:
 *   startRatio: Share when the drag started.
 *   deltaY: Pointer movement since the start (down = positive = taller master pages).
 *   available: Height (CSS px) the two section bodies share.
 *
 * Returns:
 *   New share; `startRatio` unchanged when there is not room for both minimum heights.
 */
export function resizeMastersRatio(startRatio: number, deltaY: number, available: number): number {
  if (!(available >= 2 * PAGES_SECTION_MIN_PX)) return startRatio;
  const min = PAGES_SECTION_MIN_PX / available;
  const next = (startRatio * available + deltaY) / available;
  return Math.min(1 - min, Math.max(min, next));
}

/**
 * Sets the master pages' share.
 *
 * Args:
 *   layout: Current layout.
 *   ratio: New share (0–1, exclusive); anything else is ignored.
 *
 * Returns:
 *   New layout, or the same one when nothing changes.
 */
export function setMastersRatio(layout: PagesPanelLayout, ratio: number): PagesPanelLayout {
  if (!isRatio(ratio) || ratio === layout.mastersRatio) return layout;
  return { ...layout, mastersRatio: ratio };
}

/**
 * Reads a stored layout: every field is checked, a bad field falls back to its default.
 *
 * Args:
 *   value: Parsed JSON of unknown shape.
 *
 * Returns:
 *   A valid layout.
 */
export function parsePagesPanelLayout(value: unknown): PagesPanelLayout {
  if (typeof value !== "object" || value === null) return DEFAULT_PAGES_PANEL_LAYOUT;
  const record = value as Record<string, unknown>;
  const flag = (key: "mastersCollapsed" | "pagesCollapsed") =>
    typeof record[key] === "boolean" ? (record[key] as boolean) : DEFAULT_PAGES_PANEL_LAYOUT[key];
  return {
    mastersCollapsed: flag("mastersCollapsed"),
    pagesCollapsed: flag("pagesCollapsed"),
    mastersRatio: isRatio(record.mastersRatio) ? record.mastersRatio : MASTERS_RATIO_DEFAULT,
  };
}

// 版本號放在 key 裡：格式不相容時換新 key（和 dockLayout、preferences 相同）
export const PAGES_PANEL_STORAGE_KEY = "magazine-editor.pagesPanel.v1";

/**
 * Loads the saved layout. Missing, unreadable or malformed data yields the default.
 *
 * Args:
 *   storage: Storage to read from, or null (see `getBrowserStorage`).
 *
 * Returns:
 *   A valid layout.
 */
export function loadPagesPanelLayout(storage: Pick<Storage, "getItem"> | null): PagesPanelLayout {
  try {
    const raw = storage?.getItem(PAGES_PANEL_STORAGE_KEY);
    return raw ? parsePagesPanelLayout(JSON.parse(raw)) : DEFAULT_PAGES_PANEL_LAYOUT;
  } catch {
    return DEFAULT_PAGES_PANEL_LAYOUT;
  }
}

/**
 * Saves the layout. Failures (quota, disabled storage) are ignored: it is a convenience.
 *
 * Args:
 *   storage: Storage to write to, or null.
 *   layout: Layout to save.
 */
export function savePagesPanelLayout(storage: Pick<Storage, "setItem"> | null, layout: PagesPanelLayout): void {
  try {
    storage?.setItem(PAGES_PANEL_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // 面板版面只是便利功能，寫入失敗不影響編輯
  }
}
