import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEXT_SHADOW,
  DEFAULT_TEXT_SPACING,
  LETTER_SPACING_MAX,
  LETTER_SPACING_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  PLAIN_TEXT_DECORATION,
  clampLetterSpacing,
  clampLineHeight,
  hasValidTextSpacing,
  konvaFontStyle,
  konvaTextStyle,
  letterSpacingPt,
  localShadowOffset,
  textDecorationLine,
} from "../text-style";
import { isTextShadow } from "../validation";

describe("konvaFontStyle / textDecorationLine", () => {
  it("combines weight and italic in CSS shorthand order", () => {
    expect(konvaFontStyle({ fontStyle: "normal", italic: false })).toBe("normal");
    expect(konvaFontStyle({ fontStyle: "bold", italic: false })).toBe("bold");
    expect(konvaFontStyle({ fontStyle: "normal", italic: true })).toBe("italic");
    expect(konvaFontStyle({ fontStyle: "bold", italic: true })).toBe("italic bold");
  });

  it("lists the lines to draw", () => {
    expect(textDecorationLine({ underline: false, strikethrough: false })).toBe("");
    expect(textDecorationLine({ underline: true, strikethrough: false })).toBe("underline");
    expect(textDecorationLine({ underline: false, strikethrough: true })).toBe("line-through");
    expect(textDecorationLine({ underline: true, strikethrough: true })).toBe("underline line-through");
  });
});

describe("hasValidTextSpacing", () => {
  it("accepts the range Rust accepts (format.rs validate_text_spacing)", () => {
    expect(hasValidTextSpacing({ ...DEFAULT_TEXT_SPACING })).toBe(true);
    expect(hasValidTextSpacing({ lineHeight: LINE_HEIGHT_MIN, letterSpacing: LETTER_SPACING_MIN })).toBe(true);
    expect(hasValidTextSpacing({ lineHeight: LINE_HEIGHT_MAX, letterSpacing: LETTER_SPACING_MAX })).toBe(true);
    expect(hasValidTextSpacing({ lineHeight: 0.49, letterSpacing: 0 })).toBe(false);
    expect(hasValidTextSpacing({ lineHeight: 1.2, letterSpacing: 1000.5 })).toBe(false);
    expect(hasValidTextSpacing({ lineHeight: Number.NaN, letterSpacing: 0 })).toBe(false);
    expect(hasValidTextSpacing({ lineHeight: 1.2 })).toBe(false);
  });
});

describe("clampLineHeight / clampLetterSpacing", () => {
  it("limits typed values to the range and rounds them", () => {
    expect(clampLineHeight(1.2 + 0.1)).toBe(1.3);
    expect(clampLineHeight(0.1)).toBe(LINE_HEIGHT_MIN);
    expect(clampLineHeight(9)).toBe(LINE_HEIGHT_MAX);
    expect(clampLineHeight(1.234)).toBe(1.23);
    expect(clampLetterSpacing(12.6)).toBe(13);
    expect(clampLetterSpacing(-999)).toBe(LETTER_SPACING_MIN);
    expect(clampLetterSpacing(5000)).toBe(LETTER_SPACING_MAX);
  });
});

describe("konvaTextStyle", () => {
  it("turns the shadow off explicitly when there is none", () => {
    expect(konvaTextStyle({ fontStyle: "normal", fontSize: 10, ...PLAIN_TEXT_DECORATION, ...DEFAULT_TEXT_SPACING })).toMatchObject({
      fontStyle: "normal",
      textDecoration: "",
      shadowEnabled: false,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    });
  });

  it("passes the line height and turns letter spacing (1/1000 of the font size) into pt", () => {
    const style = { fontStyle: "normal", fontSize: 40, ...PLAIN_TEXT_DECORATION, lineHeight: 1.5, letterSpacing: 250 } as const;
    expect(konvaTextStyle(style)).toMatchObject({ lineHeight: 1.5, letterSpacing: 10 });
    expect(konvaTextStyle({ ...style, letterSpacing: -50 }).letterSpacing).toBe(-2);
    expect(letterSpacingPt({ fontSize: 11, letterSpacing: 0 })).toBe(0);
  });

  it("splits the shadow alpha into shadowOpacity and never blurs", () => {
    const style = {
      fontStyle: "bold",
      fontSize: 10,
      ...PLAIN_TEXT_DECORATION,
      ...DEFAULT_TEXT_SPACING,
      shadow: { color: "#ff000080", offsetX: 3, offsetY: -2 },
    } as const;
    expect(konvaTextStyle(style)).toEqual({
      fontStyle: "bold",
      lineHeight: 1.2,
      letterSpacing: 0,
      textDecoration: "",
      shadowEnabled: true,
      shadowColor: "#ff0000",
      shadowOpacity: 128 / 255,
      shadowOffsetX: 3,
      shadowOffsetY: -2,
      shadowBlur: 0,
    });
    expect(konvaTextStyle({ ...style, shadow: { ...style.shadow, color: "#00ff00" } }).shadowOpacity).toBe(1);
  });
});

describe("localShadowOffset", () => {
  it("keeps the offset when the element is not rotated", () => {
    expect(localShadowOffset(DEFAULT_TEXT_SHADOW, 0)).toEqual({ x: 2, y: 2 });
  });

  it("rotates against the element so the shadow keeps pointing the same way on the page", () => {
    // 物件順時針轉 90°：頁面上的「往右」是物件座標的「往上」
    const local = localShadowOffset({ color: "#000000", offsetX: 2, offsetY: 0 }, 90);
    expect(local.x).toBeCloseTo(0);
    expect(local.y).toBeCloseTo(-2);
    // 再用物件的旋轉轉回去，等於原本的頁面偏移
    const back = localShadowOffset({ color: "#000000", offsetX: local.x, offsetY: local.y }, -90);
    expect(back.x).toBeCloseTo(2);
    expect(back.y).toBeCloseTo(0);
  });
});

describe("defaults", () => {
  it("are valid", () => {
    expect(isTextShadow(DEFAULT_TEXT_SHADOW)).toBe(true);
  });
});
