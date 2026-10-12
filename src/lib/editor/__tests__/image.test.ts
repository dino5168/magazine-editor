import { describe, expect, it } from "vitest";
import { svgViewBoxSize } from "../image";

const attrs = (width: string | null, height: string | null, viewBox: string | null) => ({ width, height, viewBox });

describe("svgViewBoxSize", () => {
  it("uses the viewBox when there is no width or height", () => {
    // 瀏覽器這時給 50 × 150（高度固定 150，計畫 16 第 3 節的實測）
    expect(svgViewBoxSize(attrs(null, null, "0 0 100 300"))).toEqual({ width: 100, height: 300 });
    expect(svgViewBoxSize(attrs(null, null, " -10,-10, 24.5 , 12 "))).toEqual({ width: 24.5, height: 12 });
    // % 與 auto 和沒寫一樣
    expect(svgViewBoxSize(attrs("100%", "100%", "0 0 100 300"))).toEqual({ width: 100, height: 300 });
    expect(svgViewBoxSize(attrs("auto", null, "0 0 100 300"))).toEqual({ width: 100, height: 300 });
  });

  it("keeps the browser's size when a width or height is given", () => {
    expect(svgViewBoxSize(attrs("40", "20", "0 0 100 300"))).toBeNull();
    expect(svgViewBoxSize(attrs("50mm", "25mm", "0 0 200 100"))).toBeNull();
    // 只寫一邊時瀏覽器依 viewBox 的比例補另一邊
    expect(svgViewBoxSize(attrs("300", null, "0 0 100 300"))).toBeNull();
    expect(svgViewBoxSize(attrs(null, "2in", "0 0 100 300"))).toBeNull();
  });

  it("keeps the browser's size without a usable viewBox", () => {
    expect(svgViewBoxSize(attrs(null, null, null))).toBeNull();
    expect(svgViewBoxSize(attrs(null, null, "0 0 100"))).toBeNull();
    expect(svgViewBoxSize(attrs(null, null, "0 0 0 300"))).toBeNull();
    expect(svgViewBoxSize(attrs(null, null, "0 0 -1 300"))).toBeNull();
    expect(svgViewBoxSize(attrs(null, null, "a b c d"))).toBeNull();
  });
});
