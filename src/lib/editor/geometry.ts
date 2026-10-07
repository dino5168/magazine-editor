import type { Bounds, CanvasElement, ElementId, Margins, Point, Sheet, Size, TextElement } from "./types";

export const TEXT_LINE_HEIGHT = 1.2;
/** Smallest width / height (pt) an element can be resized to, on the canvas or in the property panel. */
export const MIN_ELEMENT_SIZE_PT = 4;

// 小於此 code point 視為窄字（拉丁字母），以下為 CJK 等全形字
const WIDE_CHAR_START = 0x2e80;
const NARROW_CHAR_WIDTH_EM = 0.55;

/**
 * Estimates the rendered height of a text element without measuring on a canvas.
 *
 * 只用於捲動範圍與「是否在畫面內」這類容許誤差的判斷，實際繪製由 Konva 量測。
 *
 * Args:
 *   element: Text element.
 *
 * Returns:
 *   Approximate height in pt.
 */
export function estimateTextHeight(element: TextElement): number {
  const wrapWidth = Math.max(element.width, 1);
  let lines = 0;
  for (const paragraph of element.text.split("\n")) {
    let widthEm = 0;
    for (const char of paragraph) {
      widthEm += (char.codePointAt(0) ?? 0) >= WIDE_CHAR_START ? 1 : NARROW_CHAR_WIDTH_EM;
    }
    lines += Math.max(1, Math.ceil((widthEm * element.fontSize) / wrapWidth));
  }
  return lines * element.fontSize * TEXT_LINE_HEIGHT;
}

function localBounds(element: CanvasElement): Bounds {
  switch (element.type) {
    case "text":
      return { minX: 0, minY: 0, maxX: element.width, maxY: estimateTextHeight(element) };
    case "shape":
    case "image":
      return { minX: 0, minY: 0, maxX: element.width, maxY: element.height };
    default: {
      const exhaustive: never = element;
      return exhaustive;
    }
  }
}

/**
 * Computes the axis-aligned bounding box of an element in page coordinates.
 *
 * Args:
 *   element: Any canvas element; rotation is applied around its origin.
 *
 * Returns:
 *   Bounding box in pt.
 */
export function getElementBounds(element: CanvasElement): Bounds {
  const box = localBounds(element);
  const radians = (element.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const corners: readonly Point[] = [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY },
    { x: box.minX, y: box.maxY },
  ];
  const xs = corners.map((c) => c.x * cos - c.y * sin + element.x);
  const ys = corners.map((c) => c.x * sin + c.y * cos + element.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/**
 * Returns the smallest bounds containing both inputs.
 *
 * Args:
 *   a: First bounds.
 *   b: Second bounds.
 *
 * Returns:
 *   Union bounds.
 */
export function unionBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * Grows bounds by a margin on every side.
 *
 * Args:
 *   bounds: Source bounds.
 *   margin: Margin to add on each side.
 *
 * Returns:
 *   Expanded bounds.
 */
export function expandBounds(bounds: Bounds, margin: number): Bounds {
  return {
    minX: bounds.minX - margin,
    minY: bounds.minY - margin,
    maxX: bounds.maxX + margin,
    maxY: bounds.maxY + margin,
  };
}

/**
 * Checks whether two bounds overlap (touching edges count as overlap).
 *
 * Args:
 *   a: First bounds.
 *   b: Second bounds.
 *
 * Returns:
 *   True when the bounds intersect.
 */
export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/**
 * Checks whether `inner` lies entirely inside `outer` (touching edges count as inside).
 *
 * Args:
 *   outer: Containing bounds.
 *   inner: Bounds to test.
 *
 * Returns:
 *   True when inner is fully contained.
 */
export function boundsContain(outer: Bounds, inner: Bounds): boolean {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY;
}

/**
 * Finds the elements a marquee selects: those whose (rotated) bounding box is fully inside the box.
 *
 * Args:
 *   elements: Elements of the page.
 *   box: Marquee in pt.
 *
 * Returns:
 *   Ids of the fully enclosed elements, in layer order.
 */
export function elementsInBox(elements: readonly CanvasElement[], box: Bounds): ElementId[] {
  // 只碰到一角不算（PowerPoint、draw.io 的規則）
  return elements.filter((element) => boundsContain(box, getElementBounds(element))).map((element) => element.id);
}

/**
 * Returns the center point of bounds.
 *
 * Args:
 *   bounds: Source bounds.
 *
 * Returns:
 *   Center point.
 */
export function boundsCenter(bounds: Bounds): Point {
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
}

/**
 * Returns the center of a page.
 *
 * Args:
 *   page: Page size in pt.
 *
 * Returns:
 *   Center point in pt.
 */
export function pageCenter(page: { readonly width: number; readonly height: number }): Point {
  return { x: page.width / 2, y: page.height / 2 };
}

/**
 * Computes the area that must stay reachable: the page plus every element, even off-page ones.
 *
 * Args:
 *   page: Page to measure.
 *
 * Returns:
 *   Union of the page rectangle and all element bounds, in pt.
 */
export function getContentBounds(page: Sheet): Bounds {
  const pageRect: Bounds = { minX: 0, minY: 0, maxX: page.width, maxY: page.height };
  return page.elements.reduce((acc, element) => unionBounds(acc, getElementBounds(element)), pageRect);
}

/**
 * Rounds a page coordinate to the nearest grid line (the grid starts at the page's top-left corner).
 *
 * Args:
 *   value: Coordinate in pt.
 *   spacing: Grid spacing in pt; a non-positive spacing leaves the value unchanged.
 *
 * Returns:
 *   Snapped coordinate in pt.
 */
export function snapToGrid(value: number, spacing: number): number {
  if (!(spacing > 0)) return value;
  // + 0 把 -0 變成 0，避免測試與 JSON 出現 -0
  return Math.round(value / spacing) * spacing + 0;
}

/**
 * Snaps both coordinates of a point to the grid.
 *
 * Args:
 *   point: Point in pt.
 *   spacing: Grid spacing in pt.
 *
 * Returns:
 *   Snapped point.
 */
export function snapPointToGrid(point: Point, spacing: number): Point {
  return { x: snapToGrid(point.x, spacing), y: snapToGrid(point.y, spacing) };
}

/** Smallest on-screen gap (px) between drawn grid lines; a denser grid only draws every Nth line. */
export const MIN_GRID_GAP_PX = 6;

/**
 * Returns the spacing of the grid lines actually drawn: the grid spacing, or a whole multiple of
 * it when zoomed out so far that lines would be closer than MIN_GRID_GAP_PX. Drawn lines stay on
 * the snapping grid.
 *
 * Args:
 *   spacing: Grid spacing in pt.
 *   zoom: Canvas zoom (screen px per pt).
 *
 * Returns:
 *   Spacing of the drawn lines in pt.
 */
export function drawnGridSpacing(spacing: number, zoom: number): number {
  if (!(spacing > 0 && zoom > 0)) return spacing;
  return spacing * Math.max(1, Math.ceil(MIN_GRID_GAP_PX / (spacing * zoom)));
}

/**
 * Returns the area inside the page margins, where the margin guide is drawn.
 *
 * Args:
 *   size: Page size in pt.
 *   margins: Margins in pt.
 *
 * Returns:
 *   Bounds inside the margins, or null when every margin is 0 (the guide would sit on the page edge).
 */
export function marginBounds(size: Size, margins: Margins): Bounds | null {
  const { top, right, bottom, left } = margins;
  if (top === 0 && right === 0 && bottom === 0 && left === 0) return null;
  return { minX: left, minY: top, maxX: size.width - right, maxY: size.height - bottom };
}

/** An alignment line at a fraction of the content area; `half` lines are drawn stronger than `quarter` lines. */
export interface ContentGuideLine {
  /** Position in pt (x for vertical lines, y for horizontal lines). */
  readonly position: number;
  readonly emphasis: "half" | "quarter";
}

export interface ContentGuides {
  /** The content area (inside the margins; the whole page when there are none). Lines span this area. */
  readonly area: Bounds;
  /** Vertical lines at 1/4, 1/2 and 3/4 of the content width. */
  readonly vertical: readonly ContentGuideLine[];
  /** Horizontal lines at 1/4, 1/2 and 3/4 of the content height. */
  readonly horizontal: readonly ContentGuideLine[];
}

const CONTENT_GUIDE_FRACTIONS = [
  { fraction: 0.25, emphasis: "quarter" },
  { fraction: 0.5, emphasis: "half" },
  { fraction: 0.75, emphasis: "quarter" },
] as const;

/**
 * Computes the emphasized grid lines at quarters and the half of the page content (the area inside
 * the margins), drawn as alignment aids while editing.
 *
 * Args:
 *   size: Page size in pt.
 *   margins: Margins in pt.
 *
 * Returns:
 *   The content area and its quarter / half lines.
 */
export function contentGuides(size: Size, margins: Margins): ContentGuides {
  const area = marginBounds(size, margins) ?? { minX: 0, minY: 0, maxX: size.width, maxY: size.height };
  const at = (min: number, max: number) =>
    CONTENT_GUIDE_FRACTIONS.map(({ fraction, emphasis }) => ({ position: min + (max - min) * fraction, emphasis }));
  return { area, vertical: at(area.minX, area.maxX), horizontal: at(area.minY, area.maxY) };
}
