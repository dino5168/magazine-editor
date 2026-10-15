import { describe, expect, it } from "vitest";
import {
  DEFAULT_MARGINS,
  DEFAULT_NEW_PAGE_SETUP,
  MIN_TEXT_WIDTH,
  TEXT_PRESETS,
  boundsFromPoints,
  builtInTextStyle,
  choiceGeometry,
  choicePreset,
  createBlankDocument,
  createPresetShapeElement,
  createShapeElement,
  createShapeInBox,
  createStyledText,
  createTextElement,
  createTextFromFile,
  createToolText,
  describeElement,
  presetChoice,
  shapeChoiceOf,
} from "../element-factory";
import { estimateTextHeight } from "../geometry";
import { presetSize } from "../page-setup";
import { createLabel } from "../shape-label";
import { findShapePreset } from "../shape-presets";
import { defaultTextStyles } from "../style-sheet";
import { BUILT_IN_SWATCH_IDS, defaultSwatches, hasValidSwatchLinks } from "../swatches";
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

  it("starts with 文字 / 黑 / 白 and the built-in text styles following 文字", () => {
    const document = createBlankDocument();
    expect(document.swatches).toEqual(defaultSwatches());
    expect(document.textStyles.map((style) => style.fillSwatchId)).toEqual([BUILT_IN_SWATCH_IDS.text, BUILT_IN_SWATCH_IDS.text, BUILT_IN_SWATCH_IDS.text]);
    expect(hasValidSwatchLinks(document, document)).toBe(true);
    // 舊檔升級用的內建樣式（和 Rust 共用 fixture）不連色票
    expect(defaultTextStyles().every((style) => style.fillSwatchId === null)).toBe(true);
    // 文字面板 / 文字工具建立的文字跟著樣式連到「文字」；沒連樣式的文字不連色票
    const body = document.textStyles.find((style) => style.name === "內文")!;
    expect(createStyledText(body, { x: 0, y: 0 }).fillSwatchId).toBe(BUILT_IN_SWATCH_IDS.text);
    expect(createToolText({ x: 0, y: 0 }, null, body).fillSwatchId).toBe(BUILT_IN_SWATCH_IDS.text);
    expect(createTextElement("body", { x: 0, y: 0 }).fillSwatchId).toBeNull();
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

describe("shape choices", () => {
  it("picks shape-library shapes by `preset:<id>`", () => {
    expect(presetChoice("cloud")).toBe("preset:cloud");
    expect(choicePreset("preset:cloud")?.id).toBe("cloud");
    expect(choicePreset("rect")).toBeUndefined();
    expect(choicePreset("preset:future-shape")).toBeUndefined();
  });

  it("creates library shapes by click or drag, and a rectangle for an unknown id", () => {
    expect(createShapeElement("preset:cloud", { x: 100, y: 100 }).geometry).toEqual({ kind: "preset", preset: "cloud", params: {} });
    const box = { minX: 10, minY: 20, maxX: 310, maxY: 80 };
    expect(createShapeInBox("preset:hexagon", box)).toMatchObject({
      x: 10,
      y: 20,
      width: 300,
      height: 60,
      geometry: { kind: "preset", preset: "hexagon", params: { size: 0.25 } },
    });
    expect(createShapeElement("preset:future-shape", { x: 0, y: 0 }).geometry).toEqual({ kind: "rect", cornerRadius: 0 });
    expect(createShapeInBox("preset:future-shape", box).geometry).toEqual({ kind: "rect", cornerRadius: 0 });
  });
});

describe("shapeChoiceOf / choiceGeometry", () => {
  it("finds the option each shape comes from", () => {
    const at = { x: 0, y: 0 };
    expect((["rect", "roundedRect", "ellipse", "triangle", "star", "preset:cloud"] as const).map((kind) => shapeChoiceOf(createShapeElement(kind, at)))).toEqual([
      "rect",
      "roundedRect",
      "ellipse",
      "triangle",
      "star",
      "preset:cloud",
    ]);
    // 六邊形的正多邊形不是任何選項
    const hexagon = { ...createShapeElement("triangle", at), geometry: { kind: "polygon", sides: 6 } } as const;
    expect(shapeChoiceOf(hexagon)).toBeNull();
  });

  it("gives the new shape's default geometry, a rounded rectangle limited to the box", () => {
    expect(choiceGeometry("preset:cylinder", { width: 100, height: 100 })).toEqual({ kind: "preset", preset: "cylinder", params: { size: 15 } });
    expect(choiceGeometry("star", { width: 100, height: 100 })).toMatchObject({ kind: "star", numPoints: 5 });
    expect(choiceGeometry("roundedRect", { width: 100, height: 20 })).toEqual({ kind: "rect", cornerRadius: 10 });
    expect(choiceGeometry("preset:future-shape", { width: 100, height: 100 })).toEqual({ kind: "rect", cornerRadius: 0 });
  });
});

describe("createPresetShapeElement", () => {
  it("centres the shape at its default size and stores every parameter's default", () => {
    const shape = createPresetShapeElement(findShapePreset("cylinder")!, { x: 100, y: 200 });
    expect(shape).toMatchObject({ x: 50, y: 140, width: 100, height: 120, stroke: null, label: null });
    expect(shape.geometry).toEqual({ kind: "preset", preset: "cylinder", params: { size: 15 } });
  });
});

describe("describeElement", () => {
  it("names shape-library shapes by the library, and unknown ones generically", () => {
    const hexagon = createPresetShapeElement(findShapePreset("hexagon")!, { x: 0, y: 0 });
    expect(describeElement(hexagon)).toBe("六角形");
    expect(describeElement({ ...hexagon, geometry: { kind: "preset", preset: "future-shape", params: {} } })).toBe("圖形");
  });

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
    const text = createToolText({ x: 50, y: 80 }, null, null);
    expect(text).toMatchObject({ type: "text", text: "", x: 50, align: "left" });
    // 內文的行距 1.5
    expect(text.lineHeight).toBe(1.5);
    expect(text.y + (text.fontSize * 1.5) / 2).toBeCloseTo(80);
  });

  it("uses the dragged box for position and wrapping width, with a minimum width", () => {
    expect(createToolText({ x: 0, y: 0 }, box, null)).toMatchObject({ x: 100, y: 200, width: 200 });
    expect(createToolText({ x: 0, y: 0 }, { minX: 10, minY: 10, maxX: 15, maxY: 12 }, null).width).toBe(MIN_TEXT_WIDTH);
  });

  it("links to the document's 內文 style, or uses the built-in 內文 values unlinked", () => {
    const body = { ...builtInTextStyle("body"), fontSize: 12, fill: "#1e3a8a" };
    expect(createToolText({ x: 0, y: 0 }, null, body)).toMatchObject({ styleId: body.id, fontSize: 12, fill: "#1e3a8a" });
    expect(createToolText({ x: 0, y: 0 }, null, null)).toMatchObject({ styleId: null, fontSize: 11, align: "left" });
  });
});

describe("createStyledText", () => {
  it("links the style and uses the built-in placeholder for built-in styles", () => {
    const heading = builtInTextStyle("heading");
    const text = createStyledText(heading, { x: 300, y: 100 });
    expect(text).toMatchObject({ styleId: heading.id, text: TEXT_PRESETS.heading.text, width: TEXT_PRESETS.heading.width, fontSize: 32 });
    expect(text.x + text.width / 2).toBe(300);
  });

  it("shows the name of other styles", () => {
    const custom = { ...builtInTextStyle("body"), id: "custom", name: "引言", italic: true };
    expect(createStyledText(custom, { x: 0, y: 0 })).toMatchObject({ styleId: "custom", text: "引言", italic: true });
  });

  it("createTextElement uses the built-in values without linking", () => {
    expect(createTextElement("body", { x: 0, y: 0 })).toMatchObject({ styleId: null, fontSize: 11, align: "left" });
    expect(createTextElement("heading", { x: 0, y: 0 })).toMatchObject({ styleId: null, fontSize: 32, fontStyle: "bold", align: "center" });
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
