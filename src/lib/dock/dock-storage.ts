import { DEFAULT_DOCK_LAYOUT, parseDockLayout, type DockLayout } from "./dock-layout";

// 版本號放在 key 裡：之後格式不相容時換新 key，舊資料自然被忽略
export const DOCK_LAYOUT_STORAGE_KEY = "magazine-editor.dockLayout.v1";

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
    return raw ? parseDockLayout(JSON.parse(raw)) : DEFAULT_DOCK_LAYOUT;
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
