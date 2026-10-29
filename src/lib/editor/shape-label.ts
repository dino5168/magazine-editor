import { DEFAULT_FONT_FAMILY, DEFAULT_TEXT_FILL } from "./element-factory";
import { shapePoints } from "./shape-geometry";
import { NO_TEXT_INDENT } from "./text-indent";
import { DEFAULT_TEXT_SPACING, PLAIN_TEXT_DECORATION } from "./text-style";
import type { Point, ShapeElement, ShapeLabel, TextElement } from "./types";

/**
 * Inset (pt) between the part of a shape text can go in and the frame its text is laid out in.
 * Rust `export/render.rs` uses the same value only when the export request has no frame for a shape.
 */
export const LABEL_PADDING_PT = 4;

/** Text style of a label created by double-clicking a shape that has none. */
const DEFAULT_LABEL: Omit<ShapeLabel, "text"> = {
  fontSize: 14,
  fontFamily: DEFAULT_FONT_FAMILY,
  fontStyle: "normal",
  ...PLAIN_TEXT_DECORATION,
  ...DEFAULT_TEXT_SPACING,
  ...NO_TEXT_INDENT,
  align: "center",
  verticalAlign: "middle",
  fill: DEFAULT_TEXT_FILL,
  fillSwatchId: null,
  styleId: null,
};

/** The frame (shape-local pt) the label is laid out in. */
export interface LabelFrame {
  readonly x: number;
  readonly y: number;
  /** Wrapping width of the label text. */
  readonly width: number;
  readonly height: number;
}

/**
 * Creates the label added when the user types into a shape without one.
 *
 * Args:
 *   text: Label text.
 *
 * Returns:
 *   Label with the default style (centred both ways).
 */
export function createLabel(text: string): ShapeLabel {
  return { ...DEFAULT_LABEL, text };
}

/** A rectangle as fractions of the shape's box (0–1 on both axes). */
interface UnitBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const WHOLE_BOX: UnitBox = { x: 0, y: 0, width: 1, height: 1 };
// 橢圓的內切矩形（和外框同比例、面積最大）：寬高各是外框的 1/√2
const ELLIPSE_BOX: UnitBox = { x: (1 - Math.SQRT1_2) / 2, y: (1 - Math.SQRT1_2) / 2, width: Math.SQRT1_2, height: Math.SQRT1_2 };
// 多邊形 / 星形的結果只取決於 geometry（拉伸到外框是軸向縮放，矩形仍是矩形），以 geometry 為 key 快取
const polygonBoxes = new Map<string, UnitBox>();

// 點是否在多邊形內（even-odd；星形不是凸的也適用）
function containsPoint(points: readonly number[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
    const [xi, yi, xj, yj] = [points[i], points[i + 1], points[j], points[j + 1]];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// 線段是否穿過矩形內部（Liang–Barsky 裁切；只碰到矩形的邊不算）
function crossesInterior(ax: number, ay: number, bx: number, by: number, box: UnitBox): boolean {
  const epsilon = 1e-9;
  const [left, top, right, bottom] = [box.x + epsilon, box.y + epsilon, box.x + box.width - epsilon, box.y + box.height - epsilon];
  if (left >= right || top >= bottom) return false;
  let [t0, t1] = [0, 1];
  const [dx, dy] = [bx - ax, by - ay];
  for (const [p, q] of [[-dx, ax - left], [dx, right - ax], [-dy, ay - top], [dy, bottom - ay]] as const) {
    if (p === 0) {
      if (q < 0) return false;
    } else if (p < 0) {
      t0 = Math.max(t0, q / p);
    } else {
      t1 = Math.min(t1, q / p);
    }
  }
  return t0 < t1;
}

// 矩形在多邊形內：中心在裡面，而且沒有任何一條邊穿過矩形內部
function fitsInside(points: readonly number[], box: UnitBox): boolean {
  if (!containsPoint(points, box.x + box.width / 2, box.y + box.height / 2)) return false;
  for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
    if (crossesInterior(points[j], points[j + 1], points[i], points[i + 1], box)) return false;
  }
  return true;
}

// 以 (0.5, centerY) 為中心、放得進多邊形的最大正方形（拉伸後就是和外框同比例的矩形）
function largestSquareAt(points: readonly number[], centerY: number): UnitBox {
  const square = (side: number): UnitBox => ({ x: 0.5 - side / 2, y: centerY - side / 2, width: side, height: side });
  if (!containsPoint(points, 0.5, centerY)) return square(0);
  let [low, high] = [0, 1];
  for (let step = 0; step < 40; step++) {
    const side = (low + high) / 2;
    if (fitsInside(points, square(side))) low = side;
    else high = side;
  }
  return square(low);
}

// 多邊形 / 星形的頂點左右對稱（第一個頂點朝上），所以中心的 x 固定在 0.5，只找中心的高度
function polygonBox(points: readonly number[]): UnitBox {
  const samples = 100;
  let best = largestSquareAt(points, 0.5);
  for (let n = 1; n < samples; n++) {
    const candidate = largestSquareAt(points, n / samples);
    if (candidate.width > best.width) best = candidate;
  }
  // 在最好的取樣點附近再細找一次
  const around = best.y + best.width / 2;
  for (let n = -10; n <= 10; n++) {
    const candidate = largestSquareAt(points, around + n / (samples * 10));
    if (candidate.width > best.width) best = candidate;
  }
  return best;
}

/**
 * The part of the shape's box text can go in, as fractions of the box: the largest rectangle with
 * the box's proportions inside an ellipse, polygon or star; the whole box for rectangles and
 * shape-library shapes.
 */
function labelUnitBox(shape: ShapeElement): UnitBox {
  const { geometry } = shape;
  switch (geometry.kind) {
    case "rect":
    case "preset":
      return WHOLE_BOX;
    case "ellipse":
      return ELLIPSE_BOX;
    case "polygon":
    case "star": {
      const key = JSON.stringify(geometry);
      const cached = polygonBoxes.get(key);
      if (cached) return cached;
      const points = shapePoints(geometry, 1, 1);
      const box = points ? polygonBox(points) : WHOLE_BOX;
      polygonBoxes.set(key, box);
      return box;
    }
    default: {
      const exhaustive: never = geometry;
      return exhaustive;
    }
  }
}

/**
 * Returns the frame the label is laid out in: the part of the shape text can go in (the largest
 * rectangle with the box's proportions inside an ellipse, polygon or star; the whole box otherwise)
 * inset by LABEL_PADDING_PT. The export sends this frame to Rust (`ExportRequest.labelFrames`).
 *
 * Args:
 *   shape: Shape element.
 *
 * Returns:
 *   Frame in shape-local coordinates (origin at the box's top-left corner).
 */
export function labelFrame(shape: ShapeElement): LabelFrame {
  const unit = labelUnitBox(shape);
  const width = unit.width * shape.width;
  const height = unit.height * shape.height;
  return {
    x: unit.x * shape.width + LABEL_PADDING_PT,
    y: unit.y * shape.height + LABEL_PADDING_PT,
    width: Math.max(1, width - 2 * LABEL_PADDING_PT),
    height: Math.max(0, height - 2 * LABEL_PADDING_PT),
  };
}

/**
 * Height of laid-out text: lines × font size × line height (Konva's `Text.height()` without padding).
 *
 * Args:
 *   lineCount: Number of wrapped lines.
 *   fontSize: Font size in pt.
 *   lineHeight: Line height (× font size).
 *
 * Returns:
 *   Height in pt.
 */
export function textBlockHeight(lineCount: number, fontSize: number, lineHeight: number): number {
  return lineCount * fontSize * lineHeight;
}

/**
 * Top of the label text relative to the frame. Text taller than the frame overflows on both sides
 * (middle) or one side (top / bottom); shapes never clip their text.
 *
 * Args:
 *   frame: Label frame.
 *   verticalAlign: Label's vertical alignment.
 *   textHeight: Height of the laid-out text.
 *
 * Returns:
 *   Offset in pt from the frame's top (negative when centred text overflows).
 */
export function labelTextOffset(frame: LabelFrame, verticalAlign: ShapeLabel["verticalAlign"], textHeight: number): number {
  switch (verticalAlign) {
    case "top":
      return 0;
    case "middle":
      return (frame.height - textHeight) / 2;
    case "bottom":
      return frame.height - textHeight;
    default: {
      const exhaustive: never = verticalAlign;
      return exhaustive;
    }
  }
}

/**
 * Converts a shape-local point to page coordinates (rotation is clockwise around the shape's origin).
 *
 * Args:
 *   shape: Shape element.
 *   local: Point relative to the shape's box.
 *
 * Returns:
 *   Point on the page.
 */
export function shapeToPage(shape: ShapeElement, local: Point): Point {
  const radians = (shape.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: shape.x + local.x * cos - local.y * sin, y: shape.y + local.x * sin + local.y * cos };
}

/** Key of a label's line breaks in `ExportRequest.textLayouts` (Rust looks it up the same way). */
export function labelLayoutKey(shapeId: string): string {
  return `${shapeId}#label`;
}

/**
 * Describes a label as a text element placed at a shape-local point: what the text measurement,
 * the export and the in-place editor work with.
 *
 * Args:
 *   shape: Shape element.
 *   label: The label (may be a new, empty one).
 *   local: Shape-local position of the text's top-left corner.
 *
 * Returns:
 *   Text element in page coordinates, rotated with the shape.
 */
export function labelAsText(shape: ShapeElement, label: ShapeLabel, local: Point): TextElement {
  const { verticalAlign: _verticalAlign, ...style } = label;
  return {
    ...style,
    id: labelLayoutKey(shape.id),
    type: "text",
    ...shapeToPage(shape, local),
    rotation: shape.rotation,
    width: labelFrame(shape).width,
  };
}
