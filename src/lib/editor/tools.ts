import type { KeyboardEventLike } from "@/lib/menu/shortcut";
import type { ShapeKind } from "./element-factory";

interface ToolDefinition {
  readonly id: string;
  readonly label: string;
}

// 畫布工具的單一資料來源；ToolId 由此推導，icon 在 UI 端以 satisfies Record<ToolId, …> 檢查完整性。
// 圖片不是工具模式：按下直接開選檔對話框，所以不在這裡
export const TOOL_DEFINITIONS = [
  { id: "select", label: "選取" },
  { id: "hand", label: "手形" },
  { id: "text", label: "文字" },
  { id: "shape", label: "圖形" },
] as const satisfies readonly ToolDefinition[];

export type ToolId = (typeof TOOL_DEFINITIONS)[number]["id"];

export const DEFAULT_TOOL: ToolId = "select";
export const DEFAULT_SHAPE_KIND: ShapeKind = "rect";

/** A tool shortcut: one key without modifiers, matched by physical key (works with the Zhuyin IME on). */
export interface ToolShortcut {
  readonly code: string;
  readonly keyLabel: string;
  readonly tool: ToolId;
  /** For the shape tool: which shape the key selects. */
  readonly shape?: ShapeKind;
}

export const TOOL_SHORTCUTS: readonly ToolShortcut[] = [
  { code: "KeyV", keyLabel: "V", tool: "select" },
  { code: "KeyH", keyLabel: "H", tool: "hand" },
  { code: "KeyT", keyLabel: "T", tool: "text" },
  { code: "KeyR", keyLabel: "R", tool: "shape", shape: "rect" },
  { code: "KeyO", keyLabel: "O", tool: "shape", shape: "ellipse" },
];

/**
 * Returns the display label of a tool.
 *
 * Args:
 *   id: Tool id.
 *
 * Returns:
 *   Label text.
 */
export function getToolLabel(id: ToolId): string {
  // TOOL_DEFINITIONS 涵蓋所有 ToolId，一定找得到
  return TOOL_DEFINITIONS.find((tool) => tool.id === id)!.label;
}

/**
 * Finds the tool shortcut a key press triggers. Keys with Ctrl / Alt / Meta / Shift are never
 * tool shortcuts, so they cannot collide with menu shortcuts (all of which use Ctrl).
 *
 * Args:
 *   event: Keyboard event.
 *
 * Returns:
 *   Matching shortcut, or null.
 */
export function findToolShortcut(event: KeyboardEventLike): ToolShortcut | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null;
  return TOOL_SHORTCUTS.find((shortcut) => shortcut.code === event.code) ?? null;
}

/**
 * Returns the shortcut label shown in a tooltip, e.g. "V".
 *
 * Args:
 *   tool: Tool id.
 *   shape: For the shape tool, the shape whose key to show.
 *
 * Returns:
 *   Key label, or null when the tool (or shape) has no shortcut.
 */
export function getToolKeyLabel(tool: ToolId, shape?: ShapeKind): string | null {
  const match = TOOL_SHORTCUTS.find((s) => s.tool === tool && (tool !== "shape" || s.shape === shape));
  return match?.keyLabel ?? null;
}
