import { colorAlpha } from "./palette";
import type { Point, TextShadow, TextStyle } from "./types";

/** Italic / underline / strikethrough / shadow of a text style. */
export type TextDecoration = Pick<TextStyle, "italic" | "underline" | "strikethrough" | "shadow">;

/** Decoration of new text (text elements, shape labels, page numbers): none. */
export const PLAIN_TEXT_DECORATION: TextDecoration = {
  italic: false,
  underline: false,
  strikethrough: false,
  shadow: null,
};

/** Shadow set when the shadow switch is turned on: 50% black, 2 pt right and down. */
export const DEFAULT_TEXT_SHADOW: TextShadow = { color: "#00000080", offsetX: 2, offsetY: 2 };

/**
 * Konva `fontStyle` (also the style / weight part of the CSS `font` shorthand), e.g. "italic bold".
 *
 * Args:
 *   style: Weight and italic flag.
 *
 * Returns:
 *   "normal", "bold", "italic" or "italic bold".
 */
export function konvaFontStyle(style: Pick<TextStyle, "fontStyle" | "italic">): string {
  if (!style.italic) return style.fontStyle;
  return style.fontStyle === "bold" ? "italic bold" : "italic";
}

/**
 * Konva `textDecoration` / CSS `text-decoration-line`.
 *
 * Args:
 *   style: Underline and strikethrough flags.
 *
 * Returns:
 *   "", "underline", "line-through" or "underline line-through" ("" = none for Konva).
 */
export function textDecorationLine(style: Pick<TextStyle, "underline" | "strikethrough">): string {
  return [style.underline && "underline", style.strikethrough && "line-through"].filter(Boolean).join(" ");
}

/**
 * Konva attributes of a text style's decoration. Every key is always present, so turning the
 * shadow off on a mounted node really removes it.
 *
 * The canvas shadow offset is not rotated with the node (Canvas 2D applies it in device space;
 * Konva only scales it), so the shadow always points the same way on the page.
 *
 * Args:
 *   style: Weight and decoration.
 *
 * Returns:
 *   Attributes to spread onto a Konva `Text`.
 */
export function konvaTextStyle(style: Pick<TextStyle, "fontStyle"> & TextDecoration) {
  const { shadow } = style;
  return {
    fontStyle: konvaFontStyle(style),
    textDecoration: textDecorationLine(style),
    shadowEnabled: shadow !== null,
    // 透明度另外交給 shadowOpacity，不依賴 Konva 對 8 位 hex 的解析
    shadowColor: shadow ? shadow.color.slice(0, 7) : undefined,
    shadowOpacity: shadow ? colorAlpha(shadow.color) : 1,
    shadowOffsetX: shadow?.offsetX ?? 0,
    shadowOffsetY: shadow?.offsetY ?? 0,
    shadowBlur: 0,
  };
}

/**
 * Turns a page-direction shadow offset into the element's own (rotated) coordinates, for renderers
 * that draw inside the rotated box (CSS `text-shadow`, the PDF and the EPUB).
 *
 * Args:
 *   shadow: Shadow whose offset points along the page axes.
 *   rotation: Element rotation in degrees, clockwise.
 *
 * Returns:
 *   The offset rotated by −rotation.
 */
export function localShadowOffset(shadow: TextShadow, rotation: number): Point {
  const radians = (-rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: shadow.offsetX * cos - shadow.offsetY * sin, y: shadow.offsetX * sin + shadow.offsetY * cos };
}
