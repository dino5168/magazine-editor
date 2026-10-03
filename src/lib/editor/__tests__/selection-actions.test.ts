import { describe, expect, it } from "vitest";
import { createPage, createShapeElement } from "../element-factory";
import { createInitialState, editorReducer, selectActivePage, type EditorState } from "../editor-reducer";
import { deleteSelection, duplicateSelection, nudgeSelection } from "../selection-actions";

function stateWithTwo() {
  const a = createShapeElement("rect", { x: 100, y: 100 });
  const b = createShapeElement("ellipse", { x: 200, y: 300 });
  const page = { ...createPage("Page-1", { width: 595, height: 842 }, "#ffffff"), elements: [a, b] };
  const state: EditorState = createInitialState({ name: "測試", pages: [page] });
  return { a, b, state };
}

describe("selection actions", () => {
  it("nudges every selected element by the same offset in one undo step", () => {
    const { a, b, state } = stateWithTwo();
    const next = editorReducer(state, nudgeSelection([a, b], 10, -1));

    expect(selectActivePage(next).elements.map(({ x, y }) => [x, y])).toEqual([[a.x + 10, a.y - 1], [b.x + 10, b.y - 1]]);
    expect(next.history.past).toHaveLength(1);
  });

  it("deletes and duplicates the whole selection", () => {
    const { a, b, state } = stateWithTwo();

    expect(selectActivePage(editorReducer(state, deleteSelection([a, b]))).elements).toEqual([]);
    const copied = editorReducer(state, duplicateSelection([a, b]));
    expect(selectActivePage(copied).elements).toHaveLength(4);
    expect(copied.selectedIds).toHaveLength(2);
    expect(copied.selectedIds).not.toContain(a.id);
  });
});
