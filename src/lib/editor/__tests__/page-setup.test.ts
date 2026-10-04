import { describe, expect, it } from "vitest";
import {
  isPageSetupValid,
  orientationOf,
  presetIdOf,
  presetSize,
  validatePageSetup,
  withOrientation,
} from "../page-setup";
import { mmToPt } from "../units";

const A4 = { width: mmToPt(210), height: mmToPt(297) };
const margins = { top: 40, right: 40, bottom: 40, left: 40 };

describe("orientation", () => {
  it("reads and changes the orientation", () => {
    expect(orientationOf(A4)).toBe("portrait");
    expect(orientationOf({ width: 100, height: 100 })).toBe("portrait");
    expect(withOrientation(A4, "portrait")).toBe(A4);
    expect(withOrientation(A4, "landscape")).toEqual({ width: A4.height, height: A4.width });
  });
});

describe("presets", () => {
  it("matches presets in either orientation", () => {
    expect(presetIdOf(A4)).toBe("a4");
    expect(presetIdOf(withOrientation(A4, "landscape"))).toBe("a4");
    expect(presetIdOf({ width: mmToPt(182), height: mmToPt(257) })).toBe("b5");
    expect(presetIdOf({ width: 500, height: 700 })).toBeNull();
  });

  it("returns preset sizes in the wanted orientation", () => {
    expect(presetSize("a4", "portrait")).toEqual(A4);
    expect(presetSize("a4", "landscape")).toEqual({ width: A4.height, height: A4.width });
  });
});

describe("validatePageSetup", () => {
  it("accepts a normal setup", () => {
    expect(isPageSetupValid(validatePageSetup(A4, margins))).toBe(true);
  });

  it("rejects sizes and margins out of range", () => {
    expect(validatePageSetup({ width: mmToPt(5), height: A4.height }, margins).size).toBeDefined();
    expect(validatePageSetup(A4, { ...margins, top: -1 }).margins).toBeDefined();
  });

  it("requires the margins to leave room on the page", () => {
    const errors = validatePageSetup({ width: 100, height: 100 }, { top: 60, bottom: 40, left: 50, right: 49 });
    expect(errors).toEqual({ vertical: "上、下邊界合計必須小於頁高" });
    expect(Object.keys(validatePageSetup({ width: 100, height: 100 }, { top: 60, bottom: 60, left: 60, right: 60 }))).toEqual([
      "horizontal",
      "vertical",
    ]);
  });
});
