/**
 * 線條工具的種類（底部工具列「線條」與它的選單）：直線、箭頭、雙向箭頭。折線、曲線在之後的步驟加。
 * 和圖形的 `ShapeChoice` 一樣是 UI 狀態（`EditorState.lineKind`），不存進文件。
 */
import { DEFAULT_LINE_STROKE, PLAIN_LINE_END } from "./element-factory";
import { BUILT_IN_SWATCH_IDS } from "./swatches";
import type { LineArrowhead, LineElement, Stroke, Swatch } from "./types";

export const LINE_KINDS = [
  { id: "straight", label: "直線" },
  { id: "arrow", label: "箭頭" },
  { id: "doubleArrow", label: "雙向箭頭" },
] as const;

export type LineKind = (typeof LINE_KINDS)[number]["id"];

export const DEFAULT_LINE_KIND: LineKind = "straight";

/** Arrowhead sizes the property panel offers (`LineEnd.scale`); other scales (from MCP) show as 自訂. */
export const ARROWHEAD_SCALES = [
  { label: "小", scale: 0.7 },
  { label: "中", scale: 1 },
  { label: "大", scale: 1.5 },
] as const;

/** Names of the arrowheads, in menu order (`LINE_ARROWHEADS`). */
export const ARROWHEAD_LABELS = { none: "無", open: "開放", triangle: "實心三角" } as const satisfies Record<LineArrowhead, string>;

/** Length (pt) of the line a click (instead of a drag) creates; horizontal, centred on the click. */
export const DEFAULT_LINE_LENGTH_PT = 150;

/**
 * Returns the label of a line kind.
 *
 * Args:
 *   kind: Line kind.
 *
 * Returns:
 *   Label text, e.g. 「箭頭」.
 */
export function lineKindLabel(kind: LineKind): string {
  // LINE_KINDS 涵蓋所有 LineKind，一定找得到
  return LINE_KINDS.find((entry) => entry.id === kind)!.label;
}

/**
 * The ends a line kind starts with: an arrow points at the end of the drag (filled triangle).
 *
 * Args:
 *   kind: Line kind.
 *
 * Returns:
 *   `start` and `end` of the new line.
 */
export function lineKindEnds(kind: LineKind): Pick<LineElement, "start" | "end"> {
  const head = { arrowhead: "triangle", scale: 1 } as const;
  switch (kind) {
    case "straight":
      return { start: PLAIN_LINE_END, end: PLAIN_LINE_END };
    case "arrow":
      return { start: PLAIN_LINE_END, end: head };
    case "doubleArrow":
      return { start: head, end: head };
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

/**
 * Stroke of a line drawn with the line tool: 1 pt solid `#171717`, linked to the document's
 * built-in 「文字」 swatch when it has one of that color (as text tool texts follow 「內文」).
 *
 * Args:
 *   swatches: The document's swatches.
 *
 * Returns:
 *   The stroke.
 */
export function toolLineStroke(swatches: readonly Swatch[]): Stroke {
  const text = swatches.find((swatch) => swatch.id === BUILT_IN_SWATCH_IDS.text);
  return text && text.color === DEFAULT_LINE_STROKE.color ? { ...DEFAULT_LINE_STROKE, swatchId: text.id } : DEFAULT_LINE_STROKE;
}
