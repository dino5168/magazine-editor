import { describe, expect, it } from "vitest";
import { createImageElement, createShapeElement, createTextElement } from "../element-factory";
import { MIN_ELEMENT_SIZE_PT } from "../geometry";
import {
  clampCornerRadius,
  clampVertexCount,
  formatNumber,
  innerRatioFromPercent,
  normalizeRotation,
  parseNumberDraft,
  resizePatch,
} from "../properties";
import { isShapeGeometry } from "../validation";

describe("parseNumberDraft", () => {
  it("accepts finite numbers with surrounding spaces", () => {
    expect(parseNumberDraft(" 12.5 ")).toBe(12.5);
    expect(parseNumberDraft("-3")).toBe(-3);
  });

  it("rejects empty and non-numeric text", () => {
    for (const bad of ["", "  ", "abc", "1e999", "12pt"]) expect(parseNumberDraft(bad)).toBeNull();
  });
});

describe("formatNumber", () => {
  it("shows at most two decimals without trailing zeros or -0", () => {
    expect(formatNumber(595.2755905511812)).toBe("595.28");
    expect(formatNumber(12)).toBe("12");
    expect(formatNumber(-0.001)).toBe("0");
  });
});

describe("normalizeRotation", () => {
  it("maps any angle into (-180, 180]", () => {
    expect(normalizeRotation(370)).toBe(10);
    expect(normalizeRotation(-190)).toBe(170);
    expect(normalizeRotation(180)).toBe(180);
    expect(normalizeRotation(-180)).toBe(180);
    expect(normalizeRotation(0)).toBe(0);
  });
});

describe("geometry fields", () => {
  it("limits the corner radius to half the shorter side", () => {
    expect(clampCornerRadius({ width: 200, height: 100 }, 80)).toBe(50);
    expect(clampCornerRadius({ width: 200, height: 100 }, -3)).toBe(0);
    expect(clampCornerRadius({ width: 200, height: 100 }, 12.5)).toBe(12.5);
  });

  it("rounds and clamps side / point counts", () => {
    expect(clampVertexCount(5.4)).toBe(5);
    expect(clampVertexCount(1)).toBe(3);
    expect(clampVertexCount(100)).toBe(24);
  });

  it("turns the inner radius percentage into a ratio within 10–90%", () => {
    expect(innerRatioFromPercent(40)).toBe(0.4);
    expect(innerRatioFromPercent(0)).toBe(0.1);
    expect(innerRatioFromPercent(100)).toBe(0.9);
  });

  it("accepts only geometry the exports can draw", () => {
    expect(isShapeGeometry({ kind: "rect", cornerRadius: 0 })).toBe(true);
    expect(isShapeGeometry({ kind: "rect", cornerRadius: -1 })).toBe(false);
    expect(isShapeGeometry({ kind: "ellipse" })).toBe(true);
    expect(isShapeGeometry({ kind: "polygon", sides: 7 })).toBe(true);
    expect(isShapeGeometry({ kind: "polygon", sides: 2.5 })).toBe(false);
    expect(isShapeGeometry({ kind: "polygon", sides: 1001 })).toBe(false);
    expect(isShapeGeometry({ kind: "star", numPoints: 5, innerRatio: 1 })).toBe(true);
    expect(isShapeGeometry({ kind: "star", numPoints: 5, innerRatio: 0 })).toBe(false);
    expect(isShapeGeometry({ kind: "triangle" })).toBe(false);
  });
});

describe("resizePatch", () => {
  const shape = { ...createShapeElement("rect", { x: 0, y: 0 }), width: 200, height: 100 };

  it("changes one side, or both when keeping the ratio", () => {
    expect(resizePatch(shape, { width: 300 }, false)).toEqual({ width: 300 });
    expect(resizePatch(shape, { width: 300 }, true)).toEqual({ width: 300, height: 150 });
    expect(resizePatch(shape, { height: 50 }, true)).toEqual({ width: 100, height: 50 });
  });

  it("never goes below the minimum size", () => {
    expect(resizePatch(shape, { width: -10 }, false)).toEqual({ width: MIN_ELEMENT_SIZE_PT });
    const image = createImageElement("a.png", { width: 100, height: 10 }, { width: 1000, height: 1000 }, { x: 0, y: 0 });
    expect(resizePatch(image, { width: 20 }, true)).toEqual({ width: 20, height: MIN_ELEMENT_SIZE_PT });
  });

  it("only changes the wrapping width of text", () => {
    const text = createTextElement("body", { x: 0, y: 0 });
    expect(resizePatch(text, { width: 150 }, true)).toEqual({ width: 150 });
    expect(resizePatch(text, { height: 150 }, true)).toEqual({});
  });
});
