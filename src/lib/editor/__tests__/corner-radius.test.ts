import { describe, expect, it } from "vitest";
import {
  clampCornerRadii,
  cornerRadii,
  hasRoundedCorner,
  isUniformCornerRadius,
  normalizeCornerRadius,
  withCornerRadius,
} from "../corner-radius";
import { isCornerRadius } from "../validation";

const SHAPE = { width: 200, height: 100 }; // 短邊的一半 = 50

describe("cornerRadii / normalizeCornerRadius", () => {
  it("expands one number to four corners", () => {
    expect(cornerRadii(12)).toEqual([12, 12, 12, 12]);
    expect(cornerRadii([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
  });

  it("stores four equal corners as one number", () => {
    expect(normalizeCornerRadius([8, 8, 8, 8])).toBe(8);
    expect(normalizeCornerRadius([8, 8, 0, 0])).toEqual([8, 8, 0, 0]);
    expect(isUniformCornerRadius(5)).toBe(true);
    expect(isUniformCornerRadius([5, 5, 5, 6])).toBe(false);
  });
});

describe("clampCornerRadii", () => {
  it("limits each corner to half the shorter side on its own, like Konva", () => {
    expect(clampCornerRadii(SHAPE, [80, 10, 10, 10])).toEqual([50, 10, 10, 10]);
    expect(clampCornerRadii(SHAPE, [-3, 10, 10, 10])).toEqual([0, 10, 10, 10]);
  });

  it("collapses to one number when clamping makes the corners equal", () => {
    expect(clampCornerRadii(SHAPE, [60, 70, 80, 90])).toBe(50);
    expect(clampCornerRadii(SHAPE, 80)).toBe(50);
  });
});

describe("withCornerRadius", () => {
  it("changes one corner and keeps the rest", () => {
    expect(withCornerRadius(SHAPE, 12, 2, 0)).toEqual([12, 12, 0, 12]);
    expect(withCornerRadius(SHAPE, [12, 12, 0, 12], 2, 12)).toBe(12);
    expect(withCornerRadius(SHAPE, 12, 0, 999)).toEqual([50, 12, 12, 12]);
  });
});

describe("hasRoundedCorner / isCornerRadius", () => {
  it("is rounded when any corner is", () => {
    expect(hasRoundedCorner(0)).toBe(false);
    expect(hasRoundedCorner([0, 0, 0, 4])).toBe(true);
  });

  it("accepts a number or four non-negative numbers", () => {
    expect(isCornerRadius(0)).toBe(true);
    expect(isCornerRadius([0, 1, 2, 3])).toBe(true);
    expect(isCornerRadius(-1)).toBe(false);
    expect(isCornerRadius([1, 2, 3])).toBe(false);
    expect(isCornerRadius([1, 2, 3, -4])).toBe(false);
    expect(isCornerRadius([1, 2, 3, Number.NaN])).toBe(false);
    expect(isCornerRadius("4")).toBe(false);
  });
});
