export type Result<T> = { data: T; error: null } | { data: null; error: Error };

export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const DOCUMENT_NAME_MAX_LENGTH = 100;
export const PAGE_NAME_MAX_LENGTH = 50;

export const FONT_SIZE_MIN = 6;
export const FONT_SIZE_MAX = 400;

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

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
 * Checks whether a string is a `#rrggbb` color.
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
