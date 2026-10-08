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
