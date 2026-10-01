import { DEFAULT_DOCK_LAYOUT, isPanelVisible, movePanel, parseDockLayout, type DockLayout } from "./dock-layout";

// 版本號放在 key 裡：之後格式不相容時換新 key，舊資料自然被忽略（或在 loadDockLayout 轉換）
export const DOCK_LAYOUT_STORAGE_KEY = "magazine-editor.dockLayout.v2";
/** v1 had no property panel; v1 layouts are kept and get the panel added once. */
export const DOCK_LAYOUT_STORAGE_KEY_V1 = "magazine-editor.dockLayout.v1";

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
 * A v1 layout is upgraded by opening the property panel at the top of the right side (the
 * selection toolbar it replaces was always visible).
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
    const v1 = storage?.getItem(DOCK_LAYOUT_STORAGE_KEY_V1);
    if (!v1) return DEFAULT_DOCK_LAYOUT;
    const layout = parseDockLayout(JSON.parse(v1));
    return isPanelVisible(layout, "properties") ? layout : movePanel(layout, "properties", "right", 0);
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
