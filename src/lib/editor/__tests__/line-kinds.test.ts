import { describe, expect, it } from "vitest";
import { createLineElement, createShapeElement, DEFAULT_LINE_STROKE } from "../element-factory";
import { createInitialState, editorReducer } from "../editor-reducer";
import { LINE_KINDS, lineKindEnds, lineKindLabel, toolLineStroke } from "../line-kinds";
import { BUILT_IN_SWATCH_IDS, defaultSwatches } from "../swatches";
import { findToolShortcut, getToolKeyLabel, isCreateTool } from "../tools";

describe("line kinds", () => {
  it("gives arrows a filled head at the end of the drag", () => {
    expect(lineKindEnds("straight")).toMatchObject({ start: { arrowhead: "none" }, end: { arrowhead: "none" } });
    expect(lineKindEnds("arrow")).toMatchObject({ start: { arrowhead: "none" }, end: { arrowhead: "triangle", scale: 1 } });
    expect(lineKindEnds("doubleArrow")).toMatchObject({ start: { arrowhead: "triangle" }, end: { arrowhead: "triangle" } });
    // 名稱和 describeLine 一致
    for (const { id, label } of LINE_KINDS) {
      expect(lineKindLabel(id)).toBe(label);
    }
  });

  it("links the tool's lines to the built-in 文字 swatch when the document has it", () => {
    expect(toolLineStroke(defaultSwatches())).toEqual({ ...DEFAULT_LINE_STROKE, swatchId: BUILT_IN_SWATCH_IDS.text });
    expect(toolLineStroke([])).toEqual(DEFAULT_LINE_STROKE);
    // 「文字」改過色：不連（連結的顏色必須等於色票）
    expect(toolLineStroke([{ id: BUILT_IN_SWATCH_IDS.text, name: "文字", color: "#ff0000" }])).toEqual(DEFAULT_LINE_STROKE);
  });
});

describe("line tool", () => {
  it("is a create tool on the L key, keeping the last line kind", () => {
    expect(isCreateTool("line")).toBe(true);
    expect(isCreateTool("hand")).toBe(false);
    expect(findToolShortcut({ code: "KeyL", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent)).toMatchObject({
      tool: "line",
    });
    expect(getToolKeyLabel("line")).toBe("L");
  });

  it("clears the selection when chosen and remembers the kind", () => {
    const shape = createShapeElement("rect", { x: 100, y: 100 });
    let state = editorReducer(createInitialState(), { type: "element/add", element: shape });
    state = editorReducer(state, { type: "tool/set", tool: "line", line: "arrow" });
    expect(state).toMatchObject({ tool: "line", lineKind: "arrow", selectedIds: [] });
    // 按 L（不帶種類）沿用上次的種類
    state = editorReducer(editorReducer(state, { type: "tool/set", tool: "select" }), { type: "tool/set", tool: "line" });
    expect(state.lineKind).toBe("arrow");
    // 換專案保留工具與種類
    const loaded = editorReducer(state, { type: "document/load", document: state.history.present, saved: true });
    expect(loaded).toMatchObject({ tool: "line", lineKind: "arrow" });
  });

  it("adds the tool's lines, swatch link included, to documents with the built-in swatches", () => {
    const state = createInitialState();
    const line = createLineElement(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      { stroke: toolLineStroke(state.history.present.swatches), ...lineKindEnds("arrow") },
    );
    const next = editorReducer(state, { type: "element/add", element: line });
    expect(next).not.toBe(state);
  });
});
