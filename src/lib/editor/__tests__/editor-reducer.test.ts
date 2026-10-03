import { describe, expect, it } from "vitest";
import { createPage, createShapeElement, createTextElement } from "../element-factory";
import {
  DUPLICATE_OFFSET_PT,
  HISTORY_LIMIT,
  createInitialState,
  editorReducer,
  selectActivePage,
  selectIsDirty,
  selectSelectedElement,
  selectSelectedElements,
  type EditorAction,
  type EditorState,
} from "../editor-reducer";
import { createLabel } from "../shape-label";
import type { EditorDocument } from "../types";

function blankState(): EditorState {
  const document: EditorDocument = {
    name: "測試文件",
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
    const loaded = run(state, { type: "document/load", document: state.history.present, assets: [], saved: true });
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

describe("editorReducer / project", () => {
  const asset = { src: "assets/images/abc.png", name: "封面.png", width: 1600, height: 900 };

  it("adds an asset once per src", () => {
    const once = run(blankState(), { type: "asset/add", asset });
    const twice = editorReducer(once, { type: "asset/add", asset: { ...asset, name: "另一個名稱.png" } });

    expect(once.assets).toEqual([asset]);
    expect(twice).toBe(once);
    // 素材清單不屬於文件，不進入復原歷史
    expect(once.history.past).toHaveLength(0);
  });

  it("loads a document, clearing history and selection but keeping zoom", () => {
    const element = createShapeElement("rect", { x: 100, y: 100 });
    const edited = run(blankState(), { type: "element/add", element }, { type: "view/setZoom", zoom: 2 });
    const document: EditorDocument = {
      name: "另一個專案",
      pages: [createPage("封面", { width: 400, height: 600 }, "#000000")],
    };

    const loaded = editorReducer(edited, { type: "document/load", document, assets: [asset], saved: true });

    expect(loaded.history).toEqual({ past: [], present: document, future: [] });
    // reducer 必須保存同一個參考，ProjectProvider 才能用 === 判斷是否修改
    expect(loaded.history.present).toBe(document);
    expect(loaded.activePageId).toBe(document.pages[0].id);
    expect(loaded.selectedIds).toEqual([]);
    expect(loaded.assets).toEqual([asset]);
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
      assets: [],
      saved: false,
    });
    expect(loaded.savedDocument).toBeNull();
    expect(selectIsDirty(loaded)).toBe(true);
  });
});
