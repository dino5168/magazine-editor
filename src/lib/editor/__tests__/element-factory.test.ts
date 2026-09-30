import { describe, expect, it } from "vitest";
import { MIN_TEXT_WIDTH, boundsFromPoints, createShapeInBox, createToolText } from "../element-factory";
import type { Bounds, CanvasElement } from "../types";

const box: Bounds = { minX: 100, minY: 200, maxX: 300, maxY: 300 };

// Konva 的實際頂點（和 fitRegular 用同一套公式，但獨立寫一次以免測試跟著實作錯）
function vertices(element: CanvasElement): { x: number; y: number }[] {
  const [radii, count] =
    element.type === "polygon"
      ? [[element.radius], element.sides]
      : element.type === "star"
        ? [[element.outerRadius, element.innerRadius], element.numPoints * 2]
        : [[], 0];
  return Array.from({ length: count }, (_, n) => {
    const angle = (n * 2 * Math.PI) / count;
    const radius = radii[n % radii.length];
    return { x: element.x + radius * Math.sin(angle), y: element.y - radius * Math.cos(angle) };
  });
}

describe("boundsFromPoints", () => {
  it("normalizes a drag in any direction", () => {
    expect(boundsFromPoints({ x: 300, y: 100 }, { x: 100, y: 250 })).toEqual({ minX: 100, minY: 100, maxX: 300, maxY: 250 });
  });
});

describe("createShapeInBox", () => {
  it("fills the box with rectangles and ellipses", () => {
    expect(createShapeInBox("rect", box)).toMatchObject({ type: "rect", x: 100, y: 200, width: 200, height: 100, cornerRadius: 0 });
    expect(createShapeInBox("roundedRect", { minX: 0, minY: 0, maxX: 20, maxY: 10 })).toMatchObject({ cornerRadius: 5 });
    expect(createShapeInBox("ellipse", box)).toMatchObject({ type: "ellipse", x: 200, y: 250, radiusX: 100, radiusY: 50 });
  });

  it.each(["triangle", "star"] as const)("fits a %s inside the box, touching it and centred", (kind) => {
    const element = createShapeInBox(kind, box);
    const points = vertices(element);
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];

    const epsilon = 1e-9;
    expect(minX).toBeGreaterThanOrEqual(box.minX - epsilon);
    expect(maxX).toBeLessThanOrEqual(box.maxX + epsilon);
    expect(minY).toBeGreaterThanOrEqual(box.minY - epsilon);
    expect(maxY).toBeLessThanOrEqual(box.maxY + epsilon);
    // 箱子比較扁，高度是限制：上下貼齊，左右置中
    expect(minY).toBeCloseTo(box.minY);
    expect(maxY).toBeCloseTo(box.maxY);
    expect((minX + maxX) / 2).toBeCloseTo((box.minX + box.maxX) / 2);
  });

  it("keeps the star's inner / outer ratio", () => {
    const star = createShapeInBox("star", box);
    if (star.type !== "star") throw new Error("expected a star");
    expect(star.innerRadius / star.outerRadius).toBeCloseTo(30 / 70);
  });
});

describe("createToolText", () => {
  it("centres the first line on a click point", () => {
    const text = createToolText({ x: 50, y: 80 }, null);
    expect(text).toMatchObject({ type: "text", text: "", x: 50, align: "left" });
    expect(text.y + (text.fontSize * 1.2) / 2).toBeCloseTo(80);
  });

  it("uses the dragged box for position and wrapping width, with a minimum width", () => {
    expect(createToolText({ x: 0, y: 0 }, box)).toMatchObject({ x: 100, y: 200, width: 200 });
    expect(createToolText({ x: 0, y: 0 }, { minX: 10, minY: 10, maxX: 15, maxY: 12 }).width).toBe(MIN_TEXT_WIDTH);
  });
});
