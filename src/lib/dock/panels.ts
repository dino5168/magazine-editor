import type { DockSide } from "./dock-layout";

interface PanelDefinition {
  readonly id: string;
  readonly label: string;
  /** Side the panel docks to when it is opened from the menu. */
  readonly defaultSide: DockSide;
  /**
   * "self": the panel fills the dock panel's body and scrolls its own parts (the Pages panel shares
   * its height between two sections). Omitted: the dock panel wraps the content in one scroll area.
   */
  readonly scroll?: "self";
}

// 工具面板的單一資料來源；PanelId 由此推導，icon 與面板內容在 UI 端以 satisfies Record<PanelId, …> 檢查完整性
export const PANEL_DEFINITIONS = [
  { id: "templates", label: "範本", defaultSide: "left" },
  { id: "text", label: "文字", defaultSide: "left" },
  { id: "photos", label: "相片", defaultSide: "left" },
  { id: "elements", label: "元素", defaultSide: "left" },
  { id: "draw", label: "繪圖", defaultSide: "left" },
  { id: "upload", label: "上傳", defaultSide: "left" },
  { id: "background", label: "背景", defaultSide: "left" },
  { id: "pages", label: "頁面", defaultSide: "left", scroll: "self" },
  { id: "properties", label: "屬性", defaultSide: "right" },
  { id: "layers", label: "圖層", defaultSide: "right" },
] as const satisfies readonly PanelDefinition[];

export type PanelId = (typeof PANEL_DEFINITIONS)[number]["id"];

export const PANEL_IDS: readonly PanelId[] = PANEL_DEFINITIONS.map((panel) => panel.id);

/**
 * Checks whether a value is a known panel id.
 *
 * Args:
 *   value: Any value (e.g. read from storage).
 *
 * Returns:
 *   True when the value is a PanelId.
 */
export function isPanelId(value: unknown): value is PanelId {
  return typeof value === "string" && (PANEL_IDS as readonly string[]).includes(value);
}

function getPanel(id: PanelId): PanelDefinition {
  // PANEL_IDS 由 PANEL_DEFINITIONS 推導，一定找得到
  return PANEL_DEFINITIONS.find((panel) => panel.id === id)!;
}

/**
 * Returns the display label of a panel.
 *
 * Args:
 *   id: Panel id.
 *
 * Returns:
 *   Label text.
 */
export function getPanelLabel(id: PanelId): string {
  return getPanel(id).label;
}

/**
 * Whether a panel scrolls its own parts instead of being wrapped in one scroll area.
 *
 * Args:
 *   id: Panel id.
 *
 * Returns:
 *   True for panels declared with `scroll: "self"`.
 */
export function panelScrollsItself(id: PanelId): boolean {
  return getPanel(id).scroll === "self";
}

/**
 * Returns the side a panel docks to by default.
 *
 * Args:
 *   id: Panel id.
 *
 * Returns:
 *   Default dock side.
 */
export function getPanelDefaultSide(id: PanelId): DockSide {
  return getPanel(id).defaultSide;
}
