import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  SWATCH_NAME_MAX_LENGTH,
  clampFontSize,
  isElementColor,
  isHexColor,
  isStroke,
  isSwatch,
  isSwatchColor,
  isSwatchLink,
  isSwatchList,
  isTextShadow,
  validateImageFile,
  validateName,
} from "../validation";
import { createImageElement, describeElement, createTextElement } from "../element-factory";
import { formatPageSize, mmToPt, ptToMm } from "../units";

describe("validateImageFile", () => {
  it("accepts supported images within the size limit", () => {
    const file = { name: "a.png", type: "image/png", size: 1024 };
    expect(validateImageFile(file)).toEqual({ data: file, error: null });
    const svg = { name: "logo.svg", type: "image/svg+xml", size: 1024 };
    expect(validateImageFile(svg)).toEqual({ data: svg, error: null });
  });

  it("rejects unsupported types and oversized files", () => {
    expect(validateImageFile({ name: "a.svgz", type: "image/svg+xml-compressed", size: 10 }).error).toBeInstanceOf(Error);
    expect(validateImageFile({ name: "a.pdf", type: "application/pdf", size: 10 }).error).toBeInstanceOf(Error);
    expect(validateImageFile({ name: "big.jpg", type: "image/jpeg", size: MAX_UPLOAD_BYTES + 1 }).error).toBeInstanceOf(
      Error,
    );
  });
});

describe("validateName", () => {
  it("trims and enforces length in code points", () => {
    expect(validateName("  封面  ", 50)).toEqual({ data: "封面", error: null });
    expect(validateName("😀".repeat(3), 3).data).toBe("😀😀😀");
    expect(validateName("😀".repeat(4), 3).error).toBeInstanceOf(Error);
    expect(validateName("\t", 3).error).toBeInstanceOf(Error);
  });
});

describe("swatches", () => {
  const swatch = { id: "s1", name: "品牌紅", color: "#be123c" };

  it("accepts lowercase opaque colors only", () => {
    expect(isSwatchColor("#be123c")).toBe(true);
    for (const bad of ["#BE123C", "#be123c80", "#fff", "red", ""]) expect(isSwatchColor(bad), bad).toBe(false);
  });

  it("checks one swatch: id, trimmed name of limited length, color", () => {
    expect(isSwatch(swatch)).toBe(true);
    expect(isSwatch({ ...swatch, name: "字".repeat(SWATCH_NAME_MAX_LENGTH) })).toBe(true);
    for (const bad of [
      { ...swatch, id: "" },
      { ...swatch, id: "x".repeat(65) },
      { ...swatch, name: " 品牌紅" },
      { ...swatch, name: "" },
      { ...swatch, name: "字".repeat(SWATCH_NAME_MAX_LENGTH + 1) },
      { ...swatch, color: "#BE123C" },
      { id: "s1", name: "品牌紅" },
      null,
    ]) {
      expect(isSwatch(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("requires unique ids and names in a list", () => {
    const other = { id: "s2", name: "墨色", color: "#171717" };
    expect(isSwatchList([])).toBe(true);
    expect(isSwatchList([swatch, other])).toBe(true);
    expect(isSwatchList([swatch, { ...other, id: "s1" }])).toBe(false);
    expect(isSwatchList([swatch, { ...other, name: "品牌紅" }])).toBe(false);
    expect(isSwatchList("x")).toBe(false);
  });

  it("checks the shape of swatch links next to colors", () => {
    expect(isSwatchLink(null)).toBe(true);
    expect(isSwatchLink("s1")).toBe(true);
    for (const bad of [undefined, "", "x".repeat(65), 1]) expect(isSwatchLink(bad), String(bad)).toBe(false);
    // 邊框與陰影都必須帶連結欄位（null = 沒連）
    expect(isStroke({ color: "#000000", swatchId: "s1", width: 1, dash: "solid" })).toBe(true);
    expect(isStroke({ color: "#000000", width: 1, dash: "solid" })).toBe(false);
    expect(isTextShadow({ color: "#00000080", swatchId: null, offsetX: 1, offsetY: 1 })).toBe(true);
    expect(isTextShadow({ color: "#00000080", offsetX: 1, offsetY: 1 })).toBe(false);
  });
});

describe("number and color helpers", () => {
  it("clamps font size, treating NaN as minimum", () => {
    expect(clampFontSize(1)).toBe(6);
    expect(clampFontSize(1000)).toBe(400);
    expect(clampFontSize(Number.NaN)).toBe(6);
  });

  it("accepts only #rrggbb colors", () => {
    expect(isHexColor("#a1B2c3")).toBe(true);
    expect(isHexColor("#fff")).toBe(false);
    expect(isHexColor("red")).toBe(false);
    expect(isHexColor("#a1b2c380")).toBe(false);
  });

  it("accepts #rrggbb and #rrggbbaa element colors", () => {
    expect(isElementColor("#a1B2c3")).toBe(true);
    expect(isElementColor("#a1b2c380")).toBe(true);
    expect(isElementColor("#a1b2c38")).toBe(false);
    expect(isElementColor("#a1b2c3800")).toBe(false);
    expect(isElementColor("#fff")).toBe(false);
  });
});

describe("units", () => {
  it("converts A4 to points and back", () => {
    expect(mmToPt(210)).toBeCloseTo(595.28, 1);
    expect(ptToMm(mmToPt(297))).toBeCloseTo(297);
    expect(formatPageSize({ width: mmToPt(210), height: mmToPt(297) })).toBe("A4 · 210 × 297 mm");
  });
});

describe("element factory", () => {
  it("scales large images to half the page and keeps aspect ratio", () => {
    const image = createImageElement("x.png", { width: 4000, height: 2000 }, { width: 600, height: 800 }, { x: 300, y: 400 });

    expect(image.width).toBeCloseTo(300);
    expect(image.height).toBeCloseTo(150);
    expect(image.x).toBeCloseTo(150);
  });

  it("does not upscale small images", () => {
    const image = createImageElement("x.png", { width: 40, height: 20 }, { width: 600, height: 800 }, { x: 0, y: 0 });

    expect(image).toMatchObject({ width: 40, height: 20 });
  });

  it("describes long text with an ellipsis", () => {
    const text = { ...createTextElement("body", { x: 0, y: 0 }), text: "一二三四五六七八九十一二三四五六七八九十多" };

    expect(describeElement(text)).toBe("一二三四五六七八九十一二三四五六七八九十…");
  });
});
