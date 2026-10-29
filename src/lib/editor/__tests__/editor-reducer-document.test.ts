import { describe, expect, it } from "vitest";
import { DEFAULT_MARGINS, createPage, createShapeElement } from "../element-factory";
import { editorReducer, selectIsDirty } from "../editor-reducer";
import { createPageNumberRule } from "../page-numbers";
import type { EditorDocument } from "../types";
import { blankState, run } from "./editor-reducer-setup";

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

describe("editorReducer / page setup", () => {
  const B5 = { width: 515.9, height: 728.5 };
  const margins = { top: 20, right: 30, bottom: 40, left: 50 };

  it("resizes every page and sets the margins in one undo step, leaving elements in place", () => {
    const element = createShapeElement("rect", { x: 100, y: 100 });
    const state = run(blankState(), { type: "element/add", element }, { type: "page/add" });
    const pastLength = state.history.past.length;

    const next = run(state, { type: "document/setPageSetup", size: B5, margins });
    const { pages } = next.history.present;

    expect(pages.map((p) => [p.width, p.height])).toEqual([
      [B5.width, B5.height],
      [B5.width, B5.height],
    ]);
    expect(next.history.present.margins).toEqual(margins);
    expect(pages[0].elements).toBe(state.history.present.pages[0].elements);
    expect(next.history.past).toHaveLength(pastLength + 1);
    expect(run(next, { type: "history/undo" }).history.present).toBe(state.history.present);
  });

  it("keeps unchanged parts and returns the same state when nothing changes", () => {
    const state = blankState();
    const document = state.history.present;
    const size = { width: document.pages[0].width, height: document.pages[0].height };

    expect(editorReducer(state, { type: "document/setPageSetup", size, margins: { ...document.margins } })).toBe(state);

    const onlyMargins = run(state, { type: "document/setPageSetup", size, margins });
    expect(onlyMargins.history.present.pages).toBe(document.pages);

    const onlySize = run(state, { type: "document/setPageSetup", size: B5, margins: document.margins });
    expect(onlySize.history.present.margins).toBe(document.margins);
  });

  it("rejects sizes outside 10–2000 mm and invalid margins", () => {
    const state = blankState();
    const reject = (size: { width: number; height: number }, m: typeof margins) =>
      expect(editorReducer(state, { type: "document/setPageSetup", size, margins: m })).toBe(state);

    reject({ width: 20, height: 600 }, margins);
    reject({ width: 600, height: 6000 }, margins);
    reject({ width: Number.NaN, height: 600 }, margins);
    reject(B5, { ...margins, top: -1 });
    reject(B5, { ...margins, left: Number.POSITIVE_INFINITY });
    reject(B5, { ...margins, right: 6000 });
  });
});

describe("editorReducer / page numbering", () => {
  const front = createPageNumberRule("front", 1, 2);
  const body = { ...createPageNumberRule("body", 3, 20), start: 1 };

  it("stores the rules sorted by first page in one undo step", () => {
    const state = blankState();
    const next = run(state, { type: "document/setPageNumbering", rules: [body, front] });

    expect(next.history.present.pageNumberRules.map((r) => r.id)).toEqual(["front", "body"]);
    expect(next.history.present.pages).toBe(state.history.present.pages);
    expect(next.history.past).toHaveLength(1);
    expect(run(next, { type: "history/undo" }).history.present).toBe(state.history.present);
    expect(run(next, { type: "document/setPageNumbering", rules: [] }).history.present.pageNumberRules).toEqual([]);
  });

  it("returns the same state when the rules do not change", () => {
    const state = run(blankState(), { type: "document/setPageNumbering", rules: [front, body] });
    expect(editorReducer(state, { type: "document/setPageNumbering", rules: [{ ...body }, { ...front }] })).toBe(state);
    expect(editorReducer(blankState(), { type: "document/setPageNumbering", rules: [] }).history.past).toHaveLength(0);
  });

  it("rejects invalid or overlapping rules", () => {
    const state = blankState();
    expect(editorReducer(state, { type: "document/setPageNumbering", rules: [front, { ...body, from: 2 }] })).toBe(state);
    expect(editorReducer(state, { type: "document/setPageNumbering", rules: [{ ...front, to: 0 }] })).toBe(state);
  });
});

describe("editorReducer / project", () => {
  it("loads a document, clearing history and selection but keeping zoom", () => {
    const element = createShapeElement("rect", { x: 100, y: 100 });
    const edited = run(blankState(), { type: "element/add", element }, { type: "view/setZoom", zoom: 2 });
    const document: EditorDocument = {
      name: "另一個專案",
      margins: DEFAULT_MARGINS,
      textStyles: [],
      swatches: [], fonts: [],
      pageNumberRules: [],
      masters: [],
      pages: [createPage("封面", { width: 400, height: 600 }, "#000000")],
    };

    const loaded = editorReducer(edited, { type: "document/load", document, saved: true });

    expect(loaded.history).toEqual({ past: [], present: document, future: [] });
    // reducer 必須保存同一個參考，ProjectProvider 才能用 === 判斷是否修改
    expect(loaded.history.present).toBe(document);
    expect(loaded.activePageId).toBe(document.pages[0].id);
    expect(loaded.selectedIds).toEqual([]);
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
      saved: false,
    });
    expect(loaded.savedDocument).toBeNull();
    expect(selectIsDirty(loaded)).toBe(true);
  });
});
