import { getElementBounds, unionBounds } from "./geometry";
import type { CanvasElement, Point } from "./types";
import { mmToPt } from "./units";
import type { ViewportLayout } from "./viewport";

/** Numbered ticks are at least this far apart on screen (px). */
export const RULER_LABEL_MIN_GAP_PX = 50;
/** Unnumbered ticks are at least this far apart on screen (px). */
export const RULER_TICK_MIN_GAP_PX = 4;

// 有數字的刻度間距（mm）：1–2–5 的級數，涵蓋縮放 10%（約 0.28 px/mm）到 400%
const MAJOR_STEPS_MM = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000] as const;
// 每個主刻度分成幾格，越細越好，但相鄰細刻度不可小於 RULER_TICK_MIN_GAP_PX
const MINOR_DIVISIONS = [10, 5, 2, 1] as const;

/** Tick spacing chosen for a zoom level. */
export interface RulerScale {
  /** Distance between numbered ticks (mm). */
  readonly majorMm: number;
  /** Number of minor intervals per major interval (1 = no minor ticks). */
  readonly divisions: number;
}

/** One ruler tick. `half` is the middle tick of an evenly divided major interval (drawn longer). */
export type RulerTickLevel = "major" | "half" | "minor";

export interface RulerTick {
  /** Screen position along the ruler, relative to the ruler's start (px). */
  readonly px: number;
  readonly level: RulerTickLevel;
  /** Value in mm, only on major ticks. */
  readonly label?: number;
}

/**
 * Chooses the tick spacing for a zoom level: the smallest 1–2–5 step whose numbers do not crowd,
 * split into as many minor ticks as fit.
 *
 * Args:
 *   zoom: Canvas zoom (1 = 1 pt per CSS px).
 *
 * Returns:
 *   Major step and number of divisions.
 */
export function rulerScale(zoom: number): RulerScale {
  const pxPerMm = mmToPt(1) * zoom;
  const majorMm =
    MAJOR_STEPS_MM.find((step) => step * pxPerMm >= RULER_LABEL_MIN_GAP_PX) ?? MAJOR_STEPS_MM[MAJOR_STEPS_MM.length - 1];
  const divisions = MINOR_DIVISIONS.find((n) => (majorMm / n) * pxPerMm >= RULER_TICK_MIN_GAP_PX) ?? 1;
  return { majorMm, divisions };
}

/**
 * Lists the ticks visible on a ruler. Ticks start one label gap before the ruler so a number
 * whose tick has just scrolled off the start is still drawn (numbers sit after their tick).
 *
 * Args:
 *   originPx: Screen position of 0 mm along the ruler (px, may be outside the ruler).
 *   lengthPx: Ruler length (px).
 *   zoom: Canvas zoom.
 *
 * Returns:
 *   Ticks in increasing position.
 */
export function rulerTicks(originPx: number, lengthPx: number, zoom: number): RulerTick[] {
  const { majorMm, divisions } = rulerScale(zoom);
  const minorMm = majorMm / divisions;
  const minorPx = mmToPt(minorMm) * zoom;
  if (!(minorPx > 0) || !Number.isFinite(originPx) || lengthPx <= 0) return [];
  const first = Math.ceil((-RULER_LABEL_MIN_GAP_PX - originPx) / minorPx);
  const last = Math.floor((lengthPx - originPx) / minorPx);
  const ticks: RulerTick[] = [];
  for (let i = first; i <= last; i++) {
    const px = originPx + i * minorPx;
    const index = ((i % divisions) + divisions) % divisions;
    if (index === 0) {
      // 以整數格數換算，避免累加的浮點誤差；+ 0 把 -0 變成 0
      ticks.push({ px, level: "major", label: (i / divisions) * majorMm + 0 });
    } else {
      ticks.push({ px, level: divisions % 2 === 0 && index === divisions / 2 ? "half" : "minor" });
    }
  }
  return ticks;
}

/** A stretch of a ruler in screen px (start ≤ end), relative to the ruler's start. */
export interface RulerSpan {
  readonly start: number;
  readonly end: number;
}

/**
 * Where the selection lies on each ruler: the union of the selected elements' outer bounds
 * (rotation included), mapped to screen px.
 *
 * Args:
 *   elements: Selected elements, in page coordinates of the active page.
 *   origin: Screen position of the page's top-left corner (`rulerOrigin`).
 *   zoom: Canvas zoom.
 *
 * Returns:
 *   Spans on the horizontal (x) and vertical (y) rulers, or null when nothing is selected.
 */
export function selectionSpans(
  elements: readonly CanvasElement[],
  origin: Point,
  zoom: number,
): { readonly x: RulerSpan; readonly y: RulerSpan } | null {
  if (elements.length === 0) return null;
  const bounds = elements.map(getElementBounds).reduce((acc, next) => unionBounds(acc, next));
  return {
    x: { start: origin.x + bounds.minX * zoom, end: origin.x + bounds.maxX * zoom },
    y: { start: origin.y + bounds.minY * zoom, end: origin.y + bounds.maxY * zoom },
  };
}

/**
 * Screen position of the active page's top-left corner, relative to the canvas viewport:
 * where both rulers put 0.
 *
 * Args:
 *   layout: Current viewport layout.
 *   zoom: Current zoom.
 *   scroll: Current scroll offset (px).
 *   sheetX: The active page's offset in layer coordinates (pt; non-zero for the right page of a spread).
 *
 * Returns:
 *   Origin in px.
 */
export function rulerOrigin(layout: ViewportLayout, zoom: number, scroll: Point, sheetX: number): Point {
  return { x: layout.offsetX - scroll.x + sheetX * zoom, y: layout.offsetY - scroll.y };
}
