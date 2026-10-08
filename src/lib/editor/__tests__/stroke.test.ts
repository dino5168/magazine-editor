import { describe, expect, it } from "vitest";
import { FACTORY_LINE_STYLES } from "@/lib/preferences/preferences";
import { colorAlpha } from "../palette";
import { CONTENT_GUIDE_EMPHASIS, DEFAULT_STROKE, dashPattern, guideLineAttrs, konvaStroke } from "../stroke";
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

describe("guideLineAttrs", () => {
  const style = { color: "#ff0000", dash: "dashed", width: 2 } as const;

  it("keeps the width and dashes in screen px by dividing by the zoom", () => {
    expect(guideLineAttrs(style, 1)).toEqual({ stroke: "#ff0000", strokeWidth: 2, dash: [6, 6], dashEnabled: true, lineCap: "butt" });
    expect(guideLineAttrs(style, 2)).toMatchObject({ strokeWidth: 1, dash: [3, 3] });
    expect(guideLineAttrs(style, 0.5)).toMatchObject({ strokeWidth: 4, dash: [12, 12] });
  });

  it("draws solid lines without dashes and dotted lines with round caps", () => {
    expect(guideLineAttrs({ ...style, dash: "solid" }, 1)).toMatchObject({ dash: undefined, dashEnabled: false, lineCap: "butt" });
    expect(guideLineAttrs({ ...style, dash: "dotted" }, 2)).toMatchObject({ dash: [0, 2], dashEnabled: true, lineCap: "round" });
  });

  it("makes 1/2 content guides thicker and 1/4 ones lighter, like before the styles existed", () => {
    const guide = FACTORY_LINE_STYLES.contentGuides;
    const half = guideLineAttrs(guide, 1, CONTENT_GUIDE_EMPHASIS.half);
    const quarter = guideLineAttrs(guide, 1, CONTENT_GUIDE_EMPHASIS.quarter);
    expect(half).toMatchObject({ stroke: guide.color, strokeWidth: 1.5, dash: [4.5, 4.5] });
    expect(quarter.strokeWidth).toBe(1);
    // 原本 1/2 線 0.85、1/4 線 0.55
    expect(colorAlpha(half.stroke)).toBeCloseTo(0.85, 2);
    expect(colorAlpha(quarter.stroke)).toBeCloseTo(0.55, 1);
    expect(quarter.stroke.slice(0, 7)).toBe(guide.color.slice(0, 7));
    // 不透明的顏色也會變淡
    expect(colorAlpha(guideLineAttrs(style, 1, CONTENT_GUIDE_EMPHASIS.quarter).stroke)).toBeCloseTo(0.65, 2);
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
