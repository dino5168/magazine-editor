import { describe, expect, it } from "vitest";
import {
  PALETTE_BASICS,
  PALETTE_FAMILIES,
  PALETTE_STEPS,
  colorAlpha,
  findPaletteColor,
  getPaletteHex,
  oklchToHex,
  withAlpha,
} from "../palette";
import { isHexColor } from "../validation";

describe("palette", () => {
  it("has the 22 classic families, each with every step", () => {
    expect(PALETTE_FAMILIES).toHaveLength(22);
    expect(PALETTE_FAMILIES.map((f) => f.id)).not.toContain("mauve");
    for (const family of PALETTE_FAMILIES) {
      expect(family.shades.map((s) => s.step)).toEqual(PALETTE_STEPS);
      for (const shade of family.shades) expect(isHexColor(shade.hex)).toBe(true);
    }
    expect(PALETTE_BASICS.map((b) => b.hex)).toEqual(["#000000", "#ffffff"]);
  });

  it("converts oklch to hex", () => {
    // 無彩度的灰階沒有 gamut 問題，結果和 Tailwind 官方的 hex 相同
    expect(oklchToHex(55.6, 0, 0)).toBe("#737373");
    expect(oklchToHex(98.5, 0, 0)).toBe("#fafafa");
    expect(oklchToHex(100, 0, 0)).toBe("#ffffff");
    expect(oklchToHex(0, 0, 0)).toBe("#000000");
    expect(getPaletteHex("red", 500)).toBe("#fb2c36");
    expect(getPaletteHex("blue", 600)).toBe("#155dfc");
  });

  it("maps out-of-gamut colors into sRGB without clamping the hue away", () => {
    // fuchsia-500 超出 sRGB：降低彩度後仍是紅紫色（R、B 高，G 低）
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(getPaletteHex("fuchsia", 500).slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(200);
    expect(b).toBeGreaterThan(200);
    expect(g).toBeLessThan(80);
  });

  it("finds a color in the palette, ignoring case and alpha", () => {
    expect(findPaletteColor("#FB2C36")).toEqual({ kind: "shade", family: "red", step: 500 });
    expect(findPaletteColor("#fb2c3680")).toEqual({ kind: "shade", family: "red", step: 500 });
    expect(findPaletteColor("#ffffff")).toEqual({ kind: "basic", id: "white" });
    expect(findPaletteColor("#123456")).toBeNull();
  });

  it("reads and sets opacity", () => {
    expect(colorAlpha("#fb2c36")).toBe(1);
    expect(colorAlpha("#fb2c3680")).toBeCloseTo(128 / 255);
    expect(withAlpha("#fb2c36", 0.5)).toBe("#fb2c3680");
    expect(withAlpha("#fb2c3680", 1)).toBe("#fb2c36");
    expect(withAlpha("#fb2c36", 0)).toBe("#fb2c3600");
    expect(withAlpha("#fb2c36", 2)).toBe("#fb2c36");
    expect(withAlpha("#fb2c36", -1)).toBe("#fb2c3600");
  });

  it("round-trips whole percentages through the stored alpha byte", () => {
    // 透明度 slider 以 1% 為單位；存成一個位元組後再讀回，必須回到同一個百分比
    for (let percent = 0; percent <= 100; percent++) {
      expect(Math.round(colorAlpha(withAlpha("#000000", percent / 100)) * 100)).toBe(percent);
    }
  });

  it("returns the earlier family for colors shared by several grays", () => {
    expect(getPaletteHex("zinc", 50)).toBe(getPaletteHex("neutral", 50));
    expect(findPaletteColor(getPaletteHex("neutral", 50))).toEqual({ kind: "shade", family: "zinc", step: 50 });
  });
});
