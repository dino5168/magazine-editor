import type { Shortcut } from "@/lib/menu/shortcut";
import type { Preferences } from "./preferences";

interface ViewToggleDefinition {
  readonly id: string;
  /** Menu item label (視圖 menu) and tooltip of the top bar button. */
  readonly label: string;
  /** Standalone name used in messages. */
  readonly title: string;
  readonly shortcut?: Shortcut;
  /** Whether the toggle is on. */
  readonly read: (preferences: Preferences) => boolean;
  /** Returns preferences with only this toggle flipped. */
  readonly toggle: (preferences: Preferences) => Preferences;
}

const setGrid = (preferences: Preferences, patch: Partial<Preferences["grid"]>): Preferences => ({
  ...preferences,
  grid: { ...preferences.grid, ...patch },
});

// 視圖的開關（畫面上的輔助顯示，存在這台電腦）的單一資料來源：「視圖」選單與 TopBar 的按鈕都由這裡讀寫偏好
export const VIEW_TOGGLES = [
  {
    id: "rulers",
    label: "尺規",
    title: "顯示尺規",
    read: (p) => p.showRulers,
    toggle: (p) => ({ ...p, showRulers: !p.showRulers }),
  },
  {
    id: "grid",
    label: "格線",
    title: "顯示格線",
    // Photoshop / Illustrator 慣例：Ctrl+' 格線、Ctrl+Shift+' 吸附、Ctrl+; 參考線
    shortcut: { ctrl: true, code: "Quote", keyLabel: "'" },
    read: (p) => p.grid.visible,
    toggle: (p) => setGrid(p, { visible: !p.grid.visible }),
  },
  {
    // 內容區（邊界以內）1/4、1/2、3/4 的線；原本跟著格線，現在獨立
    id: "contentGuides",
    label: "內容區對齊線",
    title: "顯示內容區對齊線",
    read: (p) => p.showContentGuides,
    toggle: (p) => ({ ...p, showContentGuides: !p.showContentGuides }),
  },
  {
    id: "margins",
    label: "邊界參考線",
    title: "顯示邊界參考線",
    shortcut: { ctrl: true, code: "Semicolon", keyLabel: ";" },
    read: (p) => p.showMargins,
    toggle: (p) => ({ ...p, showMargins: !p.showMargins }),
  },
  {
    // 格線隱藏時吸附照樣有效，所以是獨立的開關
    id: "snap",
    label: "吸附格線",
    title: "吸附格線",
    shortcut: { ctrl: true, shift: true, code: "Quote", keyLabel: "'" },
    read: (p) => p.grid.snap,
    toggle: (p) => setGrid(p, { snap: !p.grid.snap }),
  },
] as const satisfies readonly ViewToggleDefinition[];

export type ViewToggle = (typeof VIEW_TOGGLES)[number];
export type ViewToggleId = ViewToggle["id"];

/**
 * Finds a view toggle by id.
 *
 * Args:
 *   id: Toggle id.
 *
 * Returns:
 *   The toggle definition.
 */
export function getViewToggle(id: ViewToggleId): ViewToggle {
  return VIEW_TOGGLES.find((toggle) => toggle.id === id)!;
}
