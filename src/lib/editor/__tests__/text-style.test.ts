import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEXT_SHADOW,
  PLAIN_TEXT_DECORATION,
  konvaFontStyle,
  konvaTextStyle,
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

describe("konvaTextStyle", () => {
  it("turns the shadow off explicitly when there is none", () => {
    expect(konvaTextStyle({ fontStyle: "normal", ...PLAIN_TEXT_DECORATION })).toMatchObject({
      fontStyle: "normal",
      textDecoration: "",
      shadowEnabled: false,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    });
  });

  it("splits the shadow alpha into shadowOpacity and never blurs", () => {
    const style = { fontStyle: "bold", ...PLAIN_TEXT_DECORATION, shadow: { color: "#ff000080", offsetX: 3, offsetY: -2 } } as const;
    expect(konvaTextStyle(style)).toEqual({
      fontStyle: "bold",
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
