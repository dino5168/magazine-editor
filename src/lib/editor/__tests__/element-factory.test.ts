import { describe, expect, it } from "vitest";
import {
  DEFAULT_MARGINS,
  DEFAULT_NEW_PAGE_SETUP,
  MIN_TEXT_WIDTH,
  boundsFromPoints,
  createBlankDocument,
  createShapeElement,
  createShapeInBox,
  createTextFromFile,
  createToolText,
  describeElement,
} from "../element-factory";
import { estimateTextHeight } from "../geometry";
import { presetSize } from "../page-setup";
import { createLabel } from "../shape-label";
import type { Bounds } from "../types";
import { mmToPt } from "../units";

const box: Bounds = { minX: 100, minY: 200, maxX: 300, maxY: 300 };

describe("createBlankDocument", () => {
  it("defaults to one A4 portrait page with 15 mm margins", () => {
    expect(DEFAULT_NEW_PAGE_SETUP).toEqual({ size: presetSize("a4", "portrait"), margins: DEFAULT_MARGINS });
    const document = createBlankDocument();
    expect(document.pages).toHaveLength(1);
    expect(document.pages[0]).toMatchObject(presetSize("a4", "portrait"));
    expect(document.margins).toBe(DEFAULT_MARGINS);
    expect(document.masters).toEqual([]);
    expect(document.pageNumberRules).toEqual([]);
  });

  it("uses the chosen paper size and margins", () => {
    const size = presetSize("b5", "landscape");
    const side = mmToPt(20);
    const margins = { top: side, right: side, bottom: side, left: mmToPt(25) };
    const document = createBlankDocument({ size, margins });
    expect(document.pages).toHaveLength(1);
    expect(document.pages[0]).toMatchObject({ width: size.width, height: size.height });
    expect(document.pages[0].width).toBeGreaterThan(document.pages[0].height);
    expect(document.margins).toEqual(margins);
  });
});

describe("boundsFromPoints", () => {
  it("normalizes a drag in any direction", () => {
    expect(boundsFromPoints({ x: 300, y: 100 }, { x: 100, y: 250 })).toEqual({ minX: 100, minY: 100, maxX: 300, maxY: 250 });
  });
});

describe("createShapeElement", () => {
  it.each(["rect", "roundedRect", "ellipse", "triangle", "star"] as const)("centres a %s on the point", (kind) => {
    const shape = createShapeElement(kind, { x: 50, y: 80 });
    expect(shape).toMatchObject({ type: "shape", rotation: 0, stroke: null, label: null });
    expect(shape.x + shape.width / 2).toBeCloseTo(50);
    expect(shape.y + shape.height / 2).toBeCloseTo(80);
  });

  it("keeps the size the elements panel always used", () => {
    // 外半徑 70 的三角形：寬 70√3、高 105
    const triangle = createShapeElement("triangle", { x: 0, y: 0 });
    expect(triangle.width).toBeCloseTo(70 * Math.sqrt(3));
    expect(triangle.height).toBeCloseTo(105);
    expect(createShapeElement("ellipse", { x: 0, y: 0 })).toMatchObject({ width: 120, height: 120 });
  });
});

describe("createShapeInBox", () => {
  it("fills the box with rectangles and ellipses", () => {
    expect(createShapeInBox("rect", box)).toMatchObject({
      type: "shape",
      x: 100,
      y: 200,
      width: 200,
      height: 100,
      geometry: { kind: "rect", cornerRadius: 0 },
    });
    expect(createShapeInBox("roundedRect", { minX: 0, minY: 0, maxX: 20, maxY: 10 }).geometry).toEqual({
      kind: "rect",
      cornerRadius: 5,
    });
    expect(createShapeInBox("ellipse", box)).toMatchObject({ x: 100, y: 200, width: 200, height: 100, geometry: { kind: "ellipse" } });
  });

  it.each(["triangle", "star"] as const)("fits a %s inside the box with its own proportions, centred", (kind) => {
    const shape = createShapeInBox(kind, box);
    const natural = createShapeElement(kind, { x: 0, y: 0 });

    // 箱子比較扁，高度是限制：上下貼齊，左右置中
    expect(shape.y).toBeCloseTo(box.minY);
    expect(shape.height).toBeCloseTo(box.maxY - box.minY);
    expect(shape.x + shape.width / 2).toBeCloseTo((box.minX + box.maxX) / 2);
    expect(shape.width / shape.height).toBeCloseTo(natural.width / natural.height);
  });

  it("keeps the star's inner / outer ratio", () => {
    expect(createShapeInBox("star", box).geometry).toMatchObject({ kind: "star", numPoints: 5, innerRatio: 30 / 70 });
  });
});

describe("describeElement", () => {
  it("names polygons by their number of sides", () => {
    const triangle = createShapeElement("triangle", { x: 0, y: 0 });
    const withSides = (sides: number) => describeElement({ ...triangle, geometry: { kind: "polygon", sides } });
    expect([3, 4, 5, 6, 8].map(withSides)).toEqual(["三角形", "四邊形", "五邊形", "六邊形", "8 邊形"]);
  });

  it("adds the start of a shape's text to its name", () => {
    const shape = createShapeElement("roundedRect", { x: 0, y: 0 });
    expect(describeElement(shape)).toBe("圓角矩形");
    expect(describeElement({ ...shape, label: createLabel("  本期\n專題報導：城市與河流  ") })).toBe("圓角矩形：本期 專題報導：城市與河…");
    expect(describeElement({ ...shape, label: createLabel("   ") })).toBe("圓角矩形");
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

describe("createTextFromFile", () => {
  it("keeps the text as is, left aligned, centered on the point", () => {
    const text = "# 創刊詞\n\n**我們相信**，每一條街道都有故事。";
    const element = createTextFromFile(text, { width: 595, height: 842 }, { x: 300, y: 400 });
    expect(element.text).toBe(text);
    expect(element.align).toBe("left");
    expect(element.width).toBe(360);
    expect(element.x).toBe(300 - 360 / 2);
    expect(element.y + estimateTextHeight(element) / 2).toBeCloseTo(400);
  });

  it("stays narrower than a small page", () => {
    expect(createTextFromFile("短", { width: 200, height: 300 }, { x: 100, y: 150 }).width).toBe(160);
  });
});
