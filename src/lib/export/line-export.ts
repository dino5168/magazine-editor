/**
 * 匯出前把線條換成路徑圖形（同頁碼：只在匯出的副本），所以 Rust 的 render、Typst 模板、EPUB 標記都不用
 * 認識線條。路徑和畫布是同一份 `linePaths`。計畫：`docs/06-Plans-繪圖/03-自由繪圖-實作.md` §1.6、步驟 7。
 */
import { linePaths } from "@/lib/editor/line-path";
import { pathBounds, type PathCommand } from "@/lib/editor/shape-path";
import type { LineElement, ShapeElement, Stroke } from "@/lib/editor/types";
import type { ExportShapePath } from "./export-request";

/** Shape-library ids of the exported line pieces; never in `SHAPE_LIBRARY`, so never shown as a shape. */
export const LINE_EXPORT_PRESET = "x-line";
export const LINE_HEADS_EXPORT_PRESET = "x-line-heads";
const TRANSPARENT = "#00000000";

/** Id of the filled arrowheads of an exported line (the line itself keeps the line's id). */
export function lineHeadsId(lineId: string): string {
  return `${lineId}#heads`;
}

/** One exported piece: a path shape and its outline for `ExportRequest.shapePaths`. */
export interface ExportedLinePiece {
  readonly shape: ShapeElement;
  readonly path: ExportShapePath;
}

// 外框只給 SVG 的大小用（overflow: visible，路徑可以超出）；寬高一定 > 0，Rust 才收
function pieceShape(line: LineElement, id: string, preset: string, commands: readonly PathCommand[], fill: string, stroke: Stroke | null): ShapeElement {
  const bounds = pathBounds(commands);
  return {
    id,
    type: "shape",
    x: line.x,
    y: line.y,
    rotation: line.rotation,
    width: Math.max(bounds ? bounds.maxX : 0, 1),
    height: Math.max(bounds ? bounds.maxY : 0, 1),
    geometry: { kind: "preset", preset, params: {} },
    fill,
    fillSwatchId: null,
    stroke,
    label: null,
  };
}

/**
 * The path shapes that draw a line in the export, bottom to top: the line (transparent fill, the
 * line's stroke; open arrowheads as its solid details) and the filled arrowheads (the line's color,
 * no stroke). A piece with nothing to draw is left out.
 *
 * Args:
 *   line: Line element (on an exported page; master and spread copies included).
 *
 * Returns:
 *   0–2 pieces.
 */
export function exportedLinePieces(line: LineElement): ExportedLinePiece[] {
  const paths = linePaths(line);
  // 色票連結不帶過去：匯出只讀實際的顏色
  const stroke: Stroke = { ...line.stroke, swatchId: null };
  const pieces: ExportedLinePiece[] = [];
  // 開放箭頭是細節線（同色同寬的實線）；線本身被兩端的箭頭蓋住時，外框改用箭頭（Rust 不收空外框）
  const outline = paths.stroke.length > 0 ? paths.stroke : paths.outlines;
  const details = paths.stroke.length > 0 ? paths.outlines : [];
  if (outline.length > 0) {
    const lineStroke = paths.stroke.length > 0 ? stroke : { ...stroke, dash: "solid" as const };
    pieces.push({
      shape: pieceShape(line, line.id, LINE_EXPORT_PRESET, [...outline, ...details], TRANSPARENT, lineStroke),
      path: { outline, details, detailStroke: details.length > 0 ? { ...stroke, dash: "solid" } : null },
    });
  }
  if (paths.fills.length > 0) {
    pieces.push({
      shape: pieceShape(line, lineHeadsId(line.id), LINE_HEADS_EXPORT_PRESET, paths.fills, line.stroke.color, null),
      path: { outline: paths.fills, details: [], detailStroke: null },
    });
  }
  return pieces;
}
