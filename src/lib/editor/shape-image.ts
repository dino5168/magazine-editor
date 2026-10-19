import type { ImageElement, ShapeElement, ShapeImage, ShapeImageFit } from "./types";
import { SHAPE_IMAGE_ZOOM_MAX } from "./validation";

// 圖片框（圖形裡的照片）的純邏輯：照片放在哪裡。畫布直接用、匯出由前端算好交給 Rust（只有這一份公式）

/** Where a photo is drawn, in the shape's own coordinates (may extend past the frame; the outline clips it). */
export interface PhotoPlacement {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Places a shape's photo: `cover` scales it to fill the frame, `contain` to fit inside it; `zoom`
 * enlarges that; whatever is larger than the frame is split by the focus point (0 = keep the left /
 * top edge, 1 = keep the right / bottom edge). With `contain` and zoom 1 the photo is centered on
 * the axis it does not fill, by the same focus rule.
 *
 * Args:
 *   width: Frame width (pt).
 *   height: Frame height (pt).
 *   image: The shape's photo.
 *
 * Returns:
 *   The photo's rectangle in the shape's coordinates.
 */
export function photoPlacement(width: number, height: number, image: ShapeImage): PhotoPlacement {
  const scaleX = width / image.imageWidth;
  const scaleY = height / image.imageHeight;
  const base = image.fit === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  const scale = base * image.zoom;
  const photoWidth = image.imageWidth * scale;
  const photoHeight = image.imageHeight * scale;
  // (負數) × 0 是 -0：寫進 JSON 是 0，但比較與測試會出錯，一律換成 0
  const offset = (spare: number, focus: number) => spare * focus || 0;
  return {
    x: offset(width - photoWidth, image.focusX),
    y: offset(height - photoHeight, image.focusY),
    width: photoWidth,
    height: photoHeight,
  };
}

/** Konva pattern attributes that draw a photo at `placement` (`fillPattern*`, no repeat). */
export interface PhotoPatternAttrs {
  readonly fillPatternX: number;
  readonly fillPatternY: number;
  readonly fillPatternScaleX: number;
  readonly fillPatternScaleY: number;
  readonly fillPatternRepeat: "no-repeat";
}

/**
 * Converts a photo placement into Konva pattern attributes. The pattern starts at the node's own
 * origin, which is the frame's top-left corner for rectangles, lines and paths but the **center**
 * for an ellipse (Konva 10.5, measured in step 0): pass that origin so the photo lands in the same place.
 *
 * Args:
 *   placement: From `photoPlacement`, in the frame's coordinates.
 *   decoded: Size of the loaded image in pixels (the pattern is drawn at that size before scaling).
 *   origin: Where the node's own (0, 0) is, in the frame's coordinates.
 *
 * Returns:
 *   Attributes to spread on the Konva shape, together with `fillPatternImage`.
 */
export function photoPatternAttrs(
  placement: PhotoPlacement,
  decoded: { readonly width: number; readonly height: number },
  origin: { readonly x: number; readonly y: number } = { x: 0, y: 0 },
): PhotoPatternAttrs {
  return {
    fillPatternX: placement.x - origin.x,
    fillPatternY: placement.y - origin.y,
    fillPatternScaleX: placement.width / decoded.width,
    fillPatternScaleY: placement.height / decoded.height,
    fillPatternRepeat: "no-repeat",
  };
}

/** A new photo for a frame: fills it (cover), centered, not zoomed. */
export const DEFAULT_SHAPE_IMAGE_LOOK = { fit: "cover", focusX: 0.5, focusY: 0.5, zoom: 1 } as const satisfies Pick<
  ShapeImage,
  "fit" | "focusX" | "focusY" | "zoom"
>;

/**
 * Makes the photo of a frame from an image file (e.g. a library image or an image element).
 *
 * Args:
 *   src: Image path (`ImageElement.src`).
 *   size: Intrinsic size in pixels.
 *
 * Returns:
 *   Photo that fills the frame, centered.
 */
export function shapeImageOf(src: string, size: { readonly width: number; readonly height: number }): ShapeImage {
  return { src, imageWidth: size.width, imageHeight: size.height, ...DEFAULT_SHAPE_IMAGE_LOOK };
}

/**
 * Turns an image element into an image frame (右鍵「轉成圖片框」): a rectangle with the same id,
 * position, size and rotation, a transparent fill and the image as its photo (cover, centered).
 * The shape can then be changed with 屬性面板「圖形 → 換成」.
 *
 * Args:
 *   image: The image element.
 *   pixels: The image's intrinsic size in pixels.
 *
 * Returns:
 *   The frame, to put in the image's place with `element/replace`.
 */
export function imageToFrame(image: ImageElement, pixels: { readonly width: number; readonly height: number }): ShapeElement {
  const { id, x, y, rotation, width, height, src } = image;
  return {
    id,
    type: "shape",
    x,
    y,
    rotation,
    width,
    height,
    geometry: { kind: "rect", cornerRadius: 0 },
    fill: "#00000000",
    fillSwatchId: null,
    stroke: null,
    label: null,
    image: shapeImageOf(src, pixels),
  };
}

/** Keeps a focus value in 0–1 (NaN → centered). */
export function clampFocus(value: number): number {
  return Number.isNaN(value) ? 0.5 : Math.min(1, Math.max(0, value));
}

/** Keeps a zoom in 1–SHAPE_IMAGE_ZOOM_MAX (NaN → 1). */
export function clampZoom(value: number): number {
  return Number.isNaN(value) ? 1 : Math.min(SHAPE_IMAGE_ZOOM_MAX, Math.max(1, value));
}

/** Labels of the fit options (properties panel, MCP descriptions). */
export const SHAPE_IMAGE_FIT_LABELS: { readonly [K in ShapeImageFit]: string } = {
  cover: "填滿",
  contain: "完整顯示",
};
