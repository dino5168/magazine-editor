import { MIN_ELEMENT_SIZE_PT } from "./geometry";
import type { CanvasElement, ElementPatch } from "./types";
import {
  STAR_INNER_PERCENT_MAX,
  STAR_INNER_PERCENT_MIN,
  VERTEX_COUNT_MAX,
  VERTEX_COUNT_MIN,
  clamp,
} from "./validation";

/** Decimal places shown in the property panel's number fields. */
const DISPLAY_DECIMALS = 2;

/**
 * Parses what the user typed into a number field.
 *
 * Args:
 *   draft: Field text.
 *
 * Returns:
 *   The number, or null when the text is empty or not a finite number.
 */
export function parseNumberDraft(draft: string): number | null {
  const trimmed = draft.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * Formats a number for a field: at most two decimals, no trailing zeros, no "-0".
 *
 * Args:
 *   value: Number to show.
 *
 * Returns:
 *   Display text.
 */
export function formatNumber(value: number): string {
  const rounded = Number(value.toFixed(DISPLAY_DECIMALS));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/**
 * Normalizes an angle to the range (-180, 180].
 *
 * Args:
 *   degrees: Any angle.
 *
 * Returns:
 *   Equivalent angle in (-180, 180].
 */
export function normalizeRotation(degrees: number): number {
  const turned = ((degrees % 360) + 360) % 360;
  return turned > 180 ? turned - 360 : turned;
}

/**
 * Whether the element has an editable height (text height follows its content).
 *
 * Args:
 *   element: Canvas element.
 *
 * Returns:
 *   True for shapes and images.
 */
export function hasEditableHeight(element: CanvasElement): element is Exclude<CanvasElement, { type: "text" }> {
  return element.type !== "text";
}

/**
 * Clamps a corner radius typed into the panel: not negative, at most half the shorter side
 * (the canvas, the PDF and the SVG would draw a larger radius the same way, but the stored value
 * would then change the corners again when the shape is resized).
 *
 * Args:
 *   shape: Shape size.
 *   radius: Typed radius in pt.
 *
 * Returns:
 *   Radius in [0, min(width, height) / 2].
 */
export function clampCornerRadius(shape: { readonly width: number; readonly height: number }, radius: number): number {
  return clamp(radius, 0, Math.min(shape.width, shape.height) / 2);
}

/**
 * Rounds and clamps a typed number of polygon sides or star points.
 *
 * Args:
 *   count: Typed number.
 *
 * Returns:
 *   Integer in [VERTEX_COUNT_MIN, VERTEX_COUNT_MAX].
 */
export function clampVertexCount(count: number): number {
  return clamp(Math.round(count), VERTEX_COUNT_MIN, VERTEX_COUNT_MAX);
}

/**
 * Converts a star's inner radius typed as a percentage into the stored ratio.
 *
 * Args:
 *   percent: Inner radius as a percentage of the outer radius.
 *
 * Returns:
 *   Ratio in [STAR_INNER_PERCENT_MIN, STAR_INNER_PERCENT_MAX] / 100.
 */
export function innerRatioFromPercent(percent: number): number {
  return clamp(percent, STAR_INNER_PERCENT_MIN, STAR_INNER_PERCENT_MAX) / 100;
}

/**
 * Builds the patch for a new width or height typed into the property panel.
 *
 * Args:
 *   element: Element being resized.
 *   change: The new width or height (one of them).
 *   keepRatio: Whether the other side follows to keep the proportions.
 *
 * Returns:
 *   Patch with sizes clamped to the minimum element size.
 */
export function resizePatch(
  element: CanvasElement,
  change: { readonly width: number } | { readonly height: number },
  keepRatio: boolean,
): ElementPatch {
  const clamp = (value: number) => Math.max(MIN_ELEMENT_SIZE_PT, value);
  if (!hasEditableHeight(element)) {
    // 文字只有換行寬度；高度由內容決定
    return "width" in change ? { width: clamp(change.width) } : {};
  }
  if ("width" in change) {
    const width = clamp(change.width);
    return keepRatio ? { width, height: clamp((element.height * width) / element.width) } : { width };
  }
  const height = clamp(change.height);
  return keepRatio ? { width: clamp((element.width * height) / element.height), height } : { height };
}
