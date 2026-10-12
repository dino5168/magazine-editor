/**
 * 矩形的圓角：四個角一樣時存一個數字，不同時存 `[左上, 右上, 右下, 左下]`（和 Konva 相同的順序）。
 * 畫的時候每個角各自限制在短邊的一半（Konva 10.5.0 實測，見計畫 `15-屬性-樣式-圓角-實作.md` 步驟 1）。
 */
import { clampCornerRadius } from "./properties";
import type { CornerRadii, CornerRadius } from "./types";

/** Index of a corner in `CornerRadii`. */
export type CornerIndex = 0 | 1 | 2 | 3;

/** Names of the corners, in `CornerRadii` order (the property panel's labels). */
export const CORNER_NAMES = ["左上", "右上", "右下", "左下"] as const satisfies readonly string[];

/**
 * The four radii of a corner radius.
 *
 * Args:
 *   radius: One number or four.
 *
 * Returns:
 *   `[top-left, top-right, bottom-right, bottom-left]`.
 */
export function cornerRadii(radius: CornerRadius): CornerRadii {
  return typeof radius === "number" ? [radius, radius, radius, radius] : radius;
}

/**
 * Whether all four corners have the same radius.
 *
 * Args:
 *   radius: One number or four.
 *
 * Returns:
 *   True when the corners match.
 */
export function isUniformCornerRadius(radius: CornerRadius): boolean {
  const [first, ...rest] = cornerRadii(radius);
  return rest.every((value) => value === first);
}

/**
 * The stored form: one number when the four corners match, otherwise the four radii.
 *
 * Args:
 *   radii: Four radii.
 *
 * Returns:
 *   A number or the four radii.
 */
export function normalizeCornerRadius(radii: CornerRadii): CornerRadius {
  return isUniformCornerRadius(radii) ? radii[0] : radii;
}

/**
 * Limits every corner to [0, half the shorter side], as typed into the panel or given by MCP.
 *
 * Args:
 *   shape: Shape size.
 *   radius: One number or four.
 *
 * Returns:
 *   The clamped radius in its stored form.
 */
export function clampCornerRadii(shape: { readonly width: number; readonly height: number }, radius: CornerRadius): CornerRadius {
  const [a, b, c, d] = cornerRadii(radius).map((value) => clampCornerRadius(shape, value));
  return normalizeCornerRadius([a, b, c, d]);
}

/**
 * Changes one corner and keeps the others.
 *
 * Args:
 *   shape: Shape size.
 *   radius: Current radius.
 *   corner: Corner to change.
 *   value: Typed radius in pt.
 *
 * Returns:
 *   The new radius, clamped, in its stored form.
 */
export function withCornerRadius(
  shape: { readonly width: number; readonly height: number },
  radius: CornerRadius,
  corner: CornerIndex,
  value: number,
): CornerRadius {
  const radii = [...cornerRadii(radius)] as [number, number, number, number];
  radii[corner] = value;
  return clampCornerRadii(shape, radii);
}

/**
 * Whether any corner is rounded (the shape is then called 「圓角矩形」).
 *
 * Args:
 *   radius: One number or four.
 *
 * Returns:
 *   True when a corner radius is above 0.
 */
export function hasRoundedCorner(radius: CornerRadius): boolean {
  return cornerRadii(radius).some((value) => value > 0);
}

/**
 * The radius as Konva's `Rect` takes it: one number, or a (mutable) array of the four corners.
 *
 * Args:
 *   radius: One number or four.
 *
 * Returns:
 *   Value for Konva's `cornerRadius`.
 */
export function konvaCornerRadius(radius: CornerRadius): number | number[] {
  return typeof radius === "number" ? radius : [...radius];
}
