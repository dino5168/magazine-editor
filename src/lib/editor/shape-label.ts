import { DEFAULT_FONT_FAMILY, DEFAULT_TEXT_FILL } from "./element-factory";
import { TEXT_LINE_HEIGHT } from "./geometry";
import type { Point, ShapeElement, ShapeLabel, TextElement } from "./types";

/**
 * Inset (pt) between a shape's box and the frame its text is laid out in.
 * Same value as `LABEL_PADDING_PT` in Rust `export/render.rs`; change both together.
 */
export const LABEL_PADDING_PT = 4;

/** Text style of a label created by double-clicking a shape that has none. */
const DEFAULT_LABEL: Omit<ShapeLabel, "text"> = {
  fontSize: 14,
  fontFamily: DEFAULT_FONT_FAMILY,
  fontStyle: "normal",
  align: "center",
  verticalAlign: "middle",
  fill: DEFAULT_TEXT_FILL,
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

/**
 * Returns the frame the label is laid out in: the shape's box inset by LABEL_PADDING_PT.
 *
 * Args:
 *   shape: Shape element.
 *
 * Returns:
 *   Frame in shape-local coordinates (origin at the box's top-left corner).
 */
export function labelFrame(shape: ShapeElement): LabelFrame {
  return {
    x: LABEL_PADDING_PT,
    y: LABEL_PADDING_PT,
    width: Math.max(1, shape.width - 2 * LABEL_PADDING_PT),
    height: Math.max(0, shape.height - 2 * LABEL_PADDING_PT),
  };
}

/**
 * Height of laid-out text: lines × font size × line height (Konva's `Text.height()` without padding).
 *
 * Args:
 *   lineCount: Number of wrapped lines.
 *   fontSize: Font size in pt.
 *
 * Returns:
 *   Height in pt.
 */
export function textBlockHeight(lineCount: number, fontSize: number): number {
  return lineCount * fontSize * TEXT_LINE_HEIGHT;
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
