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

/** Line height and letter spacing of a text style. */
export type TextSpacing = Pick<TextStyle, "lineHeight" | "letterSpacing">;

/**
 * Line height of new text, of page numbers and of files before v9; same value as
 * `DEFAULT_LINE_HEIGHT` in Rust `format.rs`.
 */
export const DEFAULT_LINE_HEIGHT = 1.2;

/** Spacing of new text (text elements, shape labels, page numbers): default line height, no letter spacing. */
export const DEFAULT_TEXT_SPACING: TextSpacing = { lineHeight: DEFAULT_LINE_HEIGHT, letterSpacing: 0 };

/** Line height range (× font size); same as `LINE_HEIGHT_MIN` / `_MAX` in Rust `format.rs`. */
export const LINE_HEIGHT_MIN = 0.5;
export const LINE_HEIGHT_MAX = 3;
/** Letter spacing range (1/1000 of the font size); same as `LETTER_SPACING_MIN` / `_MAX` in Rust `format.rs`. */
export const LETTER_SPACING_MIN = -200;
export const LETTER_SPACING_MAX = 1000;

/**
 * Whether a value is a valid line height / letter spacing (finite and within range).
 *
 * Args:
 *   style: Candidate style (a label, a text style...).
 *
 * Returns:
 *   True when both fields are valid.
 */
export function hasValidTextSpacing(style: Record<string, unknown>): boolean {
  return isLineHeight(style.lineHeight) && isLetterSpacing(style.letterSpacing);
}

/**
 * Line height typed in the property panel: limited to the range, rounded to 0.01.
 *
 * Args:
 *   value: Finite number from the field.
 *
 * Returns:
 *   A valid line height.
 */
export function clampLineHeight(value: number): number {
  return Math.round(Math.min(LINE_HEIGHT_MAX, Math.max(LINE_HEIGHT_MIN, value)) * 100) / 100;
}

/**
 * Letter spacing typed in the property panel: limited to the range, rounded to a whole ‰.
 *
 * Args:
 *   value: Finite number from the field.
 *
 * Returns:
 *   A valid letter spacing.
 */
export function clampLetterSpacing(value: number): number {
  return Math.round(Math.min(LETTER_SPACING_MAX, Math.max(LETTER_SPACING_MIN, value)));
}

export function isLineHeight(value: unknown): value is number {
  return typeof value === "number" && value >= LINE_HEIGHT_MIN && value <= LINE_HEIGHT_MAX;
}

export function isLetterSpacing(value: unknown): value is number {
  return typeof value === "number" && value >= LETTER_SPACING_MIN && value <= LETTER_SPACING_MAX;
}

/** Color of new text (text elements, shape labels, page numbers, the built-in text styles). */
export const DEFAULT_TEXT_FILL = "#171717";

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
 * Letter spacing in pt (what Konva's `letterSpacing` takes) from the stored 1/1000 of the font size.
 *
 * Args:
 *   style: Font size and letter spacing.
 *
 * Returns:
 *   Extra space after every character, in pt.
 */
export function letterSpacingPt(style: Pick<TextStyle, "fontSize" | "letterSpacing">): number {
  return (style.fontSize * style.letterSpacing) / 1000;
}

/**
 * Konva attributes of a text style's weight, decoration, line height and letter spacing. Every key
 * is always present, so turning the shadow off on a mounted node really removes it.
 *
 * The canvas shadow offset is not rotated with the node (Canvas 2D applies it in device space;
 * Konva only scales it), so the shadow always points the same way on the page.
 *
 * With letter spacing ≠ 0 Konva 10 draws one character at a time, so kerning and ligatures are
 * lost; the exports copy that (plan `12-新增文字屬性-行高與字距-實作.md` 2.6).
 *
 * Args:
 *   style: Font size, weight, decoration and spacing.
 *
 * Returns:
 *   Attributes to spread onto a Konva `Text`.
 */
export function konvaTextStyle(style: Pick<TextStyle, "fontStyle" | "fontSize"> & TextDecoration & TextSpacing) {
  const { shadow } = style;
  return {
    fontStyle: konvaFontStyle(style),
    lineHeight: style.lineHeight,
    letterSpacing: letterSpacingPt(style),
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
