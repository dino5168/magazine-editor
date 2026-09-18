import { describe, expect, it } from "vitest";
import { createPage, createShapeElement, createTextElement } from "../element-factory";
import {
  HISTORY_LIMIT,
  createInitialState,
  editorReducer,
  selectActivePage,
  selectIsDirty,
  selectSelectedElement,
  type EditorAction,
  type EditorState,
} from "../editor-reducer";
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
    expect(state.selectedId).toBe(element.id);
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

  it("deletes the selected element and clears selection", () => {
    const element = createTextElement("body", { x: 10, y: 10 });
    const state = run(blankState(), { type: "element/add", element }, { type: "element/delete", id: element.id });

    expect(selectActivePage(state).elements).toHaveLength(0);
    expect(state.selectedId).toBeNull();
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
});

describe("editorReducer / pages", () => {
  it("adds a page after the active page, copying size and background, and activates it", () => {
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

    expect(state.selectedId).toBeNull();
    const back = run(state, { type: "page/select", id: state.history.present.pages[0].id });
    expect(back.selectedId).toBeNull();
  });
});

describe("editorReducer / history", () => {
  it("undoes and redoes document changes", () => {
    const element = createShapeElement("rect", { x: 0, y: 0 });
    const added = run(blankState(), { type: "element/add", element });
    const undone = editorReducer(added, { type: "history/undo" });
    const redone = editorReducer(undone, { type: "history/redo" });

    expect(selectActivePage(undone).elements).toHaveLength(0);
    expect(undone.selectedId).toBeNull();
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
    expect(loaded.selectedId).toBeNull();
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
