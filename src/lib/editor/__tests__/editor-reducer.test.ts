import { describe, expect, it } from "vitest";
import {
  DEFAULT_MARGINS,
  createMasterPage,
  createPage,
  createShapeElement,
  createTextElement,
} from "../element-factory";
import {
  DUPLICATE_OFFSET_PT,
  HISTORY_LIMIT,
  createInitialState,
  editorReducer,
  selectActivePage,
  selectIsDirty,
  selectReturnPageId,
  selectSelectedElement,
  selectSelectedElements,
  type EditorAction,
  type EditorState,
} from "../editor-reducer";
import { createPageNumberRule } from "../page-numbers";
import { createLabel } from "../shape-label";
import { defaultTextStyles, nextTextStyleName } from "../style-sheet";
import type { EditorDocument, MasterPage, Page } from "../types";

function blankState(): EditorState {
  const document: EditorDocument = {
    name: "測試文件",
    margins: DEFAULT_MARGINS,
    textStyles: [],
    pageNumberRules: [],
    masters: [],
    pages: [createPage("Page-1", { width: 595, height: 842 }, "#ffffff")],
  };
  return createInitialState(document);
}

function run(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(editorReducer, state);
}

describe("editorReducer / elements", () => {
  it("adds an element to the active page and selects it", () => {
    const element = createShapeElement("rect", { x: 100, y: 100 });
    const state = run(blankState(), { type: "element/add", element });

    expect(selectActivePage(state).elements).toEqual([element]);
    expect(state.selectedIds).toEqual([element.id]);
    expect(state.history.past).toHaveLength(1);
  });

  it("updates an element and records history", () => {
    const element = createShapeElement("rect", { x: 100, y: 100 });
    const state = run(
      blankState(),
      { type: "element/add", element },
      { type: "element/update", id: element.id, patch: { x: -500, y: 2000 } },
    );

    expect(selectSelectedElement(state)).toMatchObject({ x: -500, y: 2000 });
    expect(state.history.past).toHaveLength(2);
  });

  it("returns the same state when an update changes nothing", () => {
    const element = createShapeElement("rect", { x: 100, y: 100 });
    const state = run(blankState(), { type: "element/add", element });
    const next = editorReducer(state, { type: "element/update", id: element.id, patch: { x: element.x } });

    expect(next).toBe(state);
  });

  it("accepts fill colors with alpha and ignores invalid ones", () => {
    const element = createShapeElement("rect", { x: 100, y: 100 });
    const state = run(blankState(), { type: "element/add", element });

    expect(run(state, { type: "element/update", id: element.id, patch: { fill: "#fb2c3680" } }).history.present.pages[0].elements[0])
      .toMatchObject({ fill: "#fb2c3680" });
    expect(editorReducer(state, { type: "element/update", id: element.id, patch: { fill: "red" } })).toBe(state);
    expect(editorReducer(state, { type: "element/update", id: element.id, patch: { fill: "#fb2c368" } })).toBe(state);
  });

  it("sets and removes a stroke, ignoring invalid ones", () => {
    const element = createShapeElement("rect", { x: 100, y: 100 });
    const state = run(blankState(), { type: "element/add", element });
    const stroke = { color: "#00000080", width: 2, dash: "dotted" } as const;

    const stroked = run(state, { type: "element/update", id: element.id, patch: { stroke } });
    expect(selectSelectedElement(stroked)).toMatchObject({ stroke });
    expect(selectSelectedElement(run(stroked, { type: "element/update", id: element.id, patch: { stroke: null } }))).toMatchObject({
      stroke: null,
    });
    for (const bad of [
      { ...stroke, width: 0 },
      { ...stroke, width: 101 },
      { ...stroke, color: "red" },
      { ...stroke, dash: "wavy" },
    ]) {
      expect(editorReducer(state, { type: "element/update", id: element.id, patch: { stroke: bad as never } })).toBe(state);
    }
  });

  it("sets a label and ignores invalid ones", () => {
    const element = createShapeElement("ellipse", { x: 100, y: 100 });
    const state = run(blankState(), { type: "element/add", element });
    const label = createLabel("圖形內文字");

    expect(selectSelectedElement(run(state, { type: "element/update", id: element.id, patch: { label } }))).toMatchObject({ label });
    expect(
      editorReducer(state, { type: "element/update", id: element.id, patch: { label: { ...label, verticalAlign: "x" as never } } }),
    ).toBe(state);
  });

  it("sets text decoration and a shadow, ignoring invalid ones", () => {
    const element = createTextElement("body", { x: 100, y: 100 });
    const state = run(blankState(), { type: "element/add", element });
    const shadow = { color: "#00000080", offsetX: -3, offsetY: 50 };
    const patch = { italic: true, underline: true, strikethrough: true, shadow };

    expect(selectSelectedElement(run(state, { type: "element/update", id: element.id, patch }))).toMatchObject(patch);
    for (const bad of [
      { italic: "yes" },
      { underline: 1 },
      { shadow: { ...shadow, offsetX: 51 } },
      { shadow: { ...shadow, color: "black" } },
      { shadow: { ...shadow, offsetY: Number.NaN } },
    ]) {
      expect(editorReducer(state, { type: "element/update", id: element.id, patch: bad as never })).toBe(state);
    }
  });

  it("rejects a label with invalid text decoration", () => {
    const element = createShapeElement("ellipse", { x: 100, y: 100 });
    const state = run(blankState(), { type: "element/add", element });
    const label = createLabel("文字");

    expect(editorReducer(state, { type: "element/update", id: element.id, patch: { label: { ...label, italic: undefined as never } } })).toBe(
      state,
    );
    expect(
      editorReducer(state, { type: "element/update", id: element.id, patch: { label: { ...label, shadow: { color: "#000000" } as never } } }),
    ).toBe(state);
  });

  it("changes the geometry and ignores invalid geometry", () => {
    const element = createShapeElement("star", { x: 100, y: 100 });
    const state = run(blankState(), { type: "element/add", element });
    const geometry = { kind: "star", numPoints: 8, innerRatio: 0.6 } as const;

    expect(selectSelectedElement(run(state, { type: "element/update", id: element.id, patch: { geometry } }))).toMatchObject({
      geometry,
    });
    expect(
      editorReducer(state, { type: "element/update", id: element.id, patch: { geometry: { ...geometry, innerRatio: 2 } } }),
    ).toBe(state);
  });

  it("ignores numbers that are not finite", () => {
    const element = createShapeElement("rect", { x: 100, y: 100 });
    const state = run(blankState(), { type: "element/add", element });

    expect(editorReducer(state, { type: "element/update", id: element.id, patch: { x: Number.NaN } })).toBe(state);
    expect(editorReducer(state, { type: "element/update", id: element.id, patch: { rotation: Infinity } })).toBe(state);
  });

  it("rejects page backgrounds with alpha", () => {
    const state = blankState();
    expect(editorReducer(state, { type: "page/setBackground", id: state.activePageId, color: "#ffffff80" })).toBe(state);
  });

  it("deletes the selected element and clears selection", () => {
    const element = createTextElement("body", { x: 10, y: 10 });
    const state = run(blankState(), { type: "element/add", element }, { type: "element/delete", ids: [element.id] });

    expect(selectActivePage(state).elements).toHaveLength(0);
    expect(state.selectedIds).toEqual([]);
  });

  it("reorders elements and ignores moves past the edges", () => {
    const a = createShapeElement("rect", { x: 0, y: 0 });
    const b = createShapeElement("ellipse", { x: 0, y: 0 });
    const state = run(
      blankState(),
      { type: "element/add", element: a },
      { type: "element/add", element: b },
      { type: "element/reorder", id: a.id, direction: "up" },
    );

    expect(selectActivePage(state).elements.map((e) => e.id)).toEqual([b.id, a.id]);
    expect(editorReducer(state, { type: "element/reorder", id: a.id, direction: "up" })).toBe(state);
  });

  it("moves elements to the front or back in one step", () => {
    const [a, b, c] = ["rect", "ellipse", "star"].map((kind) => createShapeElement(kind as "rect", { x: 0, y: 0 }));
    const state = run(blankState(), ...[a, b, c].map((element) => ({ type: "element/add", element }) as const));
    const ids = (s: EditorState) => selectActivePage(s).elements.map((e) => e.id);

    expect(ids(run(state, { type: "element/reorder", id: a.id, direction: "top" }))).toEqual([b.id, c.id, a.id]);
    expect(ids(run(state, { type: "element/reorder", id: c.id, direction: "bottom" }))).toEqual([c.id, a.id, b.id]);
    expect(editorReducer(state, { type: "element/reorder", id: c.id, direction: "top" })).toBe(state);
    expect(editorReducer(state, { type: "element/reorder", id: a.id, direction: "bottom" })).toBe(state);
  });
});

describe("editorReducer / elements on another page (pageId)", () => {
  function twoPages(): { state: EditorState; other: Page } {
    const state = run(blankState(), { type: "page/add" });
    const [first, other] = state.history.present.pages;
    // page/add 會切到新頁；回到第 1 頁，第 2 頁是「別頁」
    return { state: run(state, { type: "page/select", id: first.id }), other };
  }

  it("adds to another page without switching pages or selecting", () => {
    const { state, other } = twoPages();
    const selected = createShapeElement("rect", { x: 10, y: 10 });
    const before = run(state, { type: "element/add", element: selected });
    const element = createTextElement("body", { x: 100, y: 100 });
    const next = run(before, { type: "element/add", element, pageId: other.id });

    expect(next.activePageId).toBe(before.activePageId);
    expect(next.selectedIds).toEqual([selected.id]);
    expect(next.history.present.pages[1].elements).toEqual([element]);
    expect(next.history.past).toHaveLength(before.history.past.length + 1);
  });

  it("selects the element when pageId is the active page", () => {
    const { state } = twoPages();
    const element = createTextElement("body", { x: 100, y: 100 });
    const next = run(state, { type: "element/add", element, pageId: state.activePageId });
    expect(next.selectedIds).toEqual([element.id]);
  });

  it("updates and deletes on another page, one undo step each", () => {
    const { state, other } = twoPages();
    const element = createShapeElement("ellipse", { x: 100, y: 100 });
    const added = run(state, { type: "element/add", element, pageId: other.id });
    const moved = run(added, { type: "element/update", id: element.id, patch: { x: 5 }, pageId: other.id });
    expect(moved.history.present.pages[1].elements[0].x).toBe(5);
    // 沒指定 pageId 時只找目前頁：別頁的物件不受影響
    expect(run(moved, { type: "element/update", id: element.id, patch: { x: 9 } })).toBe(moved);

    const deleted = run(moved, { type: "element/delete", ids: [element.id], pageId: other.id });
    expect(deleted.history.present.pages[1].elements).toEqual([]);
    expect(deleted.history.past).toHaveLength(added.history.past.length + 2);
    expect(deleted.activePageId).toBe(state.activePageId);
  });

  it("works on master pages and ignores unknown pages", () => {
    const master = createMasterPage("Master A", { width: 595, height: 842 }, "#ffffff", null);
    const state = run(blankState(), { type: "master/add", master });
    const back = run(state, { type: "page/select", id: state.history.present.pages[0].id });
    const element = createTextElement("body", { x: 100, y: 100 });

    const next = run(back, { type: "element/add", element, pageId: master.id });
    expect(next.history.present.masters[0].elements).toEqual([element]);
    expect(run(back, { type: "element/add", element, pageId: "nope" })).toBe(back);
    expect(run(next, { type: "element/delete", ids: [element.id], pageId: "nope" })).toBe(next);
  });
});

describe("editorReducer / duplicate", () => {
  it("inserts an offset copy right above the original, selects it and records history", () => {
    const below = createShapeElement("rect", { x: 100, y: 100 });
    const original = createShapeElement("ellipse", { x: 200, y: 200 });
    const above = createShapeElement("star", { x: 300, y: 300 });
    const start = run(blankState(), ...[below, original, above].map((element) => ({ type: "element/add", element }) as const));
    const state = run(start, { type: "element/duplicate", copies: [{ id: original.id, newId: "copy" }] });

    const ids = selectActivePage(state).elements.map((element) => element.id);
    expect(ids).toEqual([below.id, original.id, "copy", above.id]);
    expect(selectSelectedElement(state)).toMatchObject({
      type: "shape",
      geometry: { kind: "ellipse" },
      x: original.x + DUPLICATE_OFFSET_PT,
      y: original.y + DUPLICATE_OFFSET_PT,
    });
    expect(state.history.past).toHaveLength(start.history.past.length + 1);
    expect(run(state, { type: "history/undo" }).selectedIds).toEqual([]);
  });

  it("ignores unknown elements and ids that already exist", () => {
    const element = createShapeElement("rect", { x: 100, y: 100 });
    const state = run(blankState(), { type: "element/add", element });

    expect(run(state, { type: "element/duplicate", copies: [{ id: "missing", newId: "copy" }] })).toBe(state);
    expect(run(state, { type: "element/duplicate", copies: [{ id: element.id, newId: element.id }] })).toBe(state);
  });
});

describe("editorReducer / multi-selection", () => {
  function threeShapes() {
    const [a, b, c] = ["rect", "ellipse", "star"].map((kind) => createShapeElement(kind as "rect", { x: 100, y: 100 }));
    const state = run(blankState(), ...[a, b, c].map((element) => ({ type: "element/add", element }) as const));
    return { a, b, c, state };
  }

  it("toggles elements in and out of the selection without touching history", () => {
    const { a, b, c, state } = threeShapes();
    const both = run(state, { type: "selection/set", id: a.id }, { type: "selection/toggle", id: c.id });

    expect(both.selectedIds).toEqual([a.id, c.id]);
    expect(selectSelectedElements(both).map((e) => e.id)).toEqual([a.id, c.id]);
    // 選了不只一個時，單一物件的 selector 回傳 null（屬性面板只編輯單一物件）
    expect(selectSelectedElement(both)).toBeNull();
    expect(run(both, { type: "selection/toggle", id: a.id }).selectedIds).toEqual([c.id]);
    expect(both.history.past).toHaveLength(state.history.past.length);
    expect(run(both, { type: "selection/toggle", id: "missing" })).toBe(both);
    expect(run(both, { type: "selection/set", id: b.id }).selectedIds).toEqual([b.id]);
  });

  it("selects a marquee result, replacing or adding to the selection", () => {
    const { a, b, c, state } = threeShapes();
    const selected = run(state, { type: "selection/set", id: a.id });

    expect(run(selected, { type: "selection/setMany", ids: [b.id, c.id], additive: false }).selectedIds).toEqual([b.id, c.id]);
    expect(run(selected, { type: "selection/setMany", ids: [a.id, c.id], additive: true }).selectedIds).toEqual([a.id, c.id]);
    expect(run(selected, { type: "selection/setMany", ids: ["missing"], additive: false }).selectedIds).toEqual([]);
    expect(run(selected, { type: "selection/setMany", ids: [], additive: true })).toBe(selected);
    expect(run(selected, { type: "selection/setMany", ids: [a.id], additive: false })).toBe(selected);
  });

  it("returns the same state when selecting the only selected element again", () => {
    const { a, state } = threeShapes();
    const selected = run(state, { type: "selection/set", id: a.id });
    expect(run(selected, { type: "selection/set", id: a.id })).toBe(selected);
  });

  it("updates several elements in one undo step", () => {
    const { a, b, c, state } = threeShapes();
    const moved = run(state, {
      type: "element/updateMany",
      patches: [
        { id: a.id, patch: { x: 10, y: 20 } },
        { id: c.id, patch: { x: 30, y: 40 } },
      ],
    });

    expect(selectActivePage(moved).elements.map(({ x, y }) => [x, y])).toEqual([[10, 20], [b.x, b.y], [30, 40]]);
    expect(moved.history.past).toHaveLength(state.history.past.length + 1);
    expect(selectActivePage(run(moved, { type: "history/undo" })).elements).toEqual([a, b, c]);
  });

  it("rejects the whole batch when one patch is invalid, and ignores no-op batches", () => {
    const { a, c, state } = threeShapes();
    const invalid = { type: "element/updateMany", patches: [{ id: a.id, patch: { x: 1 } }, { id: c.id, patch: { x: Number.NaN } }] } as const;

    expect(editorReducer(state, invalid)).toBe(state);
    expect(editorReducer(state, { type: "element/updateMany", patches: [{ id: a.id, patch: { x: a.x } }] })).toBe(state);
    expect(editorReducer(state, { type: "element/updateMany", patches: [{ id: "missing", patch: { x: 1 } }] })).toBe(state);
  });

  it("deletes several elements in one undo step and drops them from the selection", () => {
    const { a, b, c, state } = threeShapes();
    const selected = run(state, { type: "selection/set", id: a.id }, { type: "selection/toggle", id: b.id });
    const deleted = run(selected, { type: "element/delete", ids: [b.id, c.id] });

    expect(selectActivePage(deleted).elements.map((e) => e.id)).toEqual([a.id]);
    expect(deleted.selectedIds).toEqual([a.id]);
    expect(deleted.history.past).toHaveLength(selected.history.past.length + 1);
    expect(run(selected, { type: "element/delete", ids: ["missing"] })).toBe(selected);
  });

  it("duplicates several elements above their originals and selects the copies", () => {
    const { a, b, c, state } = threeShapes();
    const copied = run(state, {
      type: "element/duplicate",
      copies: [
        { id: c.id, newId: "copy-c" },
        { id: a.id, newId: "copy-a" },
      ],
    });

    expect(selectActivePage(copied).elements.map((e) => e.id)).toEqual([a.id, "copy-a", b.id, c.id, "copy-c"]);
    expect(copied.selectedIds).toEqual(["copy-c", "copy-a"]);
    expect(copied.history.past).toHaveLength(state.history.past.length + 1);
    // 新 id 重複或原物件不存在時整批不做
    expect(run(state, { type: "element/duplicate", copies: [{ id: a.id, newId: "x" }, { id: b.id, newId: "x" }] })).toBe(state);
    expect(run(state, { type: "element/duplicate", copies: [{ id: a.id, newId: "x" }, { id: "missing", newId: "y" }] })).toBe(state);
  });

  it("drops elements that no longer exist from the selection after undo", () => {
    const { a, state } = threeShapes();
    const d = createShapeElement("rect", { x: 0, y: 0 });
    const selected = run(state, { type: "selection/set", id: a.id }, { type: "element/add", element: d }, { type: "selection/toggle", id: a.id });

    expect(selected.selectedIds).toEqual([d.id, a.id]);
    expect(run(selected, { type: "history/undo" }).selectedIds).toEqual([a.id]);
  });
});

describe("editorReducer / tools", () => {
  it("starts with the select tool and the rectangle shape", () => {
    expect(blankState()).toMatchObject({ tool: "select", shapeKind: "rect" });
  });

  it("clears the selection when switching to a creation tool, but not to the hand tool", () => {
    const element = createShapeElement("rect", { x: 100, y: 100 });
    const selected = run(blankState(), { type: "element/add", element });

    expect(run(selected, { type: "tool/set", tool: "hand" }).selectedIds).toEqual([element.id]);
    expect(run(selected, { type: "tool/set", tool: "text" })).toMatchObject({ tool: "text", selectedIds: [] });
    expect(run(selected, { type: "tool/set", tool: "shape", shape: "star" })).toMatchObject({
      tool: "shape",
      shapeKind: "star",
      selectedIds: [],
    });
  });

  it("remembers the last shape and does not touch history", () => {
    const state = run(blankState(), { type: "tool/set", tool: "shape", shape: "ellipse" }, { type: "tool/set", tool: "select" });

    expect(state).toMatchObject({ tool: "select", shapeKind: "ellipse" });
    expect(state.history.past).toHaveLength(0);
    expect(run(state, { type: "tool/set", tool: "shape" }).shapeKind).toBe("ellipse");
  });

  it("returns the same state when nothing changes", () => {
    const state = blankState();
    expect(run(state, { type: "tool/set", tool: "select" })).toBe(state);
  });

  it("keeps the tool when a project is loaded", () => {
    const state = run(blankState(), { type: "tool/set", tool: "hand" });
    const loaded = run(state, { type: "document/load", document: state.history.present, saved: true });
    expect(loaded.tool).toBe("hand");
  });
});

describe("editorReducer / pages", () => {
  it("adds a page at the end, copying the active page's size and background, and activates it", () => {
    const initial = blankState();
    const state = run(
      initial,
      { type: "page/setBackground", id: initial.activePageId, color: "#123456" },
      { type: "page/add" },
    );

    const pages = state.history.present.pages;
    expect(pages).toHaveLength(2);
    expect(pages[1]).toMatchObject({ name: "Page-2", width: 595, height: 842, background: "#123456" });
    expect(state.activePageId).toBe(pages[1].id);
  });

  it("appends new pages at the end with increasing names, even when an earlier page is active", () => {
    const initial = blankState();
    const firstId = initial.activePageId;
    const state = run(
      initial,
      { type: "page/add" },
      { type: "page/select", id: firstId },
      { type: "page/add" },
      { type: "page/select", id: firstId },
      { type: "page/add" },
    );

    expect(state.history.present.pages.map((page) => page.name)).toEqual(["Page-1", "Page-2", "Page-3", "Page-4"]);
    expect(state.activePageId).toBe(state.history.present.pages[3].id);
  });

  it("inserts a page after the given page", () => {
    const initial = run(blankState(), { type: "page/add" });
    const [first, second] = initial.history.present.pages;
    const state = run(initial, { type: "page/add", after: first.id });

    const pages = state.history.present.pages;
    expect(pages.map((page) => page.id)).toEqual([first.id, pages[1].id, second.id]);
    expect(pages[1].name).toBe("Page-3");
    expect(state.activePageId).toBe(pages[1].id);
  });

  it("ignores inserting after a page that does not exist", () => {
    const state = blankState();
    expect(editorReducer(state, { type: "page/add", after: "missing" })).toBe(state);
  });

  it("reorders pages in one undo step and keeps the active page and selection", () => {
    const element = createShapeElement("rect", { x: 100, y: 100 });
    const initial = run(blankState(), { type: "page/add" }, { type: "page/add" }, { type: "element/add", element });
    const [a, b, c] = initial.history.present.pages.map((page) => page.id);
    const state = run(initial, { type: "page/reorder", order: [c, a, b] });

    expect(state.history.present.pages.map((page) => page.id)).toEqual([c, a, b]);
    // 頁面物件本身不變（內容、名稱都跟著頁面走）
    expect(state.history.present.pages[0]).toBe(initial.history.present.pages[2]);
    expect(state.activePageId).toBe(c);
    expect(state.selectedIds).toEqual([element.id]);
    expect(state.history.past).toHaveLength(initial.history.past.length + 1);
    expect(run(state, { type: "history/undo" }).history.present.pages.map((page) => page.id)).toEqual([a, b, c]);
  });

  it("ignores an unchanged order and anything that is not a permutation of the pages", () => {
    const state = run(blankState(), { type: "page/add" });
    const [a, b] = state.history.present.pages.map((page) => page.id);

    for (const order of [[a, b], [a], [a, a], [a, "missing"], [b, a, "missing"]]) {
      expect(editorReducer(state, { type: "page/reorder", order })).toBe(state);
    }
  });

  it("refuses to delete the last page", () => {
    const state = blankState();
    expect(editorReducer(state, { type: "page/delete", id: state.activePageId })).toBe(state);
  });

  it("activates the previous page when deleting the active page", () => {
    const initial = blankState();
    const state = run(initial, { type: "page/add" });
    const secondId = state.activePageId;
    const next = editorReducer(state, { type: "page/delete", id: secondId });

    expect(next.history.present.pages).toHaveLength(1);
    expect(next.activePageId).toBe(initial.activePageId);
  });

  it("rejects invalid page names and colors", () => {
    const state = blankState();
    const id = state.activePageId;

    expect(editorReducer(state, { type: "page/rename", id, name: "   " })).toBe(state);
    expect(editorReducer(state, { type: "page/rename", id, name: "a".repeat(51) })).toBe(state);
    expect(editorReducer(state, { type: "page/setBackground", id, color: "red" })).toBe(state);
    expect(run(state, { type: "page/rename", id, name: "  封面  " }).history.present.pages[0].name).toBe("封面");
  });

  it("clears selection when switching pages", () => {
    const element = createShapeElement("star", { x: 0, y: 0 });
    const state = run(blankState(), { type: "element/add", element }, { type: "page/add" });

    expect(state.selectedIds).toEqual([]);
    const back = run(state, { type: "page/select", id: state.history.present.pages[0].id });
    expect(back.selectedIds).toEqual([]);
  });
});

describe("editorReducer / master pages", () => {
  const SIZE = { width: 595, height: 842 };
  const master = (id: string, parentId: string | null = null): MasterPage => ({
    ...createMasterPage(`Master ${id}`, SIZE, "#ffffff", parentId),
    id,
  });
  const page = (id: string, masterId: string | null = null): Page => ({
    ...createPage(id, SIZE, "#ffffff", masterId),
    id,
  });

  it("adds a master page, switches to it and edits its elements like a page", () => {
    const initial = blankState();
    const element = createShapeElement("rect", { x: 10, y: 10 });
    const state = run(initial, { type: "master/add", master: master("A") }, { type: "element/add", element });

    expect(state.activePageId).toBe("A");
    expect(selectActivePage(state)).toBe(state.history.present.masters[0]);
    expect(state.history.present.masters[0].elements).toEqual([element]);
    // 頁面沒有被動到
    expect(state.history.present.pages).toBe(initial.history.present.pages);
    expect(run(state, { type: "history/undo" }, { type: "history/undo" }).activePageId).toBe(initial.activePageId);
  });

  it("rejects a master with a used id, a missing parent, a bad name or size", () => {
    const state = run(blankState(), { type: "master/add", master: master("A") });
    const pageId = state.history.present.pages[0].id;

    for (const bad of [
      master("A"),
      { ...master("B"), id: pageId },
      master("B", "missing"),
      { ...master("B"), name: " " },
      { ...master("B"), width: 0 },
    ]) {
      expect(editorReducer(state, { type: "master/add", master: bad })).toBe(state);
    }
    expect(run(state, { type: "master/add", master: master("B", "A") }).history.present.masters[1].parentId).toBe("A");
  });

  it("renames and recolours a master page with the page actions", () => {
    const state = run(
      blankState(),
      { type: "master/add", master: master("A") },
      { type: "page/rename", id: "A", name: "刊頭" },
      { type: "page/setBackground", id: "A", color: "#fef3c7" },
    );
    expect(state.history.present.masters[0]).toMatchObject({ name: "刊頭", background: "#fef3c7", parentId: null });
  });

  it("re-parents a master page but never into a cycle", () => {
    const state = run(
      blankState(),
      { type: "master/add", master: master("A") },
      { type: "master/add", master: master("B", "A") },
      { type: "master/add", master: master("C") },
    );
    const moved = run(state, { type: "master/setParent", id: "C", parentId: "B" });
    expect(moved.history.present.masters.find((m) => m.id === "C")?.parentId).toBe("B");

    expect(editorReducer(moved, { type: "master/setParent", id: "A", parentId: "C" })).toBe(moved);
    expect(editorReducer(moved, { type: "master/setParent", id: "A", parentId: "A" })).toBe(moved);
    expect(editorReducer(moved, { type: "master/setParent", id: "C", parentId: "B" })).toBe(moved);
    expect(editorReducer(moved, { type: "master/setParent", id: "missing", parentId: null })).toBe(moved);
  });

  it("deletes a master page: its pages and child masters move to its parent", () => {
    const initial = run(
      blankState(),
      { type: "master/add", master: master("A") },
      { type: "master/add", master: master("B", "A") },
      { type: "master/add", master: master("C", "B") },
      { type: "page/addMany", pages: [page("p2", "B"), page("p3", "A")], index: 1 },
      { type: "page/select", id: "B" },
    );
    const state = run(initial, { type: "master/delete", id: "B" });
    const { masters, pages } = state.history.present;

    expect(masters.map((m) => [m.id, m.parentId])).toEqual([["A", null], ["C", "A"]]);
    expect(pages.map((p) => p.masterId)).toEqual([null, "A", "A"]);
    // 正在編輯被刪除的主頁 → 回到第一頁
    expect(state.activePageId).toBe(pages[0].id);
    expect(run(state, { type: "history/undo" }).history.present).toBe(initial.history.present);
    expect(editorReducer(state, { type: "master/delete", id: "B" })).toBe(state);
  });

  it("returns to the first page when an undo removes the master being edited", () => {
    const state = run(blankState(), { type: "master/add", master: master("A") });
    const undone = run(state, { type: "history/undo" });
    expect(undone.activePageId).toBe(undone.history.present.pages[0].id);
  });

  it("duplicates a master page with new element ids right after it", () => {
    const element = createShapeElement("rect", { x: 10, y: 10 });
    const state = run(
      blankState(),
      { type: "master/add", master: master("A", null) },
      { type: "element/add", element },
      { type: "master/add", master: master("B") },
    );
    const copied = run(state, { type: "master/duplicate", id: "A", newId: "A2", elementIds: ["e2"] });
    const { masters } = copied.history.present;

    expect(masters.map((m) => m.id)).toEqual(["A", "A2", "B"]);
    expect(masters[1]).toMatchObject({ name: "Master A 複本", parentId: null });
    expect(masters[1].elements).toEqual([{ ...element, id: "e2" }]);
    expect(copied.activePageId).toBe("A2");
    // id 數量不符、新 id 已被使用
    expect(editorReducer(state, { type: "master/duplicate", id: "A", newId: "A2", elementIds: [] })).toBe(state);
    expect(editorReducer(state, { type: "master/duplicate", id: "A", newId: "B", elementIds: ["e2"] })).toBe(state);
  });

  it("adds several pages at an index in one undo step and activates the first", () => {
    const initial = run(blankState(), { type: "master/add", master: master("A") });
    const first = initial.history.present.pages[0].id;
    const state = run(initial, { type: "page/addMany", pages: [page("x", "A"), page("y")], index: 0 });

    expect(state.history.present.pages.map((p) => p.id)).toEqual(["x", "y", first]);
    expect(state.history.present.pages[0].masterId).toBe("A");
    expect(state.activePageId).toBe("x");
    expect(state.history.past).toHaveLength(initial.history.past.length + 1);
  });

  it("rejects pages with a used id, a missing master or a bad index", () => {
    const state = run(blankState(), { type: "master/add", master: master("A") });
    for (const action of [
      { pages: [], index: 0 },
      { pages: [page("x")], index: 2 },
      { pages: [page("x")], index: 0.5 },
      { pages: [page("x"), page("x")], index: 0 },
      { pages: [page("A")], index: 0 },
      { pages: [page("x", "missing")], index: 0 },
      { pages: [{ ...page("x"), background: "red" }], index: 0 },
    ]) {
      expect(editorReducer(state, { type: "page/addMany", ...action })).toBe(state);
    }
  });

  it("applies a master page to pages and ignores no-op or invalid requests", () => {
    const state = run(
      blankState(),
      { type: "master/add", master: master("A") },
      { type: "page/addMany", pages: [page("x"), page("y")], index: 1 },
    );
    const applied = run(state, { type: "page/setMaster", ids: ["x", "y"], masterId: "A" });
    expect(applied.history.present.pages.map((p) => p.masterId)).toEqual([null, "A", "A"]);

    expect(editorReducer(applied, { type: "page/setMaster", ids: ["x"], masterId: "A" })).toBe(applied);
    expect(editorReducer(applied, { type: "page/setMaster", ids: ["x"], masterId: "missing" })).toBe(applied);
    expect(editorReducer(applied, { type: "page/setMaster", ids: ["A"], masterId: null })).toBe(applied);
    expect(editorReducer(applied, { type: "page/setMaster", ids: [], masterId: null })).toBe(applied);
  });

  it("duplicates a page with its master and elements", () => {
    const element = createShapeElement("rect", { x: 10, y: 10 });
    const state = run(
      blankState(),
      { type: "master/add", master: master("A") },
      { type: "page/addMany", pages: [page("x", "A")], index: 1 },
      { type: "element/add", element },
    );
    const copied = run(state, { type: "page/duplicate", id: "x", newId: "x2", elementIds: ["e2"] });
    const pages = copied.history.present.pages;

    expect(pages.map((p) => p.id).slice(1)).toEqual(["x", "x2"]);
    expect(pages[2]).toMatchObject({ name: "x 複本", masterId: "A", elements: [{ ...element, id: "e2" }] });
    expect(copied.activePageId).toBe("x2");
  });

  it("gives a page added while editing a master that master", () => {
    const state = run(blankState(), { type: "master/add", master: master("A") }, { type: "page/add" });
    expect(state.history.present.pages[1].masterId).toBe("A");
    // 從頁面新增：沿用該頁的主頁
    expect(run(state, { type: "page/add" }).history.present.pages[2].masterId).toBe("A");
  });

  it("remembers the page shown before editing a master page", () => {
    const initial = run(blankState(), { type: "page/addMany", pages: [page("x"), page("y")], index: 1 });
    const state = run(initial, { type: "page/select", id: "x" }, { type: "master/add", master: master("A") });
    expect(state.activePageId).toBe("A");
    expect(selectReturnPageId(state)).toBe("x");
    // 記住的頁面被刪除 → 回到第一頁
    const deleted = run(state, { type: "page/delete", id: "x" });
    expect(selectReturnPageId(deleted)).toBe(deleted.history.present.pages[0].id);
    // 沒有變化時仍回傳同一個 state
    expect(editorReducer(state, { type: "page/select", id: "A" })).toBe(state);
  });

  it("resizes master pages with the page setup", () => {
    const state = run(blankState(), { type: "master/add", master: master("A") });
    const resized = run(state, {
      type: "document/setPageSetup",
      size: { width: 400, height: 600 },
      margins: state.history.present.margins,
    });
    expect(resized.history.present.masters[0]).toMatchObject({ width: 400, height: 600 });
  });
});

describe("editorReducer / moving across the spine", () => {
  const size = { width: 500, height: 700 };
  const page = (id: string): Page => ({ ...createPage(id, size, "#ffffff"), id });

  function spreadState() {
    const a = createShapeElement("rect", { x: 100, y: 100 });
    const b = createShapeElement("star", { x: 200, y: 200 });
    const c = createShapeElement("ellipse", { x: 300, y: 300 });
    const target = { ...createShapeElement("rect", { x: 50, y: 50 }), id: "t" };
    const document: EditorDocument = {
      name: "測試",
      margins: DEFAULT_MARGINS,
      textStyles: [],
      pageNumberRules: [],
      masters: [],
      pages: [page("p1"), { ...page("p2"), elements: [a, b, c] }, { ...page("p3"), elements: [target] }],
    };
    return { state: run(createInitialState(document), { type: "page/select", id: "p2" }), a, b, c };
  }

  it("moves the dropped elements to the facing page in one undo step, shifted and on top", () => {
    const { state, a, c } = spreadState();
    const past = state.history.past.length;
    const next = run(state, {
      type: "element/moveToPage",
      moves: [
        { id: c.id, patch: { x: 480, y: 310 } },
        { id: a.id, patch: { x: 470, y: 120 } },
      ],
      pageId: "p3",
      dx: -500,
    });
    const [, p2, p3] = next.history.present.pages;
    expect(p2.elements.map((e) => e.id)).not.toContain(a.id);
    expect(p2.elements).toHaveLength(1);
    // 保持原本的上下順序（a 在 c 下面），放在對頁最上層
    expect(p3.elements.map((e) => e.id)).toEqual(["t", a.id, c.id]);
    expect(p3.elements[1]).toMatchObject({ x: -30, y: 120 });
    expect(p3.elements[2]).toMatchObject({ x: -20, y: 310 });
    expect(next.activePageId).toBe("p3");
    expect(next.selectedIds).toEqual([a.id, c.id]);
    expect(next.history.past.length).toBe(past + 1);
    expect(run(next, { type: "history/undo" }).history.present).toBe(state.history.present);
  });

  it("ignores invalid requests", () => {
    const { state, a } = spreadState();
    for (const bad of [
      { moves: [{ id: a.id, patch: { x: 1 } }], pageId: "p2", dx: -500 },
      { moves: [{ id: a.id, patch: { x: 1 } }], pageId: "missing", dx: -500 },
      { moves: [{ id: "t", patch: { x: 1 } }], pageId: "p3", dx: -500 },
      { moves: [], pageId: "p3", dx: -500 },
      { moves: [{ id: a.id, patch: { x: Number.NaN } }], pageId: "p3", dx: -500 },
      { moves: [{ id: a.id, patch: { x: 1 } }], pageId: "p3", dx: Number.NaN },
    ]) {
      expect(editorReducer(state, { type: "element/moveToPage", ...bad })).toBe(state);
    }
  });
});

describe("editorReducer / history", () => {
  it("undoes and redoes document changes", () => {
    const element = createShapeElement("rect", { x: 0, y: 0 });
    const added = run(blankState(), { type: "element/add", element });
    const undone = editorReducer(added, { type: "history/undo" });
    const redone = editorReducer(undone, { type: "history/redo" });

    expect(selectActivePage(undone).elements).toHaveLength(0);
    expect(undone.selectedIds).toEqual([]);
    expect(selectActivePage(redone).elements).toHaveLength(1);
  });

  it("falls back to an existing page when undo removes the active page", () => {
    const state = run(blankState(), { type: "page/add" });
    const undone = editorReducer(state, { type: "history/undo" });

    expect(undone.history.present.pages).toHaveLength(1);
    expect(undone.activePageId).toBe(undone.history.present.pages[0].id);
  });

  it("clears the redo stack on a new change", () => {
    const a = createShapeElement("rect", { x: 0, y: 0 });
    const b = createShapeElement("ellipse", { x: 0, y: 0 });
    const state = run(
      blankState(),
      { type: "element/add", element: a },
      { type: "history/undo" },
      { type: "element/add", element: b },
    );

    expect(state.history.future).toHaveLength(0);
  });

  it(`keeps at most ${HISTORY_LIMIT} history entries`, () => {
    const element = createShapeElement("rect", { x: 0, y: 0 });
    let state = run(blankState(), { type: "element/add", element });
    for (let i = 1; i <= HISTORY_LIMIT + 20; i += 1) {
      state = editorReducer(state, { type: "element/update", id: element.id, patch: { x: i } });
    }

    expect(state.history.past).toHaveLength(HISTORY_LIMIT);
  });

  it("does not record UI-only actions in history", () => {
    const state = run(blankState(), { type: "view/setZoom", zoom: 2 }, { type: "view/fit" });

    expect(state.history.past).toHaveLength(0);
    expect(state.view).toEqual({ zoom: 2, fitRequest: 2 });
  });
});

describe("editorReducer / document", () => {
  it("renames the document with validation", () => {
    const state = blankState();

    expect(run(state, { type: "document/rename", name: " 九月號 " }).history.present.name).toBe("九月號");
    expect(editorReducer(state, { type: "document/rename", name: "" })).toBe(state);
  });

  it("clamps zoom", () => {
    expect(run(blankState(), { type: "view/setZoom", zoom: 99 }).view.zoom).toBe(4);
  });
});

describe("editorReducer / page setup", () => {
  const B5 = { width: 515.9, height: 728.5 };
  const margins = { top: 20, right: 30, bottom: 40, left: 50 };

  it("resizes every page and sets the margins in one undo step, leaving elements in place", () => {
    const element = createShapeElement("rect", { x: 100, y: 100 });
    const state = run(blankState(), { type: "element/add", element }, { type: "page/add" });
    const pastLength = state.history.past.length;

    const next = run(state, { type: "document/setPageSetup", size: B5, margins });
    const { pages } = next.history.present;

    expect(pages.map((p) => [p.width, p.height])).toEqual([
      [B5.width, B5.height],
      [B5.width, B5.height],
    ]);
    expect(next.history.present.margins).toEqual(margins);
    expect(pages[0].elements).toBe(state.history.present.pages[0].elements);
    expect(next.history.past).toHaveLength(pastLength + 1);
    expect(run(next, { type: "history/undo" }).history.present).toBe(state.history.present);
  });

  it("keeps unchanged parts and returns the same state when nothing changes", () => {
    const state = blankState();
    const document = state.history.present;
    const size = { width: document.pages[0].width, height: document.pages[0].height };

    expect(editorReducer(state, { type: "document/setPageSetup", size, margins: { ...document.margins } })).toBe(state);

    const onlyMargins = run(state, { type: "document/setPageSetup", size, margins });
    expect(onlyMargins.history.present.pages).toBe(document.pages);

    const onlySize = run(state, { type: "document/setPageSetup", size: B5, margins: document.margins });
    expect(onlySize.history.present.margins).toBe(document.margins);
  });

  it("rejects sizes outside 10–2000 mm and invalid margins", () => {
    const state = blankState();
    const reject = (size: { width: number; height: number }, m: typeof margins) =>
      expect(editorReducer(state, { type: "document/setPageSetup", size, margins: m })).toBe(state);

    reject({ width: 20, height: 600 }, margins);
    reject({ width: 600, height: 6000 }, margins);
    reject({ width: Number.NaN, height: 600 }, margins);
    reject(B5, { ...margins, top: -1 });
    reject(B5, { ...margins, left: Number.POSITIVE_INFINITY });
    reject(B5, { ...margins, right: 6000 });
  });
});

describe("editorReducer / page numbering", () => {
  const front = createPageNumberRule("front", 1, 2);
  const body = { ...createPageNumberRule("body", 3, 20), start: 1 };

  it("stores the rules sorted by first page in one undo step", () => {
    const state = blankState();
    const next = run(state, { type: "document/setPageNumbering", rules: [body, front] });

    expect(next.history.present.pageNumberRules.map((r) => r.id)).toEqual(["front", "body"]);
    expect(next.history.present.pages).toBe(state.history.present.pages);
    expect(next.history.past).toHaveLength(1);
    expect(run(next, { type: "history/undo" }).history.present).toBe(state.history.present);
    expect(run(next, { type: "document/setPageNumbering", rules: [] }).history.present.pageNumberRules).toEqual([]);
  });

  it("returns the same state when the rules do not change", () => {
    const state = run(blankState(), { type: "document/setPageNumbering", rules: [front, body] });
    expect(editorReducer(state, { type: "document/setPageNumbering", rules: [{ ...body }, { ...front }] })).toBe(state);
    expect(editorReducer(blankState(), { type: "document/setPageNumbering", rules: [] }).history.past).toHaveLength(0);
  });

  it("rejects invalid or overlapping rules", () => {
    const state = blankState();
    expect(editorReducer(state, { type: "document/setPageNumbering", rules: [front, { ...body, from: 2 }] })).toBe(state);
    expect(editorReducer(state, { type: "document/setPageNumbering", rules: [{ ...front, to: 0 }] })).toBe(state);
  });
});

describe("editorReducer / project", () => {
  it("loads a document, clearing history and selection but keeping zoom", () => {
    const element = createShapeElement("rect", { x: 100, y: 100 });
    const edited = run(blankState(), { type: "element/add", element }, { type: "view/setZoom", zoom: 2 });
    const document: EditorDocument = {
      name: "另一個專案",
      margins: DEFAULT_MARGINS,
      textStyles: [],
      pageNumberRules: [],
      masters: [],
      pages: [createPage("封面", { width: 400, height: 600 }, "#000000")],
    };

    const loaded = editorReducer(edited, { type: "document/load", document, saved: true });

    expect(loaded.history).toEqual({ past: [], present: document, future: [] });
    // reducer 必須保存同一個參考，ProjectProvider 才能用 === 判斷是否修改
    expect(loaded.history.present).toBe(document);
    expect(loaded.activePageId).toBe(document.pages[0].id);
    expect(loaded.selectedIds).toEqual([]);
    expect(loaded.view.zoom).toBe(2);
    expect(loaded.view.fitRequest).toBe(edited.view.fitRequest + 1);
    expect(run(loaded, { type: "history/undo" })).toBe(loaded);
    expect(selectIsDirty(loaded)).toBe(false);
  });

  it("tracks unsaved changes by document reference", () => {
    const element = createShapeElement("rect", { x: 100, y: 100 });
    const initial = blankState();
    const edited = run(initial, { type: "element/add", element });
    expect(selectIsDirty(initial)).toBe(false);
    expect(selectIsDirty(edited)).toBe(true);
    // 復原回存檔時的版本會自動變回未修改
    expect(selectIsDirty(run(edited, { type: "history/undo" }))).toBe(false);

    const saved = run(edited, { type: "document/markSaved", document: edited.history.present });
    expect(selectIsDirty(saved)).toBe(false);
    expect(run(saved, { type: "document/markSaved", document: edited.history.present })).toBe(saved);
  });

  it("loads unsaved content (e.g. from a backup) as dirty", () => {
    const loaded = run(blankState(), {
      type: "document/load",
      document: blankState().history.present,
      saved: false,
    });
    expect(loaded.savedDocument).toBeNull();
    expect(selectIsDirty(loaded)).toBe(true);
  });
});

describe("editorReducer / text styles", () => {
  const [heading, , body] = defaultTextStyles();

  /** A page with a text and a labelled shape; the style sheet holds the built-in styles. */
  function styledState() {
    const text = { ...createTextElement("body", { x: 100, y: 100 }), styleId: body.id };
    const shape = { ...createShapeElement("rect", { x: 300, y: 300 }), label: { ...createLabel("圖"), styleId: null } };
    const initial = blankState();
    const document = {
      ...initial.history.present,
      textStyles: defaultTextStyles(),
      pages: [{ ...initial.history.present.pages[0], elements: [text, shape] }],
    };
    return { state: createInitialState(document), text, shape };
  }

  const elementsOf = (state: EditorState) => selectActivePage(state).elements;

  it("textStyle/update makes linked texts follow, keeps overrides, one undo step", () => {
    const { state: initial, text } = styledState();
    const overridden = run(initial, { type: "element/update", id: text.id, patch: { fill: "#dc2626" } });
    const state = run(overridden, { type: "textStyle/update", id: body.id, style: { ...body, fontSize: 12, fill: "#1e3a8a" } });
    expect(elementsOf(state)[0]).toMatchObject({ fontSize: 12, fill: "#dc2626", styleId: body.id });
    expect(state.history.present.textStyles[2]).toMatchObject({ fontSize: 12, fill: "#1e3a8a", name: "內文" });
    expect(state.history.past).toHaveLength(overridden.history.past.length + 1);
    // 不連結的圖形內文字不動
    expect(elementsOf(state)[1]).toBe(elementsOf(overridden)[1]);
    expect(run(state, { type: "history/undo" }).history.present).toBe(overridden.history.present);
  });

  it("textStyle/update can rename in the same undo step", () => {
    const { state } = styledState();
    const next = run(state, { type: "textStyle/update", id: body.id, style: { ...body, fontSize: 12 }, name: " 本文 " });
    expect(next.history.present.textStyles[2]).toMatchObject({ name: "本文", fontSize: 12 });
    expect(next.history.past).toHaveLength(1);
    expect(run(state, { type: "textStyle/update", id: body.id, style: body, name: "內文" })).toBe(state);
    // 只改名也可以；名稱重複時整個不做
    expect(run(state, { type: "textStyle/update", id: body.id, style: body, name: "本文" }).history.present.textStyles[2].name).toBe("本文");
    expect(run(state, { type: "textStyle/update", id: body.id, style: { ...body, fontSize: 12 }, name: heading.name })).toBe(state);
  });

  it("textStyle/update ignores the same values, unknown styles and invalid fields", () => {
    const { state } = styledState();
    expect(run(state, { type: "textStyle/update", id: body.id, style: body })).toBe(state);
    expect(run(state, { type: "textStyle/update", id: "missing", style: { ...body, fontSize: 30 } })).toBe(state);
    expect(run(state, { type: "textStyle/update", id: body.id, style: { ...body, fontSize: 1 } })).toBe(state);
    expect(run(state, { type: "textStyle/update", id: body.id, style: { ...body, fill: "red" } })).toBe(state);
  });

  it("textStyle/add appends a style and can link the selection in the same step", () => {
    const { state: initial, text, shape } = styledState();
    const style = { ...body, id: "custom", name: nextTextStyleName(defaultTextStyles()), fontSize: 15 };
    const state = run(initial, {
      type: "textStyle/add",
      style,
      link: { pageId: selectActivePage(initial).id, ids: [text.id, shape.id] },
    });
    expect(state.history.present.textStyles.map((s) => s.id)).toEqual([...defaultTextStyles().map((s) => s.id), "custom"]);
    expect(elementsOf(state)[0]).toMatchObject({ styleId: "custom", fontSize: 15 });
    expect(elementsOf(state)[1]).toMatchObject({ label: { styleId: "custom", fontSize: 15, text: "圖" } });
    expect(state.history.past).toHaveLength(1);

    expect(run(initial, { type: "textStyle/add", style: { ...style, id: body.id } })).toBe(initial);
    expect(run(initial, { type: "textStyle/add", style: { ...style, name: body.name } })).toBe(initial);
    expect(run(initial, { type: "textStyle/add", style: { ...style, name: " x" } })).toBe(initial);
    expect(run(initial, { type: "textStyle/add", style, link: { pageId: "missing", ids: [text.id] } })).toBe(initial);
  });

  it("textStyle/rename trims, keeps names unique and ignores no-ops", () => {
    const { state } = styledState();
    const renamed = run(state, { type: "textStyle/rename", id: body.id, name: "  本文  " });
    expect(renamed.history.present.textStyles[2].name).toBe("本文");
    expect(run(renamed, { type: "textStyle/rename", id: body.id, name: "本文" })).toBe(renamed);
    expect(run(state, { type: "textStyle/rename", id: body.id, name: heading.name })).toBe(state);
    expect(run(state, { type: "textStyle/rename", id: body.id, name: "   " })).toBe(state);
    expect(run(state, { type: "textStyle/rename", id: "missing", name: "x" })).toBe(state);
  });

  it("textStyle/delete unlinks texts without changing their look", () => {
    const { state: initial, text } = styledState();
    const state = run(initial, { type: "textStyle/delete", id: body.id });
    expect(state.history.present.textStyles.map((s) => s.id)).not.toContain(body.id);
    expect(elementsOf(state)[0]).toEqual({ ...text, styleId: null });
    expect(run(state, { type: "textStyle/delete", id: body.id })).toBe(state);
    expect(elementsOf(run(state, { type: "history/undo" }))[0]).toEqual(text);
  });

  it("element/applyTextStyle links texts and labels, skips other elements, null unlinks", () => {
    const { state: initial, text, shape } = styledState();
    const plain = createShapeElement("ellipse", { x: 0, y: 0 });
    const withImage = run(initial, { type: "element/add", element: plain });
    const state = run(withImage, { type: "element/applyTextStyle", ids: [text.id, shape.id, plain.id], styleId: heading.id });
    expect(elementsOf(state)[0]).toMatchObject({ styleId: heading.id, fontSize: 32, fontStyle: "bold" });
    expect(elementsOf(state)[1]).toMatchObject({ label: { styleId: heading.id, fontSize: 32 } });
    // 沒有文字的圖形不動
    expect(elementsOf(state)[2]).toBe(plain);
    expect(state.history.past).toHaveLength(withImage.history.past.length + 1);

    const unlinked = run(state, { type: "element/applyTextStyle", ids: [text.id], styleId: null });
    expect(elementsOf(unlinked)[0]).toEqual({ ...elementsOf(state)[0], styleId: null });
    expect(run(state, { type: "element/applyTextStyle", ids: [text.id], styleId: heading.id })).toBe(state);
    expect(run(state, { type: "element/applyTextStyle", ids: [text.id], styleId: "missing" })).toBe(state);
  });

  it("rejects elements and patches that link a missing style", () => {
    const { state, text, shape } = styledState();
    const orphan = { ...createTextElement("body", { x: 0, y: 0 }), styleId: "missing" };
    expect(run(state, { type: "element/add", element: orphan })).toBe(state);
    expect(run(state, { type: "element/update", id: text.id, patch: { styleId: "missing" } })).toBe(state);
    expect(run(state, { type: "element/update", id: shape.id, patch: { label: { ...shape.label, styleId: "missing" } } })).toBe(state);
    expect(run(state, { type: "element/update", id: text.id, patch: { styleId: heading.id } })).not.toBe(state);
  });
});
