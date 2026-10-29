import { describe, expect, it } from "vitest";
import { createShapeElement } from "../element-factory";
import {
  LABEL_PADDING_PT,
  createLabel,
  labelAsText,
  labelFrame,
  labelLayoutKey,
  labelTextOffset,
  shapeToPage,
  textBlockHeight,
} from "../shape-label";
import { shapePoints } from "../shape-geometry";
import type { ShapeElement, ShapeGeometry } from "../types";
import { isShapeLabel } from "../validation";

const shape = { ...createShapeElement("rect", { x: 0, y: 0 }), x: 100, y: 200, width: 120, height: 80 };

describe("labelFrame", () => {
  it("insets the shape's box by the padding", () => {
    expect(labelFrame(shape)).toEqual({ x: 4, y: 4, width: 112, height: 72 });
  });

  it("never gets a non-positive width for tiny shapes", () => {
    const tiny = { ...shape, width: 4, height: 4 };
    expect(labelFrame(tiny)).toMatchObject({ width: 1, height: 0 });
  });

  // 文字框加回內縮，就是放文字的區域（外框座標）
  const region = (s: ShapeElement) => {
    const frame = labelFrame(s);
    return { x: frame.x - LABEL_PADDING_PT, y: frame.y - LABEL_PADDING_PT, width: frame.width + 2 * LABEL_PADDING_PT, height: frame.height + 2 * LABEL_PADDING_PT };
  };
  const withGeometry = (geometry: ShapeGeometry): ShapeElement => ({ ...shape, geometry });

  it("keeps ellipse text inside the ellipse: the inscribed rectangle with the box's proportions", () => {
    const box = region(withGeometry({ kind: "ellipse" }));
    expect(box.width).toBeCloseTo(120 / Math.SQRT2);
    expect(box.height).toBeCloseTo(80 / Math.SQRT2);
    // 角落剛好在橢圓上
    expect(((box.x - 60) / 60) ** 2 + ((box.y - 40) / 40) ** 2).toBeCloseTo(1);
  });

  it("finds the largest rectangle in a triangle and a diamond", () => {
    // 三角形（頂點朝上、拉伸到外框）：最大的同比例矩形是一半寬高、貼著底邊
    const triangle = region(withGeometry({ kind: "polygon", sides: 3 }));
    expect(triangle.width).toBeCloseTo(60, 1);
    expect(triangle.height).toBeCloseTo(40, 1);
    expect(triangle.x).toBeCloseTo(30, 1);
    expect(triangle.y + triangle.height).toBeCloseTo(80, 1);
    // 四邊形是菱形：同樣是一半，置中
    expect(region(withGeometry({ kind: "polygon", sides: 4 }))).toMatchObject({ x: expect.closeTo(30, 1), y: expect.closeTo(20, 1), width: expect.closeTo(60, 1) });
  });

  it("keeps star text inside the star, as large as fits", () => {
    const star = withGeometry({ kind: "star", numPoints: 5, innerRatio: 0.4 });
    const points = shapePoints(star.geometry, star.width, star.height)!;
    const inside = (x: number, y: number) => {
      let result = false;
      for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
        const [xi, yi, xj, yj] = [points[i], points[i + 1], points[j], points[j + 1]];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) result = !result;
      }
      return result;
    };
    const edge = (box: { x: number; y: number; width: number; height: number }) =>
      Array.from({ length: 41 }, (_, n) => n / 40).flatMap((t) => [
        [box.x + t * box.width, box.y],
        [box.x + t * box.width, box.y + box.height],
        [box.x, box.y + t * box.height],
        [box.x + box.width, box.y + t * box.height],
      ]);
    const box = region(star);
    expect(box.width).toBeGreaterThan(10);
    const shrunk = { x: box.x + 0.01, y: box.y + 0.01, width: box.width - 0.02, height: box.height - 0.02 };
    expect(edge(shrunk).every(([x, y]) => inside(x, y))).toBe(true);
    // 放大 3% 就放不下
    const grown = { x: box.x - box.width * 0.015, y: box.y - box.height * 0.015, width: box.width * 1.03, height: box.height * 1.03 };
    expect(edge(grown).every(([x, y]) => inside(x, y))).toBe(false);
  });

  it("uses the whole box for rectangles and shape-library shapes", () => {
    expect(labelFrame(withGeometry({ kind: "preset", preset: "cloud", params: {} }))).toEqual(labelFrame(shape));
  });
});

describe("labelTextOffset", () => {
  const frame = labelFrame(shape);
  const twoLines = textBlockHeight(2, 10, 1.2); // 24

  it("aligns the text block to the top, middle or bottom of the frame", () => {
    expect(labelTextOffset(frame, "top", twoLines)).toBe(0);
    expect(labelTextOffset(frame, "middle", twoLines)).toBe(24);
    expect(labelTextOffset(frame, "bottom", twoLines)).toBe(48);
  });

  it("lets centred text overflow on both sides", () => {
    expect(labelTextOffset(frame, "middle", 100)).toBe(-14);
  });
});

describe("shapeToPage", () => {
  it("rotates shape-local points clockwise around the shape's origin", () => {
    const point = shapeToPage({ ...shape, rotation: 90 }, { x: 10, y: 0 });
    expect(point.x).toBeCloseTo(100);
    expect(point.y).toBeCloseTo(210);
  });
});

describe("labelAsText", () => {
  it("describes the label as a text element with the frame's width, rotated with the shape", () => {
    const label = { ...createLabel("標題"), fontSize: 20, align: "left" as const };
    const text = labelAsText({ ...shape, rotation: 30 }, label, { x: LABEL_PADDING_PT, y: 10 });
    expect(text).toMatchObject({
      id: labelLayoutKey(shape.id),
      type: "text",
      text: "標題",
      width: 112,
      fontSize: 20,
      align: "left",
      rotation: 30,
    });
    expect(text).not.toHaveProperty("verticalAlign");
  });
});

describe("isShapeLabel", () => {
  it("accepts the default label and rejects malformed ones", () => {
    const label = createLabel("文字");
    expect(isShapeLabel(label)).toBe(true);
    expect(isShapeLabel(null)).toBe(false);
    expect(isShapeLabel({ ...label, fontSize: 2 })).toBe(false);
    expect(isShapeLabel({ ...label, verticalAlign: "center" })).toBe(false);
    expect(isShapeLabel({ ...label, fill: "red" })).toBe(false);
    expect(isShapeLabel({ ...label, text: 1 })).toBe(false);
  });
});
