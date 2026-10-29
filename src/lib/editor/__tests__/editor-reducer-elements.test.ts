import { describe, expect, it } from "vitest";
import { createMasterPage, createShapeElement, createTextElement } from "../element-factory";
import {
  DUPLICATE_OFFSET_PT,
  editorReducer,
  selectActivePage,
  selectSelectedElement,
  selectSelectedElements,
  type EditorState,
} from "../editor-reducer";
import { shapeImageOf } from "../shape-image";
import { createLabel } from "../shape-label";
import type { Page, ShapeElement } from "../types";
import { blankState, run } from "./editor-reducer-setup";

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
    const stroke = { color: "#00000080", swatchId: null, width: 2, dash: "dotted" } as const;

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
    const shadow = { color: "#00000080", swatchId: null, offsetX: -3, offsetY: 50 };
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

  it("puts a photo in a shape, removes it, and rejects invalid photos", () => {
    const element = createShapeElement("ellipse", { x: 100, y: 100 });
    const state = run(blankState(), { type: "element/add", element });
    const photo = shapeImageOf("assets/images/p.png", { width: 200, height: 150 });

    const withPhoto = editorReducer(state, { type: "element/update", id: element.id, patch: { image: photo } });
    expect(selectActivePage(withPhoto).elements[0]).toMatchObject({ image: photo });
    const removed = editorReducer(withPhoto, { type: "element/update", id: element.id, patch: { image: null } });
    expect(selectActivePage(removed).elements[0]).toMatchObject({ image: null });
    for (const bad of [{ ...photo, zoom: 0 }, { ...photo, fit: "fill" }, { ...photo, imageWidth: -1 }]) {
      expect(editorReducer(state, { type: "element/update", id: element.id, patch: { image: bad as never } })).toBe(state);
    }
    // 新增的物件也檢查
    const badShape = { ...createShapeElement("rect", { x: 0, y: 0 }), image: { ...photo, focusX: 2 } };
    expect(editorReducer(state, { type: "element/add", element: badShape })).toBe(state);
  });

  it("replaces an element in place (same layer, selection kept, one undo step)", () => {
    const below = createShapeElement("rect", { x: 0, y: 0 });
    const target = createShapeElement("ellipse", { x: 100, y: 100 });
    const above = createShapeElement("star", { x: 200, y: 200 });
    const state = run(blankState(), ...[below, target, above].map((element) => ({ type: "element/add", element }) as const), {
      type: "selection/set",
      id: target.id,
    });
    const frame: ShapeElement = { ...target, geometry: { kind: "rect", cornerRadius: 0 }, image: shapeImageOf("assets/images/p.png", { width: 200, height: 150 }) };
    const next = editorReducer(state, { type: "element/replace", element: frame });

    expect(selectActivePage(next).elements).toEqual([below, frame, above]);
    expect(next.selectedIds).toEqual([target.id]);
    expect(next.history.past).toHaveLength(state.history.past.length + 1);
    expect(selectActivePage(editorReducer(next, { type: "history/undo" })).elements[1]).toBe(target);
    // 沒有這個 id、內容不合法、完全相同：不動
    expect(editorReducer(state, { type: "element/replace", element: { ...frame, id: "nope" } })).toBe(state);
    expect(editorReducer(state, { type: "element/replace", element: { ...frame, image: { ...frame.image!, zoom: 0 } } })).toBe(state);
    expect(editorReducer(state, { type: "element/replace", element: target })).toBe(state);
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

  it("changes a shape into a shape-library shape and ignores malformed ones", () => {
    const element = createShapeElement("rect", { x: 100, y: 100 });
    const state = run(blankState(), { type: "element/add", element });
    const geometry = { kind: "preset", preset: "hexagon", params: { size: 0.25 } } as const;

    expect(selectSelectedElement(run(state, { type: "element/update", id: element.id, patch: { geometry } }))).toMatchObject({
      geometry,
    });
    expect(
      editorReducer(state, { type: "element/update", id: element.id, patch: { geometry: { ...geometry, preset: "../x" } } }),
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

  it("remembers a shape-library shape as the last shape", () => {
    const state = run(blankState(), { type: "tool/set", tool: "shape", shape: "preset:cloud" }, { type: "tool/set", tool: "select" });
    expect(run(state, { type: "tool/set", tool: "shape" }).shapeKind).toBe("preset:cloud");
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
