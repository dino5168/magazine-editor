import { describe, expect, it } from "vitest";
import { DEFAULT_MARGINS, createMasterPage, createPage, createShapeElement } from "../element-factory";
import { createInitialState, editorReducer, selectActivePage, selectReturnPageId } from "../editor-reducer";
import type { EditorDocument, MasterPage, Page } from "../types";
import { blankState, run } from "./editor-reducer-setup";

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
      swatches: [], fonts: [],
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
