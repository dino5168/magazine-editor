import { describe, expect, it } from "vitest";
import { DEFAULT_MARGINS, createLineElement, createPage, describeLine } from "../element-factory";
import { createInitialState, editorReducer, selectActivePage, type EditorAction, type EditorState } from "../editor-reducer";
import { getElementBounds } from "../geometry";
import { linePointBounds, normalizeLinePoints } from "../line-geometry";
import type { EditorDocument, LineElement } from "../types";
import { LINE_END_SCALE_MAX, MAX_LINE_POINTS, isLineEnd, isLinePoints, isValidLine } from "../validation";

function blankState(): EditorState {
  const document: EditorDocument = {
    name: "測試文件",
    margins: DEFAULT_MARGINS,
    textStyles: [],
    swatches: [],
    fonts: [],
    pageNumberRules: [],
    masters: [],
    pages: [createPage("Page-1", { width: 595, height: 842 }, "#ffffff")],
  };
  return createInitialState(document);
}

function run(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(editorReducer, state);
}

const arrow = (): LineElement =>
  createLineElement(
    [
      { x: 300, y: 200 },
      { x: 100, y: 120 },
    ],
    { end: { arrowhead: "triangle", scale: 1 } },
  );

describe("line geometry", () => {
  it("puts (x, y) at the top-left corner of the points", () => {
    const line = arrow();
    expect(line).toMatchObject({ x: 100, y: 120, rotation: 0 });
    expect(line.points).toEqual([
      { x: 200, y: 80 },
      { x: 0, y: 0 },
    ]);
    expect(normalizeLinePoints([{ x: -5, y: 10 }, { x: 5, y: 10 }])).toEqual({
      x: -5,
      y: 10,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
  });

  it("bounds a horizontal line with zero height", () => {
    const line = createLineElement([
      { x: 50, y: 300 },
      { x: 250, y: 300 },
    ]);
    expect(linePointBounds(line.points)).toEqual({ minX: 0, minY: 0, maxX: 200, maxY: 0 });
    expect(getElementBounds(line)).toEqual({ minX: 50, minY: 300, maxX: 250, maxY: 300 });
  });
});

describe("line validation", () => {
  it("accepts the factory's lines", () => {
    expect(isValidLine(arrow())).toBe(true);
  });

  it("checks the number and range of points", () => {
    expect(isLinePoints([{ x: 0, y: 0 }])).toBe(false);
    expect(isLinePoints(Array.from({ length: MAX_LINE_POINTS + 1 }, (_, x) => ({ x, y: 0 })))).toBe(false);
    expect(isLinePoints([{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }])).toBe(false);
    expect(isLinePoints([{ x: 0, y: 0 }, { x: 2e6, y: 0 }])).toBe(false);
    expect(isLinePoints([{ x: 0, y: 0 }, { x: 1, y: "2" }])).toBe(false);
  });

  it("checks the arrowheads", () => {
    expect(isLineEnd({ arrowhead: "open", scale: 1 })).toBe(true);
    expect(isLineEnd({ arrowhead: "circle", scale: 1 })).toBe(false);
    expect(isLineEnd({ arrowhead: "triangle", scale: LINE_END_SCALE_MAX + 1 })).toBe(false);
    expect(isValidLine({ ...arrow(), path: "bezier" as LineElement["path"] })).toBe(false);
  });
});

describe("describeLine", () => {
  it("names lines by their arrowheads, path and points", () => {
    const plain = createLineElement([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(describeLine(plain)).toBe("直線");
    expect(describeLine({ ...plain, points: [...plain.points, { x: 20, y: 10 }] })).toBe("折線");
    expect(describeLine({ ...plain, path: "smooth" })).toBe("曲線");
    expect(describeLine(arrow())).toBe("箭頭");
    expect(describeLine({ ...arrow(), start: { arrowhead: "open", scale: 1 } })).toBe("雙向箭頭");
  });
});

describe("editorReducer / lines", () => {
  it("adds valid lines and rejects invalid ones", () => {
    const line = arrow();
    const added = run(blankState(), { type: "element/add", element: line });
    expect(selectActivePage(added).elements).toEqual([line]);
    const state = blankState();
    expect(run(state, { type: "element/add", element: { ...line, points: [line.points[0]] } })).toBe(state);
  });

  it("checks the whole line after a patch: a line always keeps a stroke", () => {
    const line = arrow();
    const state = run(blankState(), { type: "element/add", element: line });
    expect(run(state, { type: "element/update", id: line.id, patch: { stroke: null } })).toBe(state);
    expect(run(state, { type: "element/update", id: line.id, patch: { end: { arrowhead: "open", scale: 0 } } })).toBe(state);
    const moved = run(state, {
      type: "element/update",
      id: line.id,
      patch: { x: 10, points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] },
    });
    expect(selectActivePage(moved).elements[0]).toMatchObject({ x: 10, points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] });
  });
});
