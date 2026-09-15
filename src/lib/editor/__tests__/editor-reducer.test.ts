import { describe, expect, it } from "vitest";
import { createPage, createShapeElement, createTextElement } from "../element-factory";
import {
  HISTORY_LIMIT,
  createInitialState,
  editorReducer,
  selectActivePage,
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
