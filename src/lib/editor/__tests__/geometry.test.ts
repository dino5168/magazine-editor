import { describe, expect, it } from "vitest";
import { estimateTextHeight, getContentBounds, getElementBounds } from "../geometry";
import { createPage, createTextElement } from "../element-factory";
import type { ShapeElement } from "../types";

const rect: ShapeElement = {
  id: "r",
  type: "shape",
  x: 10,
  y: 20,
  rotation: 0,
  width: 100,
  height: 50,
  geometry: { kind: "rect", cornerRadius: 0 },
  fill: "#000000",
  stroke: null,
  label: null,
};

describe("getElementBounds", () => {
  it("returns the rectangle itself when not rotated", () => {
    expect(getElementBounds(rect)).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 70 });
  });

  it("rotates around the element origin (clockwise, y-down)", () => {
    const bounds = getElementBounds({ ...rect, rotation: 90 });

    expect(bounds.minX).toBeCloseTo(-40);
    expect(bounds.maxX).toBeCloseTo(10);
    expect(bounds.minY).toBeCloseTo(20);
    expect(bounds.maxY).toBeCloseTo(120);
  });

  it("uses the box for every shape kind, not only rectangles", () => {
    expect(getElementBounds({ ...rect, geometry: { kind: "star", numPoints: 5, innerRatio: 0.4 } })).toEqual({
      minX: 10,
      minY: 20,
      maxX: 110,
      maxY: 70,
    });
  });
});

describe("estimateTextHeight", () => {
  it("wraps CJK text by width", () => {
    const text = { ...createTextElement("body", { x: 0, y: 0 }), text: "一二三四五六七八九十", fontSize: 10, width: 50 };

    // 10 個全形字 × 10pt = 100pt，寬 50pt → 2 行
    expect(estimateTextHeight(text)).toBeCloseTo(2 * 10 * 1.2);
  });

  it("counts explicit line breaks", () => {
    const text = { ...createTextElement("body", { x: 0, y: 0 }), text: "a\nb\nc", fontSize: 10, width: 500 };

    expect(estimateTextHeight(text)).toBeCloseTo(3 * 10 * 1.2);
  });
});

describe("getContentBounds", () => {
  it("includes elements dragged outside the page", () => {
    const page = { ...createPage("P", { width: 100, height: 100 }, "#ffffff"), elements: [{ ...rect, x: -300, y: 500 }] };

    expect(getContentBounds(page)).toEqual({ minX: -300, minY: 0, maxX: 100, maxY: 550 });
  });
});
