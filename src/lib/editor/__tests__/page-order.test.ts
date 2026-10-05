import { describe, expect, it } from "vitest";
import { isPageOrder, movePage, shiftPage, shiftedPageOrder, slotToIndex } from "../page-order";

const order = ["a", "b", "c", "d"] as const;

describe("isPageOrder", () => {
  it("accepts only a permutation of the current pages", () => {
    expect(isPageOrder(order, ["d", "c", "b", "a"])).toBe(true);
    expect(isPageOrder(order, order)).toBe(true);
    expect(isPageOrder(order, ["a", "b", "c"])).toBe(false);
    expect(isPageOrder(order, ["a", "b", "c", "c"])).toBe(false);
    expect(isPageOrder(order, ["a", "b", "c", "x"])).toBe(false);
  });
});

describe("movePage", () => {
  it("puts the page at the wanted index", () => {
    expect(movePage(order, "d", 1)).toEqual(["a", "d", "b", "c"]);
    expect(movePage(order, "a", 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("clamps the index and returns the same array when nothing moves", () => {
    expect(movePage(order, "b", -5)).toEqual(["b", "a", "c", "d"]);
    expect(movePage(order, "b", 99)).toEqual(["a", "c", "d", "b"]);
    expect(movePage(order, "b", 1)).toBe(order);
    expect(movePage(order, "x", 0)).toBe(order);
  });
});

describe("shiftPage", () => {
  it("moves one step or to an end", () => {
    expect(shiftPage(order, "c", "left")).toEqual(["a", "c", "b", "d"]);
    expect(shiftPage(order, "c", "right")).toEqual(["a", "b", "d", "c"]);
    expect(shiftPage(order, "c", "first")).toEqual(["c", "a", "b", "d"]);
    expect(shiftPage(order, "b", "last")).toEqual(["a", "c", "d", "b"]);
  });

  it("returns the same array at the ends (the menu disables those items)", () => {
    expect(shiftPage(order, "a", "left")).toBe(order);
    expect(shiftPage(order, "a", "first")).toBe(order);
    expect(shiftPage(order, "d", "right")).toBe(order);
    expect(shiftPage(order, "d", "last")).toBe(order);
  });
});

describe("shiftedPageOrder", () => {
  const pages = order.map((id) => ({ id }));

  it("returns the new order, or null when the page cannot move that way", () => {
    expect(shiftedPageOrder(pages, "b", "right")).toEqual(["a", "c", "b", "d"]);
    expect(shiftedPageOrder(pages, "a", "left")).toBeNull();
    expect(shiftedPageOrder(pages, "d", "last")).toBeNull();
    expect(shiftedPageOrder(pages, "missing", "first")).toBeNull();
  });
});

describe("slotToIndex", () => {
  it("turns a gap of the tab bar into the dragged page's new index", () => {
    // 拖「b」（index 1）：放在 a 之前 → 0；放在 b 自己的左右兩側 → 不動；放在最後 → 3
    expect(slotToIndex(0, 1)).toBe(0);
    expect(slotToIndex(1, 1)).toBe(1);
    expect(slotToIndex(2, 1)).toBe(1);
    expect(slotToIndex(4, 1)).toBe(3);
    expect(movePage(order, "b", slotToIndex(3, 1))).toEqual(["a", "c", "b", "d"]);
  });
});
