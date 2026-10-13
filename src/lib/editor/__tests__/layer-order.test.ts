import { describe, expect, it } from "vitest";
import { createInitialState, editorReducer, selectActivePage } from "../editor-reducer";
import { createShapeInBox } from "../element-factory";
import { canReorder, REORDER_DIRECTIONS } from "../layer-order";
import type { CanvasElement } from "../types";

const shape = (id: string): CanvasElement => ({ ...createShapeInBox("rect", { minX: 0, minY: 0, maxX: 10, maxY: 10 }), id });
// index 0 是最底層
const ELEMENTS = [shape("a"), shape("b"), shape("c")];

describe("canReorder", () => {
  it("allows moving up only below the top", () => {
    expect(canReorder(ELEMENTS, "c", "top")).toBe(false);
    expect(canReorder(ELEMENTS, "c", "up")).toBe(false);
    expect(canReorder(ELEMENTS, "b", "top")).toBe(true);
    expect(canReorder(ELEMENTS, "a", "up")).toBe(true);
  });

  it("allows moving down only above the bottom", () => {
    expect(canReorder(ELEMENTS, "a", "bottom")).toBe(false);
    expect(canReorder(ELEMENTS, "a", "down")).toBe(false);
    expect(canReorder(ELEMENTS, "b", "bottom")).toBe(true);
    expect(canReorder(ELEMENTS, "c", "down")).toBe(true);
  });

  it("is false for a lone element or an unknown id", () => {
    for (const direction of REORDER_DIRECTIONS) {
      expect(canReorder([shape("a")], "a", direction)).toBe(false);
      expect(canReorder(ELEMENTS, "missing", direction)).toBe(false);
    }
  });

  it("matches whether element/reorder changes the state", () => {
    let state = createInitialState();
    for (const element of ELEMENTS) state = editorReducer(state, { type: "element/add", element });
    const elements = selectActivePage(state).elements;
    for (const { id } of elements) {
      for (const direction of REORDER_DIRECTIONS) {
        const next = editorReducer(state, { type: "element/reorder", id, direction });
        expect(next !== state).toBe(canReorder(elements, id, direction));
      }
    }
  });
});
