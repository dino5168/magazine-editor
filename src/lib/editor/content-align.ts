/**
 * 對齊內容區（屬性面板「調整」分頁）：把物件填滿內容區的寬 / 高，或對齊內容區的邊 / 中線。
 * 都是一次性的動作（產生一個 `element/update` 的 patch），不存進文件；改邊界後物件不會跟著變。
 * 計畫：`docs/01-Plans-2026-10/14-物件屬性增加填滿寬度、高度-實作.md`。
 */
import { contentGuides, MIN_ELEMENT_SIZE_PT, rotatedBoxBounds } from "./geometry";
import { linePagePoints, linePointBounds, withLinePoints } from "./line-geometry";
import { lineLocalBounds } from "./line-path";
import { resizePatch } from "./properties";
import type { Bounds, CanvasElement, ElementPatch, LineElement, Margins, Size } from "./types";

/** Which side a fill button stretches. */
export type FillAxis = "width" | "height";

/** Edge or centre line of the content area an align button moves the element to. */
export type ContentEdge = "left" | "centerX" | "right" | "top" | "centerY" | "bottom";

// 差距小於這個值視為已經對齊（浮點誤差不該產生一筆空的復原紀錄）
const EPSILON_PT = 1e-6;

/**
 * The content area of a page or master: inside the margins, the whole page when every margin is 0
 * (the same area the content guides span).
 *
 * Args:
 *   sheet: Size of the page or master the element is on.
 *   margins: The document's margins.
 *
 * Returns:
 *   Content area in page coordinates.
 */
export function contentArea(sheet: Size, margins: Margins): Bounds {
  return contentGuides(sheet, margins).area;
}

/**
 * Why a fill button cannot be used, for its tooltip.
 *
 * Args:
 *   element: Selected element.
 *   area: Content area.
 *   axis: Side to fill.
 *
 * Returns:
 *   A message, or null when filling is possible.
 */
export function fillContentDisabledReason(element: CanvasElement, area: Bounds, axis: FillAxis): string | null {
  if (axis === "height" && element.type === "text") return "文字的高度由內容決定";
  if (element.type === "line") {
    const reason = lineFillDisabledReason(element, axis);
    if (reason !== null) return reason;
  }
  const span = axis === "width" ? area.maxX - area.minX : area.maxY - area.minY;
  if (span < MIN_ELEMENT_SIZE_PT) return "內容區太小（邊界合計超過頁面）";
  return null;
}

// 小於這個差距（pt）當成同一條水平 / 垂直線（浮點誤差）
const STRAIGHT_TOLERANCE_PT = 1e-6;

// 線條只有「水平線填滿寬度」（分隔線）與「垂直線填滿高度」：斜的線拉伸會改角度，不做
function lineFillDisabledReason(line: LineElement, axis: FillAxis): string | null {
  const bounds = linePointBounds(line.points);
  const [width, height] = [bounds.maxX - bounds.minX, bounds.maxY - bounds.minY];
  if (axis === "width") {
    return line.rotation % 180 === 0 && height < STRAIGHT_TOLERANCE_PT && width > STRAIGHT_TOLERANCE_PT ? null : "只有水平線可以填滿寬度";
  }
  return line.rotation % 180 === 0 && width < STRAIGHT_TOLERANCE_PT && height > STRAIGHT_TOLERANCE_PT ? null : "只有垂直線可以填滿高度";
}

// 依比例拉長每個點（折線的轉角也照比例），旋轉 180° 的線先轉回 0°（樣子一樣：點在同一條水平 / 垂直線上）
function fillLinePatch(line: LineElement, area: Bounds, axis: FillAxis): ElementPatch {
  const pagePoints = linePagePoints(line);
  const key = axis === "width" ? "x" : "y";
  const values = pagePoints.map((point) => point[key]);
  const [min, max] = [Math.min(...values), Math.max(...values)];
  const [from, to] = axis === "width" ? [area.minX, area.maxX] : [area.minY, area.maxY];
  const stretched = pagePoints.map((point) => ({ ...point, [key]: from + ((point[key] - min) / (max - min)) * (to - from) }));
  const patch = withLinePoints({ ...line, rotation: 0 }, stretched);
  return line.rotation === 0 ? patch : { ...patch, rotation: 0 };
}

/**
 * Patch that stretches the element across the content area's width or height. A rotated element is
 * turned back to 0° first (in the same patch); with `keepRatio` the other side follows
 * proportionally, as when typing the size into the property panel, and its position stays.
 * Lines: a horizontal line fills the width (a rule across the content area), a vertical one the
 * height; their points stretch proportionally.
 *
 * Args:
 *   element: Selected element.
 *   area: Content area.
 *   axis: Side to fill.
 *   keepRatio: The property panel's 「限制寬高比」 option.
 *
 * Returns:
 *   The patch, or null when the fill is not possible (`fillContentDisabledReason`).
 */
export function fillContentPatch(element: CanvasElement, area: Bounds, axis: FillAxis, keepRatio: boolean): ElementPatch | null {
  if (fillContentDisabledReason(element, area, axis) !== null) return null;
  if (element.type === "line") return fillLinePatch(element, area, axis);
  const size =
    axis === "width"
      ? resizePatch(element, { width: area.maxX - area.minX }, keepRatio)
      : resizePatch(element, { height: area.maxY - area.minY }, keepRatio);
  const position = axis === "width" ? { x: area.minX } : { y: area.minY };
  return element.rotation === 0 ? { ...size, ...position } : { ...size, ...position, rotation: 0 };
}

/**
 * Patch that moves the element so its outline (after rotation) touches an edge of the content area
 * or is centred on it. The size and rotation stay.
 *
 * Args:
 *   element: Selected element.
 *   area: Content area.
 *   edge: Edge or centre line to align to.
 *   height: The element's actual height: for text the measured block height (`measureTextLayout`
 *     lines × font size × line height); for other elements their `height`.
 *
 * Returns:
 *   `{ x }` or `{ y }`, or null when the element is already there.
 */
export function alignContentPatch(element: CanvasElement, area: Bounds, edge: ContentEdge, height: number): ElementPatch | null {
  const local = element.type === "line" ? lineLocalBounds(element) : { minX: 0, minY: 0, maxX: element.width, maxY: height };
  const bounds = rotatedBoxBounds(element, local, element.rotation);
  const centre = (min: number, max: number) => (min + max) / 2;
  const delta = {
    left: area.minX - bounds.minX,
    centerX: centre(area.minX, area.maxX) - centre(bounds.minX, bounds.maxX),
    right: area.maxX - bounds.maxX,
    top: area.minY - bounds.minY,
    centerY: centre(area.minY, area.maxY) - centre(bounds.minY, bounds.maxY),
    bottom: area.maxY - bounds.maxY,
  }[edge];
  if (Math.abs(delta) < EPSILON_PT) return null;
  const horizontal = edge === "left" || edge === "centerX" || edge === "right";
  return horizontal ? { x: element.x + delta } : { y: element.y + delta };
}
