import type { Result } from "./validation";
import type { Size } from "./types";

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
