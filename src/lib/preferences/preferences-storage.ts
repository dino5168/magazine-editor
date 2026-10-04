import { DEFAULT_PREFERENCES, parsePreferences, type Preferences } from "./preferences";

// 版本號放在 key 裡：格式不相容時換新 key（和 dockLayout 相同）
export const PREFERENCES_STORAGE_KEY = "magazine-editor.preferences.v1";

/**
 * Loads the saved preferences. Missing, unreadable or malformed data yields the defaults.
 *
 * Args:
 *   storage: Storage to read from, or null (see `getBrowserStorage`).
 *
 * Returns:
 *   Valid preferences.
 */
export function loadPreferences(storage: Pick<Storage, "getItem"> | null): Preferences {
  try {
    const raw = storage?.getItem(PREFERENCES_STORAGE_KEY);
    return raw ? parsePreferences(JSON.parse(raw)) : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Saves the preferences. Failures (quota, disabled storage) are ignored: losing them must not
 * interrupt editing.
 *
 * Args:
 *   storage: Storage to write to, or null.
 *   preferences: Preferences to save.
 */
export function savePreferences(storage: Pick<Storage, "setItem"> | null, preferences: Preferences): void {
  try {
    storage?.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // 偏好設定寫入失敗不影響編輯，下次啟動回到預設值
  }
}
