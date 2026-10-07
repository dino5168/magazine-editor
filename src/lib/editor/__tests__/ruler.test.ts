import { describe, expect, it } from "vitest";
import { RULER_LABEL_MIN_GAP_PX, RULER_TICK_MIN_GAP_PX, rulerOrigin, rulerScale, rulerTicks, selectionSpans } from "../ruler";
import type { ShapeElement } from "../types";
import { mmToPt } from "../units";
import { ZOOM_MAX, ZOOM_MIN } from "../viewport";

describe("rulerScale", () => {
  it("numbers every 20 mm with 2 mm ticks at 100%", () => {
    expect(rulerScale(1)).toEqual({ majorMm: 20, divisions: 10 });
  });

  it("uses finer steps when zoomed in and coarser ones when zoomed out", () => {
    expect(rulerScale(ZOOM_MAX)).toEqual({ majorMm: 5, divisions: 10 });
    expect(rulerScale(0.5)).toEqual({ majorMm: 50, divisions: 10 });
    expect(rulerScale(ZOOM_MIN)).toEqual({ majorMm: 200, divisions: 10 });
  });

  it("keeps numbers and ticks apart at every zoom", () => {
    for (let zoom = ZOOM_MIN; zoom <= ZOOM_MAX; zoom *= 1.07) {
      const { majorMm, divisions } = rulerScale(zoom);
      const majorPx = mmToPt(majorMm) * zoom;
      expect(majorPx).toBeGreaterThanOrEqual(RULER_LABEL_MIN_GAP_PX);
      expect(majorPx / divisions).toBeGreaterThanOrEqual(RULER_TICK_MIN_GAP_PX);
    }
  });
});

describe("rulerTicks", () => {
  const majorPx = mmToPt(20);

  it("puts 0 at the origin and counts negative values before it", () => {
    const ticks = rulerTicks(100, 300, 1);
    const majors = ticks.filter((tick) => tick.level === "major");

    // -40 在 -13 px：尺規開頭之前，但在預留的一個數字間距內，數字的後半段仍看得到
    expect(majors.map((tick) => tick.label)).toEqual([-40, -20, 0, 20, 40, 60]);
    expect(majors[2]?.px).toBe(100);
    expect(majors[1]?.px).toBeCloseTo(100 - majorPx);
  });

  it("marks the middle tick of each major interval as half", () => {
    const ticks = rulerTicks(0, 100, 1).filter((tick) => tick.px >= 0);

    expect(ticks.slice(0, 6).map((tick) => tick.level)).toEqual(["major", "minor", "minor", "minor", "minor", "half"]);
    expect(ticks[5]?.px).toBeCloseTo(mmToPt(10));
  });

  it("only lists ticks within the ruler plus one label gap before it", () => {
    const ticks = rulerTicks(-1000, 400, 1);

    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) {
      expect(tick.px).toBeGreaterThanOrEqual(-RULER_LABEL_MIN_GAP_PX);
      expect(tick.px).toBeLessThanOrEqual(400);
    }
    // 600 px 外的原點：開頭的數字是正值，而且沒有 -0
    expect(ticks.find((tick) => tick.level === "major")?.label).toBeGreaterThan(0);
  });

  it("never labels zero as -0", () => {
    const zero = rulerTicks(0, 10, 1).find((tick) => tick.label !== undefined && Math.abs(tick.label) < 1e-9);

    expect(Object.is(zero?.label, 0)).toBe(true);
  });

  it("returns nothing for an empty ruler", () => {
    expect(rulerTicks(0, 0, 1)).toEqual([]);
    expect(rulerTicks(Number.NaN, 100, 1)).toEqual([]);
  });
});

describe("rulerOrigin", () => {
  it("is the active page's top-left corner on screen", () => {
    const layout = { contentWidth: 2000, contentHeight: 2000, offsetX: 300, offsetY: 120 };

    expect(rulerOrigin(layout, 2, { x: 50, y: 20 }, 0)).toEqual({ x: 250, y: 100 });
    // 跨頁的右頁：加上左頁寬（Layer 座標）× zoom
    expect(rulerOrigin(layout, 2, { x: 50, y: 20 }, 420)).toEqual({ x: 1090, y: 100 });
  });
});

describe("selectionSpans", () => {
  const rect: ShapeElement = {
    id: "r",
    type: "shape",
    x: 10,
    y: 20,
    rotation: 0,
    width: 100,
    height: 50,
    geometry: { kind: "rect", cornerRadius: 0 },
    fill: "#000000",
    stroke: null,
    label: null,
  };

  it("is null without a selection", () => {
    expect(selectionSpans([], { x: 0, y: 0 }, 1)).toBeNull();
  });

  it("maps the union of the selected bounds to screen px", () => {
    const other = { ...rect, id: "o", x: 300, y: 0, width: 20, height: 10 };

    expect(selectionSpans([rect, other], { x: 50, y: 40 }, 2)).toEqual({
      x: { start: 50 + 10 * 2, end: 50 + 320 * 2 },
      y: { start: 40 + 0, end: 40 + 70 * 2 },
    });
  });

  it("uses the rotated outer bounds", () => {
    // 繞左上角轉 90°：外框變成 x ∈ [10 − 50, 10]、y ∈ [20, 20 + 100]
    const spans = selectionSpans([{ ...rect, rotation: 90 }], { x: 0, y: 0 }, 1);

    expect(spans?.x.start).toBeCloseTo(-40);
    expect(spans?.x.end).toBeCloseTo(10);
    expect(spans?.y.start).toBeCloseTo(20);
    expect(spans?.y.end).toBeCloseTo(120);
  });
});