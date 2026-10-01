import type { Bounds, CanvasElement, Page, Point, TextElement } from "./types";

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
export function getContentBounds(page: Page): Bounds {
  const pageRect: Bounds = { minX: 0, minY: 0, maxX: page.width, maxY: page.height };
  return page.elements.reduce((acc, element) => unionBounds(acc, getElementBounds(element)), pageRect);
}
