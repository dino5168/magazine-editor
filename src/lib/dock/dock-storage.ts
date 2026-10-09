import { DEFAULT_DOCK_LAYOUT, parseDockLayout, parseDockWidths, type DockLayout } from "./dock-layout";

// 版本號放在 key 裡：之後格式不相容時換新 key，舊資料自然被忽略（或在 loadDockLayout 轉換）
export const DOCK_LAYOUT_STORAGE_KEY = "magazine-editor.dockLayout.v3";
/** Older layouts (v2: panels stacked top to bottom; v1: no property panel); only their widths are kept. */
export const OLDER_DOCK_LAYOUT_STORAGE_KEYS = ["magazine-editor.dockLayout.v2", "magazine-editor.dockLayout.v1"] as const;

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

/**
 * Returns window.localStorage, or null when it is unavailable (non-browser environment,
 * or access throws because storage is disabled).
 *
 * Returns:
 *   Storage or null.
 */
export function getBrowserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Loads the saved dock layout. Missing, unreadable or malformed data yields the default layout.
 * A layout from before panel groups (v2 / v1) is not converted: the default groups are used with
 * the saved dock widths.
 *
 * Args:
 *   storage: Storage to read from, or null.
 *
 * Returns:
 *   A valid layout.
 */
export function loadDockLayout(storage: ReadableStorage | null): DockLayout {
  try {
    const raw = storage?.getItem(DOCK_LAYOUT_STORAGE_KEY);
    if (raw) return parseDockLayout(JSON.parse(raw));
    for (const key of OLDER_DOCK_LAYOUT_STORAGE_KEYS) {
      const older = storage?.getItem(key);
      if (older) return { ...DEFAULT_DOCK_LAYOUT, width: parseDockWidths(JSON.parse(older)) };
    }
    return DEFAULT_DOCK_LAYOUT;
  } catch {
    return DEFAULT_DOCK_LAYOUT;
  }
}

/**
 * Saves the dock layout. Failures (quota, disabled storage) are ignored:
 * the layout is a convenience, losing it must not interrupt editing.
 *
 * Args:
 *   storage: Storage to write to, or null.
 *   layout: Layout to save.
 */
export function saveDockLayout(storage: WritableStorage | null, layout: DockLayout): void {
  try {
    storage?.setItem(DOCK_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // 版面記憶只是便利功能，寫入失敗不影響編輯
  }
}
