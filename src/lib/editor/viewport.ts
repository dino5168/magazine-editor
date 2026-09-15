import type { Bounds, Point, Size } from "./types";

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;
export const ZOOM_STEP = 1.25;

/**
 * Maps content bounds onto a scrollable surface.
 *
 * Content pixel = pt × zoom + offset. When content is smaller than the viewport it is centered.
 */
export interface ViewportLayout {
  readonly contentWidth: number;
  readonly contentHeight: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/**
 * Clamps a zoom factor to the supported range.
 *
 * Args:
 *   zoom: Requested zoom factor (1 = 100%).
 *
 * Returns:
 *   Zoom within [ZOOM_MIN, ZOOM_MAX].
 */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/**
 * Computes scroll surface size and the pt→pixel offset.
 *
 * Args:
 *   bounds: Content bounds in pt (already including any margin).
 *   zoom: Zoom factor.
 *   viewport: Visible area size in pixels.
 *
 * Returns:
 *   Layout describing the scrollable content.
 */
export function computeLayout(bounds: Bounds, zoom: number, viewport: Size): ViewportLayout {
  const width = (bounds.maxX - bounds.minX) * zoom;
  const height = (bounds.maxY - bounds.minY) * zoom;
  const padX = Math.max(0, (viewport.width - width) / 2);
  const padY = Math.max(0, (viewport.height - height) / 2);
  return {
    contentWidth: Math.max(width, viewport.width),
    contentHeight: Math.max(height, viewport.height),
    offsetX: padX - bounds.minX * zoom,
    offsetY: padY - bounds.minY * zoom,
  };
}

/**
 * Converts a viewport pixel position to page coordinates.
 *
 * Args:
 *   layout: Current layout.
 *   zoom: Current zoom.
 *   scroll: Current scroll offset in pixels.
 *   screen: Position relative to the viewport's top-left corner.
 *
 * Returns:
 *   Point in pt.
 */
export function screenToPt(layout: ViewportLayout, zoom: number, scroll: Point, screen: Point): Point {
  return {
    x: (screen.x + scroll.x - layout.offsetX) / zoom,
    y: (screen.y + scroll.y - layout.offsetY) / zoom,
  };
}

/**
 * Computes the scroll offset that places a page point at a given viewport position.
 *
 * Args:
 *   layout: Target layout.
 *   zoom: Target zoom.
 *   pt: Page point to anchor.
 *   screen: Desired viewport position of that point.
 *
 * Returns:
 *   Scroll offset in pixels (the browser clamps it to the valid range).
 */
export function scrollForAnchor(layout: ViewportLayout, zoom: number, pt: Point, screen: Point): Point {
  return {
    x: pt.x * zoom + layout.offsetX - screen.x,
    y: pt.y * zoom + layout.offsetY - screen.y,
  };
}

/**
 * Computes the zoom that fits a page inside the viewport.
 *
 * Args:
 *   page: Page size in pt.
 *   viewport: Viewport size in pixels.
 *   paddingPx: Padding kept on every side.
 *
 * Returns:
 *   Clamped zoom factor.
 */
export function fitZoom(page: Size, viewport: Size, paddingPx: number): number {
  const availableWidth = viewport.width - paddingPx * 2;
  const availableHeight = viewport.height - paddingPx * 2;
  if (availableWidth <= 0 || availableHeight <= 0 || page.width <= 0 || page.height <= 0) {
    return ZOOM_MIN;
  }
  return clampZoom(Math.min(availableWidth / page.width, availableHeight / page.height));
}
