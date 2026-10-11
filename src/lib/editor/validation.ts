import type { Margins, ShapeGeometry, ShapeLabel, Size, Stroke, TextShadow, TextStyle } from "./types";
import { hasValidTextSpacing } from "./text-style";
import { mmToPt } from "./units";

export type Result<T> = { data: T; error: null } | { data: null; error: Error };

export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const DOCUMENT_NAME_MAX_LENGTH = 100;
export const PAGE_NAME_MAX_LENGTH = 50;

export const FONT_SIZE_MIN = 6;
export const FONT_SIZE_MAX = 400;

/** Thinnest stroke the property panel offers (pt). The file format only requires > 0. */
export const STROKE_WIDTH_MIN = 0.25;
/** Thickest stroke (pt); same as `STROKE_WIDTH_MAX` in Rust `format.rs`. */
export const STROKE_WIDTH_MAX = 100;
const STROKE_DASHES: readonly Stroke["dash"][] = ["solid", "dashed", "dotted"];

/** Most polygon sides / star points a document may contain; same as `MAX_VERTEX_COUNT` in Rust. */
export const MAX_VERTEX_COUNT = 1000;
/** Range the property panel offers for polygon sides and star points. */
export const VERTEX_COUNT_MIN = 3;
export const VERTEX_COUNT_MAX = 24;
/** Range (%) the property panel offers for a star's inner radius. */
export const STAR_INNER_PERCENT_MIN = 10;
export const STAR_INNER_PERCENT_MAX = 90;

/** Page width / height range (pt) the page setup accepts: 10–2000 mm. The file format only requires > 0. */
export const PAGE_SIZE_MIN_PT = mmToPt(10);
export const PAGE_SIZE_MAX_PT = mmToPt(2000);
/** Largest margin (pt): 2000 mm; same as `MARGIN_MAX_PT` in Rust `format.rs`. */
export const MARGIN_MAX_PT = mmToPt(2000);

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const ELEMENT_COLOR_PATTERN = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/;

/** Minimal file shape so validation is testable without a DOM `File`. */
export interface FileLike {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

/**
 * Validates an image file selected or dropped by the user.
 *
 * Args:
 *   file: The candidate file.
 *
 * Returns:
 *   The same file on success, or an error describing why it was rejected.
 */
export function validateImageFile<T extends FileLike>(file: T): Result<T> {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return { data: null, error: new Error(`「${file.name}」不是支援的圖片格式（PNG、JPEG、WebP、GIF）`) };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { data: null, error: new Error(`「${file.name}」超過 20 MB 上限`) };
  }
  return { data: file, error: null };
}

/**
 * Trims and validates a user-entered name.
 *
 * Args:
 *   raw: Raw input value.
 *   maxLength: Maximum length after trimming, counted in code points.
 *
 * Returns:
 *   The trimmed name, or an error when empty or too long.
 */
export function validateName(raw: string, maxLength: number): Result<string> {
  const name = raw.trim();
  if (name.length === 0) {
    return { data: null, error: new Error("名稱不可為空白") };
  }
  // 以 code point 計數，避免 emoji 等 surrogate pair 被算成兩個字
  if (Array.from(name).length > maxLength) {
    return { data: null, error: new Error(`名稱最多 ${maxLength} 個字`) };
  }
  return { data: name, error: null };
}

/**
 * Clamps a number into a range; NaN falls back to the minimum.
 *
 * Args:
 *   value: Input number.
 *   min: Inclusive lower bound.
 *   max: Inclusive upper bound.
 *
 * Returns:
 *   The clamped value.
 */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Clamps a font size to the supported range.
 *
 * Args:
 *   value: Requested font size in pt.
 *
 * Returns:
 *   Font size within [FONT_SIZE_MIN, FONT_SIZE_MAX].
 */
export function clampFontSize(value: number): number {
  return clamp(value, FONT_SIZE_MIN, FONT_SIZE_MAX);
}

/**
 * Checks whether a string is a `#rrggbb` color (page backgrounds: no transparency).
 *
 * Args:
 *   value: Candidate color string.
 *
 * Returns:
 *   True when the value is a 6-digit hex color.
 */
export function isHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value);
}

/**
 * Checks whether a string is a valid element color: `#rrggbb` or `#rrggbbaa`.
 * 和 Rust `format.rs` 的 `require_element_color` 規則相同。
 *
 * Args:
 *   value: Candidate color string.
 *
 * Returns:
 *   True when the value is a 6- or 8-digit hex color.
 */
export function isElementColor(value: string): boolean {
  return ELEMENT_COLOR_PATTERN.test(value);
}

/**
 * Checks whether a value is drawable shape geometry. Same rules as Rust `validate_geometry`:
 * corner radius ≥ 0, star inner ratio in (0, 1], at most MAX_VERTEX_COUNT sides / points
 * (fewer than 3 are raised when drawing, so they are not rejected).
 *
 * Args:
 *   value: Candidate geometry (e.g. from a patch).
 *
 * Returns:
 *   True when the value can be stored as `ShapeElement.geometry`.
 */
export function isShapeGeometry(value: unknown): value is ShapeGeometry {
  if (typeof value !== "object" || value === null) return false;
  const g = value as Record<string, unknown>;
  const count = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= MAX_VERTEX_COUNT;
  switch (g.kind) {
    case "rect":
      return typeof g.cornerRadius === "number" && Number.isFinite(g.cornerRadius) && g.cornerRadius >= 0;
    case "ellipse":
      return true;
    case "polygon":
      return count(g.sides);
    case "star":
      return count(g.numPoints) && typeof g.innerRatio === "number" && g.innerRatio > 0 && g.innerRatio <= 1;
    default:
      return false;
  }
}

/**
 * Checks whether a value is a valid shape label (text, supported font size, known styles, element
 * color). Rust checks the color; the other limits are what the UI can produce.
 *
 * Args:
 *   value: Candidate label (e.g. from a patch).
 *
 * Returns:
 *   True when the value can be stored as `ShapeElement.label`.
 */
export function isShapeLabel(value: unknown): value is ShapeLabel {
  if (!isTextStyle(value)) return false;
  const label = value as unknown as Record<string, unknown>;
  return (
    typeof label.text === "string" &&
    ["top", "middle", "bottom"].includes(label.verticalAlign as string) &&
    (label.styleId === null || typeof label.styleId === "string")
  );
}

/**
 * Checks the text style fields of a value (supported font size, known weight and alignment, valid
 * decoration, element color); other fields are ignored. Shape labels and text styles share it.
 *
 * Args:
 *   value: Candidate style.
 *
 * Returns:
 *   True when every `TextStyle` field is valid.
 */
export function isTextStyle(value: unknown): value is TextStyle {
  if (typeof value !== "object" || value === null) return false;
  const style = value as Record<string, unknown>;
  return (
    typeof style.fontSize === "number" &&
    style.fontSize >= FONT_SIZE_MIN &&
    style.fontSize <= FONT_SIZE_MAX &&
    typeof style.fontFamily === "string" &&
    (style.fontStyle === "normal" || style.fontStyle === "bold") &&
    hasValidTextDecoration(style) &&
    hasValidTextSpacing(style) &&
    ["left", "center", "right"].includes(style.align as string) &&
    typeof style.fill === "string" &&
    isElementColor(style.fill)
  );
}

/**
 * Checks whether a value is a valid shape stroke (same rules as Rust `validate_element`):
 * element color, width in (0, STROKE_WIDTH_MAX], known dash style.
 *
 * Args:
 *   value: Candidate stroke (e.g. from a patch).
 *
 * Returns:
 *   True when the value can be stored as `ShapeElement.stroke`.
 */
export function isStroke(value: unknown): value is Stroke {
  if (typeof value !== "object" || value === null) return false;
  const { color, width, dash } = value as Record<string, unknown>;
  return (
    typeof color === "string" &&
    isElementColor(color) &&
    typeof width === "number" &&
    width > 0 &&
    width <= STROKE_WIDTH_MAX &&
    (STROKE_DASHES as readonly unknown[]).includes(dash)
  );
}

/** Largest text shadow offset either way (pt); same as `TEXT_SHADOW_OFFSET_MAX` in Rust `format.rs`. */
export const TEXT_SHADOW_OFFSET_MAX = 50;

/**
 * Checks whether a value is a valid text shadow (same rules as Rust `validate_text_shadow`):
 * element color, both offsets finite and within ±TEXT_SHADOW_OFFSET_MAX.
 *
 * Args:
 *   value: Candidate shadow (e.g. from a patch).
 *
 * Returns:
 *   True when the value can be stored as `TextStyle.shadow`.
 */
export function isTextShadow(value: unknown): value is TextShadow {
  if (typeof value !== "object" || value === null) return false;
  const { color, offsetX, offsetY } = value as Record<string, unknown>;
  const offset = (n: unknown) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= TEXT_SHADOW_OFFSET_MAX;
  return typeof color === "string" && isElementColor(color) && offset(offsetX) && offset(offsetY);
}

/**
 * Checks the decoration fields of a text style: italic / underline / strikethrough are booleans and
 * the shadow is null or valid.
 *
 * Args:
 *   style: Candidate style (a label, a page number style...).
 *
 * Returns:
 *   True when all four fields are valid.
 */
export function hasValidTextDecoration(style: Record<string, unknown>): boolean {
  return (
    typeof style.italic === "boolean" &&
    typeof style.underline === "boolean" &&
    typeof style.strikethrough === "boolean" &&
    (style.shadow === null || isTextShadow(style.shadow))
  );
}

/**
 * Checks whether a page size is within what the page setup accepts (10–2000 mm on each side).
 *
 * Args:
 *   size: Candidate page size in pt.
 *
 * Returns:
 *   True when both sides are in [PAGE_SIZE_MIN_PT, PAGE_SIZE_MAX_PT].
 */
export function isPageSize(size: Size): boolean {
  const inRange = (n: number) => Number.isFinite(n) && n >= PAGE_SIZE_MIN_PT && n <= PAGE_SIZE_MAX_PT;
  return inRange(size.width) && inRange(size.height);
}

/**
 * Checks whether a value is a valid set of margins (same rules as Rust `validate_margins`):
 * every side finite and in [0, MARGIN_MAX_PT]. Whether the margins fit the page is checked
 * by the page setup dialog only, so resizing a page never makes a file invalid.
 *
 * Args:
 *   value: Candidate margins.
 *
 * Returns:
 *   True when the value can be stored as `EditorDocument.margins`.
 */
export function isMargins(value: unknown): value is Margins {
  if (typeof value !== "object" || value === null) return false;
  const margins = value as Record<string, unknown>;
  return (["top", "right", "bottom", "left"] as const).every((side) => {
    const n = margins[side];
    return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= MARGIN_MAX_PT;
  });
}
