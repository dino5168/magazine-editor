import { describe, expect, it } from "vitest";
import { DEFAULT_MARGINS } from "../element-factory";
import { canvasSheets, canvasSlotAt, pageSide, spreadBounds, spreadIndexOf, spreadOf, spreadsOf } from "../spreads";
import type { EditorDocument, Page } from "../types";

const page = (id: string, width = 600, height = 800): Page => ({ id, name: id, width, height, background: "#ffffff", elements: [], masterId: null });
const ids = (spread: { slots: readonly { page: Page }[] }) => spread.slots.map((slot) => slot.page.id);

describe("pageSide / spreadIndexOf", () => {
  it("puts page 1 on the right and pairs 2–3, 4–5 …", () => {
    expect([0, 1, 2, 3, 4].map(pageSide)).toEqual(["right", "left", "right", "left", "right"]);
    expect([0, 1, 2, 3, 4].map(spreadIndexOf)).toEqual([0, 1, 1, 2, 2]);
  });
});

describe("spreadsOf", () => {
  it("makes the cover a spread of its own", () => {
    expect(spreadsOf([page("a")]).map(ids)).toEqual([["a"]]);
    expect(spreadsOf([page("a"), page("b"), page("c")]).map(ids)).toEqual([["a"], ["b", "c"]]);
  });

  it("leaves an even last page alone on the left", () => {
    const spreads = spreadsOf([page("a"), page("b"), page("c"), page("d")]);
    expect(spreads.map(ids)).toEqual([["a"], ["b", "c"], ["d"]]);
    expect(spreads[2].slots[0].side).toBe("left");
  });

  it("returns nothing for no pages", () => {
    expect(spreadsOf([])).toEqual([]);
  });

  it("places the left page at 0 and the right page after it, top-aligned", () => {
    const [, spread] = spreadsOf([page("a"), page("b", 500, 700), page("c", 600, 800)]);
    expect(spread.slots.map((slot) => [slot.page.id, slot.side, slot.x])).toEqual([
      ["b", "left", 0],
      ["c", "right", 500],
    ]);
    expect([spread.width, spread.height]).toEqual([1100, 800]);
    expect(spreadBounds(spread)).toEqual({ minX: 0, minY: 0, maxX: 1100, maxY: 800 });
  });
});

describe("canvasSheets", () => {
  const pages = [page("a"), page("b", 500), page("c")];
  const document: EditorDocument = {
    name: "測試",
    margins: DEFAULT_MARGINS,
    pageNumberRules: [],
    masters: [{ id: "M", name: "Master A", width: 600, height: 800, background: "#ffffff", elements: [], parentId: null }],
    pages,
  };
  const slots = (sheets: { slots: readonly { sheet: { id: string }; x: number; pageIndex: number }[] }) =>
    sheets.slots.map((slot) => [slot.sheet.id, slot.x, slot.pageIndex]);

  it("shows only the active page in single view", () => {
    expect(slots(canvasSheets(document, "c", "single"))).toEqual([["c", 0, 2]]);
  });

  it("shows the whole spread in spread view", () => {
    const sheets = canvasSheets(document, "c", "spread");
    expect(slots(sheets)).toEqual([["b", 0, 1], ["c", 500, 2]]);
    expect([sheets.width, sheets.height]).toEqual([1100, 800]);
    expect(slots(canvasSheets(document, "a", "spread"))).toEqual([["a", 0, 0]]);
  });

  it("finds the sheet under a point of the canvas, or the nearest one", () => {
    const sheets = canvasSheets(document, "c", "spread");
    expect(canvasSlotAt(sheets, 100).sheet.id).toBe("b");
    expect(canvasSlotAt(sheets, 500).sheet.id).toBe("c");
    expect(canvasSlotAt(sheets, -50).sheet.id).toBe("b");
    expect(canvasSlotAt(sheets, 5000).sheet.id).toBe("c");
    expect(canvasSlotAt(canvasSheets(document, "a", "single"), 900).sheet.id).toBe("a");
  });

  it("shows a master page alone, and falls back to the first page", () => {
    expect(slots(canvasSheets(document, "M", "spread"))).toEqual([["M", 0, -1]]);
    expect(slots(canvasSheets(document, "missing", "single"))).toEqual([["a", 0, 0]]);
  });
});

describe("spreadOf", () => {
  const pages = [page("a"), page("b"), page("c"), page("d"), page("e")];

  it("finds the spread of either page of a pair", () => {
    expect(ids(spreadOf(pages, "d")!)).toEqual(["d", "e"]);
    expect(ids(spreadOf(pages, "e")!)).toEqual(["d", "e"]);
    expect(spreadOf(pages, "a")!.slots[0]).toMatchObject({ side: "right", x: 0, index: 0 });
    expect(spreadOf(pages, "master")).toBeNull();
  });
});
