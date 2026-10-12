import { describe, expect, it } from "vitest";
import { alignContentPatch, contentArea, fillContentDisabledReason, fillContentPatch } from "../content-align";
import { createImageElement, createShapeInBox, createTextElement } from "../element-factory";
import { getElementBounds, rotatedBoxBounds } from "../geometry";
import type { Bounds, CanvasElement, ElementPatch } from "../types";

const PAGE = { width: 600, height: 800 };
const MARGINS = { top: 40, right: 50, bottom: 60, left: 30 };
// 內容區：x 30–550（寬 520）、y 40–740（高 700）
const AREA = contentArea(PAGE, MARGINS);

const rect = (patch: Partial<CanvasElement> = {}) =>
  ({ ...createShapeInBox("rect", { minX: 100, minY: 100, maxX: 300, maxY: 200 }), ...patch }) as CanvasElement;
const image = () => createImageElement("assets/images/a.png", { width: 400, height: 200 }, PAGE, { x: 300, y: 300 });
const text = () => ({ ...createTextElement("body", { x: 200, y: 200 }), rotation: 0 });
const apply = (element: CanvasElement, patch: ElementPatch | null) => ({ ...element, ...patch }) as CanvasElement;
const close = (a: Bounds, b: Bounds) => {
  for (const key of ["minX", "minY", "maxX", "maxY"] as const) expect(a[key]).toBeCloseTo(b[key]);
};

describe("contentArea", () => {
  it("is the area inside the margins", () => {
    expect(AREA).toEqual({ minX: 30, minY: 40, maxX: 550, maxY: 740 });
  });

  it("is the whole page without margins", () => {
    expect(contentArea(PAGE, { top: 0, right: 0, bottom: 0, left: 0 })).toEqual({ minX: 0, minY: 0, maxX: 600, maxY: 800 });
  });
});

describe("fillContentPatch", () => {
  it("stretches a shape across the content width, keeping its height and y", () => {
    expect(fillContentPatch(rect(), AREA, "width", false)).toEqual({ width: 520, x: 30 });
    expect(fillContentPatch(rect(), AREA, "height", false)).toEqual({ height: 700, y: 40 });
  });

  it("follows the aspect ratio when it is locked; the other position stays", () => {
    // 200 × 100 → 寬 520、高 260
    expect(fillContentPatch(rect(), AREA, "width", true)).toEqual({ width: 520, height: 260, x: 30 });
    // 圖片 400 × 200 放進 600 寬的頁面時縮成頁寬的一部分；比例照舊
    const photo = image();
    const filled = apply(photo, fillContentPatch(photo, AREA, "height", true));
    expect(filled).toMatchObject({ height: 700, y: 40, x: photo.x });
    expect(filled.width / (filled as { height: number }).height).toBeCloseTo(photo.width / photo.height);
  });

  it("turns a rotated element back to 0° in the same patch", () => {
    expect(fillContentPatch(rect({ rotation: 30 }), AREA, "width", false)).toEqual({ width: 520, x: 30, rotation: 0 });
  });

  it("fills a text's wrap width but never its height", () => {
    expect(fillContentPatch(text(), AREA, "width", false)).toEqual({ width: 520, x: 30 });
    expect(fillContentPatch(text(), AREA, "height", false)).toBeNull();
    expect(fillContentDisabledReason(text(), AREA, "height")).toBe("文字的高度由內容決定");
  });

  it("is not possible when the margins leave no room", () => {
    const tiny = contentArea({ width: 100, height: 800 }, { top: 0, right: 60, bottom: 0, left: 60 });
    expect(fillContentDisabledReason(rect(), tiny, "width")).toContain("內容區太小");
    expect(fillContentPatch(rect(), tiny, "width", false)).toBeNull();
    expect(fillContentDisabledReason(rect(), tiny, "height")).toBeNull();
  });
});

describe("alignContentPatch", () => {
  it("moves an unrotated element to every edge and centre line", () => {
    const shape = rect(); // x 100–300、y 100–200
    expect(alignContentPatch(shape, AREA, "left", 100)).toEqual({ x: 30 });
    expect(alignContentPatch(shape, AREA, "right", 100)).toEqual({ x: 350 });
    expect(alignContentPatch(shape, AREA, "centerX", 100)).toEqual({ x: 190 });
    expect(alignContentPatch(shape, AREA, "top", 100)).toEqual({ y: 40 });
    expect(alignContentPatch(shape, AREA, "bottom", 100)).toEqual({ y: 640 });
    expect(alignContentPatch(shape, AREA, "centerY", 100)).toEqual({ y: 340 });
  });

  it("aligns the outline after rotation and keeps the rotation", () => {
    const shape = rect({ rotation: 45 });
    for (const edge of ["left", "right", "top", "bottom"] as const) {
      const moved = apply(shape, alignContentPatch(shape, AREA, edge, 100));
      const bounds = getElementBounds(moved);
      const side = { left: "minX", right: "maxX", top: "minY", bottom: "maxY" } as const;
      expect(bounds[side[edge]]).toBeCloseTo(AREA[side[edge]]);
      expect(moved.rotation).toBe(45);
    }
  });

  it("uses the given height for text (the measured block, not the estimate)", () => {
    const t = text();
    const moved = apply(t, alignContentPatch(t, AREA, "bottom", 33));
    expect(moved.y + 33).toBeCloseTo(740);
  });

  it("returns null when the element is already there", () => {
    const shape = rect({ x: 30 });
    expect(alignContentPatch(shape, AREA, "left", 100)).toBeNull();
  });
});

describe("rotatedBoxBounds", () => {
  it("matches getElementBounds", () => {
    const shape = rect({ rotation: 30 });
    close(rotatedBoxBounds(shape, { minX: 0, minY: 0, maxX: 200, maxY: 100 }, 30), getElementBounds(shape));
  });
});
