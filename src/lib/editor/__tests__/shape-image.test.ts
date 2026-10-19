import { describe, expect, it } from "vitest";
import { clampFocus, clampZoom, imageToFrame, photoPatternAttrs, photoPlacement, shapeImageOf } from "../shape-image";
import type { ShapeImage } from "../types";
import { isShapeImage, SHAPE_IMAGE_ZOOM_MAX } from "../validation";

// 200 × 150 的照片（步驟 0 的技術驗證用同一組數字）
const PHOTO: ShapeImage = shapeImageOf("assets/images/p.png", { width: 200, height: 150 });

describe("photoPlacement", () => {
  it("cover fills the frame and centers the overflow (same numbers as the step 0 spike)", () => {
    const placed = photoPlacement(120, 100, PHOTO);
    expect(placed.width).toBeCloseTo(133.3333, 4);
    expect(placed.height).toBeCloseTo(100, 6);
    expect(placed.x).toBeCloseTo(-6.6667, 4);
    expect(placed.y).toBeCloseTo(0, 6);
  });

  it("contain fits inside and centers on the other axis", () => {
    expect(photoPlacement(120, 100, { ...PHOTO, fit: "contain" })).toEqual({ x: 0, y: 5, width: 120, height: 90 });
  });

  it("focus keeps the left / top or right / bottom edge", () => {
    const left = photoPlacement(120, 100, { ...PHOTO, focusX: 0 });
    const right = photoPlacement(120, 100, { ...PHOTO, focusX: 1 });
    expect(left.x).toBe(0);
    expect(right.x + right.width).toBeCloseTo(120, 6);
    // 直的照片在橫的框裡：多出來的是高度，focusY 決定保留哪一段
    const portrait = { ...PHOTO, imageWidth: 100, imageHeight: 300 };
    expect(photoPlacement(200, 100, { ...portrait, focusY: 0 }).y).toBe(0);
    expect(photoPlacement(200, 100, { ...portrait, focusY: 1 })).toEqual({ x: 0, y: -500, width: 200, height: 600 });
  });

  it("zoom enlarges around the focus point", () => {
    const zoomed = photoPlacement(120, 100, { ...PHOTO, zoom: 2 });
    expect(zoomed.width).toBeCloseTo(266.6667, 4);
    expect(zoomed.height).toBeCloseTo(200, 6);
    // 對焦在正中央：照片中心仍在框的中心
    expect(zoomed.x + zoomed.width / 2).toBeCloseTo(60, 6);
    expect(zoomed.y + zoomed.height / 2).toBeCloseTo(50, 6);
  });

  it("works for a photo exactly the frame's shape", () => {
    expect(photoPlacement(400, 300, PHOTO)).toEqual({ x: 0, y: 0, width: 400, height: 300 });
  });
});

describe("photoPatternAttrs", () => {
  it("scales the decoded image to the placement, from the node's origin (步驟 0 的數字)", () => {
    const placement = photoPlacement(120, 100, { ...PHOTO, fit: "contain" });
    expect(photoPatternAttrs(placement, { width: 200, height: 150 })).toEqual({
      fillPatternX: 0,
      fillPatternY: 5,
      fillPatternScaleX: 0.6,
      fillPatternScaleY: 0.6,
      fillPatternRepeat: "no-repeat",
    });
    // 橢圓的原點是圓心：(-60, -45)，實測照片才在正確位置
    expect(photoPatternAttrs(placement, { width: 200, height: 150 }, { x: 60, y: 50 })).toMatchObject({ fillPatternX: -60, fillPatternY: -45 });
  });

  it("uses the decoded size, not the stored pixel size (they can differ, e.g. SVG)", () => {
    const placement = photoPlacement(120, 100, PHOTO);
    const attrs = photoPatternAttrs(placement, { width: 400, height: 300 });
    expect(attrs.fillPatternScaleX * 400).toBeCloseTo(placement.width, 6);
    expect(attrs.fillPatternScaleY * 300).toBeCloseTo(placement.height, 6);
  });
});

describe("shape image values", () => {
  it("makes a centered cover photo", () => {
    expect(PHOTO).toEqual({ src: "assets/images/p.png", imageWidth: 200, imageHeight: 150, fit: "cover", focusX: 0.5, focusY: 0.5, zoom: 1 });
    expect(isShapeImage(PHOTO)).toBe(true);
  });

  it("clamps focus and zoom", () => {
    expect([clampFocus(-1), clampFocus(0.25), clampFocus(2), clampFocus(Number.NaN)]).toEqual([0, 0.25, 1, 0.5]);
    expect([clampZoom(0.5), clampZoom(3), clampZoom(99), clampZoom(Number.NaN)]).toEqual([1, 3, SHAPE_IMAGE_ZOOM_MAX, 1]);
  });

  it("validates like Rust validate_shape_image (except the path)", () => {
    expect(isShapeImage({ ...PHOTO, zoom: SHAPE_IMAGE_ZOOM_MAX, focusX: 0, focusY: 1 })).toBe(true);
    for (const bad of [
      null,
      { ...PHOTO, src: "" },
      { ...PHOTO, imageWidth: 0 },
      { ...PHOTO, imageHeight: Number.POSITIVE_INFINITY },
      { ...PHOTO, fit: "stretch" },
      { ...PHOTO, focusX: 1.01 },
      { ...PHOTO, focusY: -0.1 },
      { ...PHOTO, zoom: 0.99 },
      { ...PHOTO, zoom: SHAPE_IMAGE_ZOOM_MAX + 0.1 },
    ]) {
      expect(isShapeImage(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("imageToFrame", () => {
  it("keeps the image's id, box and rotation; transparent rectangle with the photo", () => {
    const image = { id: "img", type: "image", x: 10, y: 20, rotation: 15, width: 300, height: 200, src: "assets/images/p.png" } as const;
    const frame = imageToFrame(image, { width: 1600, height: 900 });
    expect(frame).toEqual({
      id: "img",
      type: "shape",
      x: 10,
      y: 20,
      rotation: 15,
      width: 300,
      height: 200,
      geometry: { kind: "rect", cornerRadius: 0 },
      fill: "#00000000",
      fillSwatchId: null,
      stroke: null,
      label: null,
      image: shapeImageOf("assets/images/p.png", { width: 1600, height: 900 }),
    });
    expect(isShapeImage(frame.image)).toBe(true);
  });
});
