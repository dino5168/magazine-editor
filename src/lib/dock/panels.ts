import type { DockSide } from "./dock-layout";

interface PanelCategoryDefinition {
  readonly id: string;
  readonly label: string;
}

// 面板的類別：陣列順序 = 「工具面板」選單的順序（類別之間是分隔線），也是從選單打開面板時新群組的上下順序
export const PANEL_CATEGORIES = [
  { id: "content", label: "加入內容" },
  { id: "inspect", label: "屬性與樣式" },
  { id: "structure", label: "頁面與圖層" },
] as const satisfies readonly PanelCategoryDefinition[];

export type PanelCategoryId = (typeof PANEL_CATEGORIES)[number]["id"];

interface PanelDefinition {
  readonly id: string;
  readonly label: string;
  readonly category: PanelCategoryId;
  /** Side the panel docks to when it is opened from the menu. */
  readonly defaultSide: DockSide;
  /**
   * "self": the panel fills the dock panel's body and scrolls its own parts (the Pages panel shares
   * its height between two sections). Omitted: the dock panel wraps the content in one scroll area.
   */
  readonly scroll?: "self";
}

// 工具面板的單一資料來源；PanelId 由此推導，icon 與面板內容在 UI 端以 satisfies Record<PanelId, …> 檢查完整性。
// 依類別排列（測試守著）：定義順序就是選單順序
export const PANEL_DEFINITIONS = [
  { id: "templates", label: "範本", category: "content", defaultSide: "left" },
  { id: "text", label: "文字", category: "content", defaultSide: "left" },
  { id: "elements", label: "元素", category: "content", defaultSide: "left" },
  // 「素材」面板（原本的「上傳」）；id 不改，使用者記住的停靠版面才不會失效
  { id: "upload", label: "素材", category: "content", defaultSide: "left" },
  { id: "background", label: "背景", category: "content", defaultSide: "left" },
  { id: "draw", label: "繪圖", category: "content", defaultSide: "left" },
  { id: "properties", label: "屬性", category: "inspect", defaultSide: "right" },
  { id: "styles", label: "樣式", category: "inspect", defaultSide: "right" },
  { id: "pages", label: "頁面", category: "structure", defaultSide: "left", scroll: "self" },
  { id: "layers", label: "圖層", category: "structure", defaultSide: "right" },
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
 * Returns a panel's category.
 *
 * Args:
 *   id: Panel id.
 *
 * Returns:
 *   Category id.
 */
export function getPanelCategory(id: PanelId): PanelCategoryId {
  return getPanel(id).category;
}

/**
 * Lists the panels of a category in definition (= menu) order.
 *
 * Args:
 *   category: Category id.
 *
 * Returns:
 *   Panel ids.
 */
export function panelsIn(category: PanelCategoryId): readonly PanelId[] {
  return PANEL_IDS.filter((id) => getPanelCategory(id) === category);
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
