import { describe, expect, it } from "vitest";
import { createShapeElement, createTextElement } from "../element-factory";
import { HISTORY_LIMIT, editorReducer, selectActivePage, type EditorAction } from "../editor-reducer";
import { blankState, run } from "./editor-reducer-setup";

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

describe("editorReducer / history/batch", () => {
  const text = createTextElement("body", { x: 10, y: 10 });
  const shape = createShapeElement("rect", { x: 50, y: 50 });
  const steps: EditorAction[] = [
    { type: "element/add", element: text },
    { type: "element/add", element: shape },
    { type: "element/update", id: shape.id, patch: { x: 80 } },
  ];

  it("gives the same result as the actions one by one, in one undo step", () => {
    const start = blankState();
    const batched = editorReducer(start, { type: "history/batch", actions: steps });

    expect(batched.history.present).toEqual(run(start, ...steps).history.present);
    expect(batched.history.past).toEqual([start.history.present]);
    expect(batched.selectedIds).toEqual([shape.id]);
    const undone = editorReducer(batched, { type: "history/undo" });
    expect(undone.history.present).toBe(start.history.present);
    expect(editorReducer(undone, { type: "history/redo" }).history.present).toBe(batched.history.present);
  });

  it("clears the redo history like any edit", () => {
    const edited = run(blankState(), { type: "element/add", element: text }, { type: "history/undo" });
    const batched = editorReducer(edited, { type: "history/batch", actions: [{ type: "element/add", element: shape }] });

    expect(batched.history.future).toHaveLength(0);
  });

  it("returns the same state when nothing changes", () => {
    const start = blankState();
    expect(editorReducer(start, { type: "history/batch", actions: [] })).toBe(start);
    expect(
      editorReducer(start, { type: "history/batch", actions: [{ type: "element/update", id: "missing", patch: { x: 1 } }] }),
    ).toBe(start);
  });

  it("keeps UI-only batches out of history", () => {
    const start = run(blankState(), { type: "element/add", element: text });
    const batched = editorReducer(start, {
      type: "history/batch",
      actions: [{ type: "selection/set", id: null }, { type: "view/setZoom", zoom: 2 }],
    });

    expect(batched.selectedIds).toEqual([]);
    expect(batched.view.zoom).toBe(2);
    expect(batched.history).toBe(start.history);
  });

  it("ignores the whole batch when it holds history, load, save or page/add actions", () => {
    const start = run(blankState(), { type: "element/add", element: text });
    const forbidden: EditorAction[] = [
      { type: "history/undo" },
      { type: "history/batch", actions: steps },
      { type: "document/load", document: start.history.present, saved: true },
      { type: "document/markSaved", document: start.history.present },
      { type: "page/add" },
    ];
    for (const action of forbidden) {
      expect(editorReducer(start, { type: "history/batch", actions: [...steps, action] })).toBe(start);
    }
  });

  it(`keeps at most ${HISTORY_LIMIT} history entries and drops the oldest`, () => {
    let state = run(blankState(), { type: "element/add", element: shape });
    for (let i = 1; i < HISTORY_LIMIT; i += 1) {
      state = editorReducer(state, { type: "element/update", id: shape.id, patch: { x: i } });
    }
    const before = state.history;
    const batched = editorReducer(state, { type: "history/batch", actions: steps.slice(0, 1) });

    expect(batched.history.past).toHaveLength(HISTORY_LIMIT);
    expect(batched.history.past[batched.history.past.length - 1]).toBe(before.present);
    expect(batched.history.past[0]).toBe(before.past[1]);
  });
});
