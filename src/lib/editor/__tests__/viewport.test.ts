import { describe, expect, it } from "vitest";
import { computeLayout, fitZoom, screenToPt, scrollForAnchor } from "../viewport";

const viewport = { width: 800, height: 600 };

describe("computeLayout", () => {
  it("centers content smaller than the viewport", () => {
    const layout = computeLayout({ minX: 0, minY: 0, maxX: 200, maxY: 100 }, 1, viewport);

    expect(layout).toEqual({ contentWidth: 800, contentHeight: 600, offsetX: 300, offsetY: 250 });
  });

  it("shifts the origin when content extends to negative coordinates", () => {
    const layout = computeLayout({ minX: -500, minY: -100, maxX: 1000, maxY: 1000 }, 2, viewport);

    expect(layout).toEqual({ contentWidth: 3000, contentHeight: 2200, offsetX: 1000, offsetY: 200 });
  });
});

describe("anchor round-trip", () => {
  it("keeps a page point under the same screen position after zooming", () => {
    const bounds = { minX: -100, minY: -100, maxX: 1000, maxY: 1400 };
    const before = computeLayout(bounds, 1, viewport);
    const scroll = { x: 120, y: 340 };
    const screen = { x: 250, y: 180 };
    const pt = screenToPt(before, 1, scroll, screen);

    const after = computeLayout(bounds, 2.5, viewport);
    const nextScroll = scrollForAnchor(after, 2.5, pt, screen);
    const ptAfter = screenToPt(after, 2.5, nextScroll, screen);

    expect(ptAfter.x).toBeCloseTo(pt.x);
    expect(ptAfter.y).toBeCloseTo(pt.y);
  });
});

describe("fitZoom", () => {
  it("fits the limiting dimension with padding", () => {
    expect(fitZoom({ width: 595, height: 842 }, viewport, 40)).toBeCloseTo(520 / 842);
  });

  it("falls back to the minimum zoom for a collapsed viewport", () => {
    expect(fitZoom({ width: 595, height: 842 }, { width: 50, height: 50 }, 40)).toBe(0.1);
  });
});
