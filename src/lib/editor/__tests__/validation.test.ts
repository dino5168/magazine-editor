import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, clampFontSize, isHexColor, validateImageFile, validateName } from "../validation";
import { createImageElement, describeElement, createTextElement } from "../element-factory";
import { formatPageSize, mmToPt, ptToMm } from "../units";

describe("validateImageFile", () => {
  it("accepts supported images within the size limit", () => {
    const file = { name: "a.png", type: "image/png", size: 1024 };
    expect(validateImageFile(file)).toEqual({ data: file, error: null });
  });

  it("rejects unsupported types and oversized files", () => {
    expect(validateImageFile({ name: "a.svg", type: "image/svg+xml", size: 10 }).error).toBeInstanceOf(Error);
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
