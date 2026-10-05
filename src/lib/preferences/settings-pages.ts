import type { Shortcut } from "@/lib/menu/shortcut";

/** Where a settings page is stored: in the document (saved, undoable) or on this computer. */
export type SettingsGroupId = "document" | "app";

interface SettingsGroupDefinition {
  readonly id: SettingsGroupId;
  /** Submenu label under 設定. */
  readonly label: string;
}

interface SettingsPageDefinition {
  readonly id: string;
  /** Menu item label (opens a dialog, so it ends with "..."). */
  readonly label: string;
  readonly group: SettingsGroupId;
  readonly shortcut?: Shortcut;
}

// 「設定」選單的子選單，依順序顯示
export const SETTINGS_GROUPS = [
  { id: "document", label: "文件" },
  { id: "app", label: "偏好設定" },
] as const satisfies readonly SettingsGroupDefinition[];

// 設定頁的單一資料來源：選單指令、子選單與對話框都由這裡推導（對話框在 UI 端以 satisfies Record<SettingsPageId, …> 檢查完整性）。
// 新增設定頁 = 加一筆 + 寫一個對話框元件
export const SETTINGS_PAGES = [
  { id: "pageSetup", label: "頁面設定...", group: "document" },
  { id: "pageNumbers", label: "頁碼管理...", group: "document" },
  { id: "grid", label: "格線與參考線...", group: "app", shortcut: { ctrl: true, code: "Comma", keyLabel: "," } },
] as const satisfies readonly SettingsPageDefinition[];

export type SettingsPage = (typeof SETTINGS_PAGES)[number];
export type SettingsPageId = SettingsPage["id"];

/**
 * Lists the settings pages of one group, in menu order.
 *
 * Args:
 *   group: Group id.
 *
 * Returns:
 *   The group's pages.
 */
export function settingsPagesIn(group: SettingsGroupId): readonly SettingsPage[] {
  return SETTINGS_PAGES.filter((page) => page.group === group);
}
