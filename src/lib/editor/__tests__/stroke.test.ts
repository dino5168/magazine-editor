import { describe, expect, it } from "vitest";
import { DEFAULT_STROKE, dashPattern, konvaStroke } from "../stroke";
import { isStroke } from "../validation";

describe("dashPattern", () => {
  // 和 Rust render.rs 的 dash_patterns_scale_with_the_width 是同一組數字
  it("scales with the width, same numbers as the exports", () => {
    expect(dashPattern("solid", 2)).toBeNull();
    expect(dashPattern("dashed", 2)).toEqual({ dash: 6, gap: 6, roundCap: false });
    expect(dashPattern("dotted", 2)).toEqual({ dash: 0, gap: 4, roundCap: true });
  });
});

describe("konvaStroke", () => {
  it("turns the stroke off for null", () => {
    expect(konvaStroke(null)).toEqual({ strokeEnabled: false });
  });

  it("uses round caps only for dotted lines", () => {
    expect(konvaStroke({ color: "#000000", width: 4, dash: "dotted" })).toMatchObject({
      stroke: "#000000",
      strokeWidth: 4,
      dash: [0, 8],
      dashEnabled: true,
      lineCap: "round",
    });
    expect(konvaStroke(DEFAULT_STROKE)).toMatchObject({ dashEnabled: false, lineCap: "butt" });
  });
});

describe("isStroke", () => {
  it("accepts the default stroke and rejects malformed ones", () => {
    expect(isStroke(DEFAULT_STROKE)).toBe(true);
    expect(isStroke({ ...DEFAULT_STROKE, color: "#17171780" })).toBe(true);
    expect(isStroke(null)).toBe(false);
    expect(isStroke({ ...DEFAULT_STROKE, width: 0 })).toBe(false);
    expect(isStroke({ ...DEFAULT_STROKE, width: Number.NaN })).toBe(false);
    expect(isStroke({ ...DEFAULT_STROKE, dash: "double" })).toBe(false);
    expect(isStroke({ ...DEFAULT_STROKE, color: "black" })).toBe(false);
  });
});
