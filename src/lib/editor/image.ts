import { ALLOWED_IMAGE_TYPES, type Result } from "./validation";
import type { Size } from "./types";

/**
 * Opens the system file picker for images.
 *
 * Returns:
 *   Selected files; empty when the user cancels.
 */
export function pickImageFiles(): Promise<File[]> {
  return pickFiles(ALLOWED_IMAGE_TYPES.join(","));
}

/**
 * Opens the system file picker (several files).
 *
 * Args:
 *   accept: The input's `accept` attribute, e.g. `.png,.md`.
 *
 * Returns:
 *   Selected files; empty when the user cancels.
 */
export function pickFiles(accept: string): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = accept;
    input.addEventListener("change", () => resolve(Array.from(input.files ?? [])));
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

/** The root `<svg>` attributes that decide its size. */
export interface SvgSizeAttributes {
  readonly width: string | null;
  readonly height: string | null;
  readonly viewBox: string | null;
}

// 有單位或沒單位的正數（px、pt、mm…）；% 與 auto 不算：瀏覽器這時用預設的 150 px 高
function isAbsoluteLength(value: string | null): boolean {
  if (value === null || value.trim().endsWith("%")) return false;
  const length = Number.parseFloat(value);
  return Number.isFinite(length) && length > 0;
}

/**
 * The size to use for an SVG instead of the browser's: the viewBox size when neither width nor
 * height is an absolute length. A browser then makes the image 150 px tall whatever its viewBox
 * (`viewBox="0 0 100 300"` → 50 × 150); with a width or a height it computes the right size itself.
 *
 * Args:
 *   attributes: The root element's width, height and viewBox.
 *
 * Returns:
 *   The viewBox width × height, or null to keep the browser's natural size.
 */
export function svgViewBoxSize(attributes: SvgSizeAttributes): Size | null {
  if (isAbsoluteLength(attributes.width) || isAbsoluteLength(attributes.height)) return null;
  const numbers = (attributes.viewBox ?? "").trim().split(/[\s,]+/).map(Number);
  if (numbers.length !== 4 || !numbers.every(Number.isFinite)) return null;
  const [, , width, height] = numbers;
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * Reads `svgViewBoxSize` from SVG markup (browser only: uses `DOMParser`).
 *
 * Args:
 *   markup: The SVG file's text.
 *
 * Returns:
 *   The viewBox size, or null to keep the browser's natural size (also for markup that is not SVG).
 */
export function svgIntrinsicSize(markup: string): Size | null {
  const root = new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;
  if (root.localName !== "svg") return null;
  return svgViewBoxSize({
    width: root.getAttribute("width"),
    height: root.getAttribute("height"),
    viewBox: root.getAttribute("viewBox"),
  });
}

/**
 * Loads an image URL to read its intrinsic size.
 *
 * Args:
 *   src: Image URL (asset or blob URL).
 *
 * Returns:
 *   Natural size on success, or an error when the image cannot be decoded.
 */
export function loadImageSize(src: string): Promise<Result<Size>> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ data: { width: image.naturalWidth, height: image.naturalHeight }, error: null });
    image.onerror = () => resolve({ data: null, error: new Error("無法讀取圖片內容") });
    image.src = src;
  });
}
