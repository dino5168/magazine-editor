import { describe, expect, it } from "vitest";
import {
  drawnGridSpacing,
  elementsInBox,
  marginBounds,
  estimateTextHeight,
  getContentBounds,
  getElementBounds,
  snapPointToGrid,
  snapToGrid,
} from "../geometry";
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

describe("elementsInBox", () => {
  // rect 外框 (10, 20)–(110, 70)
  it("selects only fully enclosed elements, in layer order", () => {
    const other = { ...rect, id: "o", x: 200 };
    const elements = [other, rect];

    expect(elementsInBox(elements, { minX: 0, minY: 0, maxX: 400, maxY: 100 })).toEqual(["o", "r"]);
    // 只碰到一部分不算
    expect(elementsInBox(elements, { minX: 0, minY: 0, maxX: 109, maxY: 100 })).toEqual([]);
    // 剛好貼齊邊算在內
    expect(elementsInBox(elements, { minX: 10, minY: 20, maxX: 110, maxY: 70 })).toEqual(["r"]);
  });

  it("uses the rotated bounding box", () => {
    // 旋轉 90° 後外框是 (-40, 20)–(10, 120)：未旋轉時的框選範圍不夠
    const rotated = { ...rect, rotation: 90 };
    expect(elementsInBox([rotated], { minX: 0, minY: 0, maxX: 120, maxY: 80 })).toEqual([]);
    expect(elementsInBox([rotated], { minX: -41, minY: 19, maxX: 11, maxY: 121 })).toEqual(["r"]);
  });
});

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

describe("snapToGrid", () => {
  it("rounds to the nearest grid line from the page origin", () => {
    expect(snapToGrid(12, 10)).toBe(10);
    expect(snapToGrid(15, 10)).toBe(20);
    expect(snapToGrid(-4, 10)).toBe(0);
    expect(snapToGrid(-6, 10)).toBe(-10);
    expect(Object.is(snapToGrid(-1, 10), 0)).toBe(true);
  });

  it("leaves the value alone for a non-positive spacing", () => {
    expect(snapToGrid(12.3, 0)).toBe(12.3);
    expect(snapToGrid(12.3, -5)).toBe(12.3);
    expect(snapToGrid(12.3, Number.NaN)).toBe(12.3);
  });

  it("snaps both coordinates of a point", () => {
    expect(snapPointToGrid({ x: 7, y: 23 }, 5)).toEqual({ x: 5, y: 25 });
  });
});

describe("drawnGridSpacing", () => {
  it("draws every line when they are far enough apart", () => {
    expect(drawnGridSpacing(10, 1)).toBe(10);
    expect(drawnGridSpacing(10, 0.6)).toBe(10);
  });

  it("skips lines when zoomed out, staying on the grid", () => {
    // 10 pt × 0.25 = 2.5 px → 每 3 條畫一條（7.5 px）
    expect(drawnGridSpacing(10, 0.25)).toBe(30);
    expect(drawnGridSpacing(2, 0.5)).toBe(12);
  });

  it("leaves invalid input alone", () => {
    expect(drawnGridSpacing(0, 1)).toBe(0);
    expect(drawnGridSpacing(10, 0)).toBe(10);
  });
});

describe("marginBounds", () => {
  it("returns the area inside the margins", () => {
    expect(marginBounds({ width: 600, height: 800 }, { top: 10, right: 20, bottom: 30, left: 40 })).toEqual({
      minX: 40,
      minY: 10,
      maxX: 580,
      maxY: 770,
    });
  });

  it("returns null when there are no margins", () => {
    expect(marginBounds({ width: 600, height: 800 }, { top: 0, right: 0, bottom: 0, left: 0 })).toBeNull();
  });
});
