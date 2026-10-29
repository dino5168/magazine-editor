import { describe, expect, it } from "vitest";
import { createMasterPage, createPage, createShapeElement, createTextElement } from "../element-factory";
import {
  createInitialState,
  editorReducer,
  selectActivePage,
  type EditorAction,
  type EditorState,
} from "../editor-reducer";
import { createPageNumberRule } from "../page-numbers";
import { createLabel } from "../shape-label";
import { BUILT_IN_SWATCH_IDS, defaultSwatches } from "../swatches";
import { defaultTextStyles, nextTextStyleName, pickTextStyle, styleOverrides } from "../style-sheet";
import type { ShapeElement, TextElement } from "../types";
import { blankState, run } from "./editor-reducer-setup";

describe("editorReducer / text styles", () => {
  const [heading, , body] = defaultTextStyles();

  /** A page with a text and a labelled shape; the style sheet holds the built-in styles. */
  function styledState() {
    const text = { ...createTextElement("body", { x: 100, y: 100 }), styleId: body.id };
    const shape = { ...createShapeElement("rect", { x: 300, y: 300 }), label: { ...createLabel("圖"), styleId: null } };
    const initial = blankState();
    const document = {
      ...initial.history.present,
      textStyles: defaultTextStyles(),
      swatches: [], fonts: [],
      pages: [{ ...initial.history.present.pages[0], elements: [text, shape] }],
    };
    return { state: createInitialState(document), text, shape };
  }

  const elementsOf = (state: EditorState) => selectActivePage(state).elements;

  it("textStyle/update makes linked texts follow, keeps overrides, one undo step", () => {
    const { state: initial, text } = styledState();
    const overridden = run(initial, { type: "element/update", id: text.id, patch: { fill: "#dc2626" } });
    const state = run(overridden, { type: "textStyle/update", id: body.id, style: { ...body, fontSize: 12, fill: "#1e3a8a" } });
    expect(elementsOf(state)[0]).toMatchObject({ fontSize: 12, fill: "#dc2626", styleId: body.id });
    expect(state.history.present.textStyles[2]).toMatchObject({ fontSize: 12, fill: "#1e3a8a", name: "內文" });
    expect(state.history.past).toHaveLength(overridden.history.past.length + 1);
    // 不連結的圖形內文字不動
    expect(elementsOf(state)[1]).toBe(elementsOf(overridden)[1]);
    expect(run(state, { type: "history/undo" }).history.present).toBe(overridden.history.present);
  });

  it("textStyle/update can rename in the same undo step", () => {
    const { state } = styledState();
    const next = run(state, { type: "textStyle/update", id: body.id, style: { ...body, fontSize: 12 }, name: " 本文 " });
    expect(next.history.present.textStyles[2]).toMatchObject({ name: "本文", fontSize: 12 });
    expect(next.history.past).toHaveLength(1);
    expect(run(state, { type: "textStyle/update", id: body.id, style: body, name: "內文" })).toBe(state);
    // 只改名也可以；名稱重複時整個不做
    expect(run(state, { type: "textStyle/update", id: body.id, style: body, name: "本文" }).history.present.textStyles[2].name).toBe("本文");
    expect(run(state, { type: "textStyle/update", id: body.id, style: { ...body, fontSize: 12 }, name: heading.name })).toBe(state);
  });

  it("textStyle/update ignores the same values, unknown styles and invalid fields", () => {
    const { state } = styledState();
    expect(run(state, { type: "textStyle/update", id: body.id, style: body })).toBe(state);
    expect(run(state, { type: "textStyle/update", id: "missing", style: { ...body, fontSize: 30 } })).toBe(state);
    expect(run(state, { type: "textStyle/update", id: body.id, style: { ...body, fontSize: 1 } })).toBe(state);
    expect(run(state, { type: "textStyle/update", id: body.id, style: { ...body, fill: "red" } })).toBe(state);
  });

  it("textStyle/add appends a style and can link the selection in the same step", () => {
    const { state: initial, text, shape } = styledState();
    const style = { ...body, id: "custom", name: nextTextStyleName(defaultTextStyles()), fontSize: 15 };
    const state = run(initial, {
      type: "textStyle/add",
      style,
      link: { pageId: selectActivePage(initial).id, ids: [text.id, shape.id] },
    });
    expect(state.history.present.textStyles.map((s) => s.id)).toEqual([...defaultTextStyles().map((s) => s.id), "custom"]);
    expect(elementsOf(state)[0]).toMatchObject({ styleId: "custom", fontSize: 15 });
    expect(elementsOf(state)[1]).toMatchObject({ label: { styleId: "custom", fontSize: 15, text: "圖" } });
    expect(state.history.past).toHaveLength(1);

    expect(run(initial, { type: "textStyle/add", style: { ...style, id: body.id } })).toBe(initial);
    expect(run(initial, { type: "textStyle/add", style: { ...style, name: body.name } })).toBe(initial);
    expect(run(initial, { type: "textStyle/add", style: { ...style, name: " x" } })).toBe(initial);
    expect(run(initial, { type: "textStyle/add", style, link: { pageId: "missing", ids: [text.id] } })).toBe(initial);
  });

  it("textStyle/rename trims, keeps names unique and ignores no-ops", () => {
    const { state } = styledState();
    const renamed = run(state, { type: "textStyle/rename", id: body.id, name: "  本文  " });
    expect(renamed.history.present.textStyles[2].name).toBe("本文");
    expect(run(renamed, { type: "textStyle/rename", id: body.id, name: "本文" })).toBe(renamed);
    expect(run(state, { type: "textStyle/rename", id: body.id, name: heading.name })).toBe(state);
    expect(run(state, { type: "textStyle/rename", id: body.id, name: "   " })).toBe(state);
    expect(run(state, { type: "textStyle/rename", id: "missing", name: "x" })).toBe(state);
  });

  it("textStyle/delete unlinks texts without changing their look", () => {
    const { state: initial, text } = styledState();
    const state = run(initial, { type: "textStyle/delete", id: body.id });
    expect(state.history.present.textStyles.map((s) => s.id)).not.toContain(body.id);
    expect(elementsOf(state)[0]).toEqual({ ...text, styleId: null });
    expect(run(state, { type: "textStyle/delete", id: body.id })).toBe(state);
    expect(elementsOf(run(state, { type: "history/undo" }))[0]).toEqual(text);
  });

  it("element/applyTextStyle links texts and labels, skips other elements, null unlinks", () => {
    const { state: initial, text, shape } = styledState();
    const plain = createShapeElement("ellipse", { x: 0, y: 0 });
    const withImage = run(initial, { type: "element/add", element: plain });
    const state = run(withImage, { type: "element/applyTextStyle", ids: [text.id, shape.id, plain.id], styleId: heading.id });
    expect(elementsOf(state)[0]).toMatchObject({ styleId: heading.id, fontSize: 32, fontStyle: "bold" });
    expect(elementsOf(state)[1]).toMatchObject({ label: { styleId: heading.id, fontSize: 32 } });
    // 沒有文字的圖形不動
    expect(elementsOf(state)[2]).toBe(plain);
    expect(state.history.past).toHaveLength(withImage.history.past.length + 1);

    const unlinked = run(state, { type: "element/applyTextStyle", ids: [text.id], styleId: null });
    expect(elementsOf(unlinked)[0]).toEqual({ ...elementsOf(state)[0], styleId: null });
    expect(run(state, { type: "element/applyTextStyle", ids: [text.id], styleId: heading.id })).toBe(state);
    expect(run(state, { type: "element/applyTextStyle", ids: [text.id], styleId: "missing" })).toBe(state);
  });

  it("rejects elements and patches that link a missing style", () => {
    const { state, text, shape } = styledState();
    const orphan = { ...createTextElement("body", { x: 0, y: 0 }), styleId: "missing" };
    expect(run(state, { type: "element/add", element: orphan })).toBe(state);
    expect(run(state, { type: "element/update", id: text.id, patch: { styleId: "missing" } })).toBe(state);
    expect(run(state, { type: "element/update", id: shape.id, patch: { label: { ...shape.label, styleId: "missing" } } })).toBe(state);
    expect(run(state, { type: "element/update", id: text.id, patch: { styleId: heading.id } })).not.toBe(state);
  });

  it("accepts line height and letter spacing within range only; a changed value is an override", () => {
    const { state, text, shape } = styledState();
    const update = (patch: object, id = text.id) => run(state, { type: "element/update", id, patch } as EditorAction);
    for (const patch of [{ lineHeight: 0.4 }, { lineHeight: 3.1 }, { letterSpacing: -201 }, { letterSpacing: 1001 }, { lineHeight: Number.NaN }]) {
      expect(update(patch)).toBe(state);
    }
    expect(update({ label: { ...shape.label, lineHeight: 5 } }, shape.id)).toBe(state);
    const spaced = update({ lineHeight: 2, letterSpacing: 100 });
    const element = elementsOf(spaced).find((e) => e.id === text.id) as TextElement;
    expect(element).toMatchObject({ lineHeight: 2, letterSpacing: 100 });
    const style = spaced.history.present.textStyles.find((s) => s.id === element.styleId)!;
    expect(styleOverrides(element, style)).toEqual(["lineHeight", "letterSpacing"]);
    // 改樣式的行距：被覆寫的文字不跟著變
    const restyled = run(spaced, { type: "textStyle/update", id: style.id, style: { ...pickTextStyle(style), lineHeight: 1.8 } });
    expect((elementsOf(restyled).find((e) => e.id === text.id) as TextElement).lineHeight).toBe(2);
  });

  it("accepts indents within range only, checked on the patched text; a changed indent is an override", () => {
    const { state, text, shape } = styledState();
    const update = (patch: object, id = text.id) => run(state, { type: "element/update", id, patch } as EditorAction);
    // 首行不可比框左緣更左（≥ −左縮排）：只給首行時以文字原本的左縮排（0）判斷
    for (const patch of [{ indentLeft: -1 }, { indentRight: 21 }, { indentFirstLine: -1 }, { indentLeft: 2, indentFirstLine: -3 }, { indentFirstLine: Number.NaN }]) {
      expect(update(patch)).toBe(state);
    }
    expect(update({ label: { ...shape.label, indentFirstLine: -1 } }, shape.id)).toBe(state);
    const hanging = update({ indentLeft: 2, indentFirstLine: -2 });
    const element = elementsOf(hanging).find((e) => e.id === text.id) as TextElement;
    expect(element).toMatchObject({ indentLeft: 2, indentRight: 0, indentFirstLine: -2 });
    const style = hanging.history.present.textStyles.find((s) => s.id === element.styleId)!;
    expect(styleOverrides(element, style)).toEqual(["indentLeft", "indentFirstLine"]);
    // 左縮排改回 0 時首行 −2 就不合法
    expect(run(hanging, { type: "element/update", id: text.id, patch: { indentLeft: 0 } })).toBe(hanging);
    expect(run(state, { type: "element/add", element: { ...createTextElement("body", { x: 0, y: 0 }), indentFirstLine: -1 } })).toBe(state);
    // 樣式本身的縮排也要合法
    expect(run(state, { type: "textStyle/update", id: style.id, style: { ...pickTextStyle(style), indentRight: -1 } })).toBe(state);
  });
});

describe("editorReducer / swatches", () => {
  const brand = { id: "brand", name: "品牌紅", color: "#be123c" };
  const { text: TEXT, white: WHITE } = BUILT_IN_SWATCH_IDS;

  function swatchState(): EditorState {
    const state = blankState();
    return createInitialState({ ...state.history.present, swatches: [...defaultSwatches(), brand] });
  }

  /** A rectangle filled with 品牌紅 at 50%. */
  const linkedRect = (): ShapeElement => ({
    ...createShapeElement("rect", { x: 100, y: 100 }),
    fill: "#be123c80",
    fillSwatchId: "brand",
  });
  const shapeOf = (state: EditorState, id: string) => selectActivePage(state).elements.find((e) => e.id === id) as ShapeElement;

  it("adds, renames and recolors swatches, one undo step each", () => {
    const added = run(blankState(), { type: "swatch/add", swatch: brand });
    expect(added.history.present.swatches).toEqual([brand]);
    expect(added.history.past).toHaveLength(1);
    const renamed = run(added, { type: "swatch/update", id: "brand", name: " 主色 " });
    expect(renamed.history.present.swatches[0].name).toBe("主色");
    expect(run(renamed, { type: "history/undo" }).history.present.swatches[0].name).toBe("品牌紅");
    // 名稱重複、id 重複、顏色不合法、不存在：不做
    const invalid: EditorAction[] = [
      { type: "swatch/add", swatch: { ...brand, id: "other" } },
      { type: "swatch/add", swatch: { ...brand, name: "其他" } },
      { type: "swatch/add", swatch: { id: "x", name: "x", color: "#BE123C" } },
      { type: "swatch/update", id: "brand", color: "#be123c80" },
      { type: "swatch/update", id: "missing", name: "x" },
    ];
    for (const action of invalid) expect(editorReducer(added, action), JSON.stringify(action)).toBe(added);
  });

  it("recolors every use of a swatch in one undo step, keeping each use's alpha", () => {
    const element = linkedRect();
    const state = run(swatchState(), { type: "element/add", element }, { type: "swatch/update", id: "brand", color: "#2563eb" });
    expect(shapeOf(state, element.id)).toMatchObject({ fill: "#2563eb80", fillSwatchId: "brand" });
    expect(shapeOf(run(state, { type: "history/undo" }), element.id).fill).toBe("#be123c80");
  });

  it("deletes a swatch, moving its uses to a replacement or unlinking them", () => {
    const element = linkedRect();
    const state = run(swatchState(), { type: "element/add", element });
    const replaced = run(state, { type: "swatch/delete", id: "brand", replaceWith: TEXT });
    expect(shapeOf(replaced, element.id)).toMatchObject({ fill: "#17171780", fillSwatchId: TEXT });
    const unlinked = run(state, { type: "swatch/delete", id: "brand", replaceWith: null });
    expect(shapeOf(unlinked, element.id)).toMatchObject({ fill: "#be123c80", fillSwatchId: null });
    expect(editorReducer(state, { type: "swatch/delete", id: "brand", replaceWith: "missing" })).toBe(state);
  });

  it("applies the swatch dialog in one undo step and ignores invalid edits", () => {
    const state = swatchState();
    const swatches = [{ ...brand, color: "#16a34a" }, ...defaultSwatches()];
    const next = run(state, { type: "swatch/applyEdits", swatches, deletions: [] });
    expect(next.history.present.swatches).toEqual(swatches);
    expect(next.history.past).toHaveLength(1);
    expect(editorReducer(state, { type: "swatch/applyEdits", swatches: defaultSwatches(), deletions: [] })).toBe(state);
  });

  it("only accepts links to existing swatches whose color matches", () => {
    const state = swatchState();
    const element = linkedRect();
    expect(editorReducer(state, { type: "element/add", element: { ...element, fillSwatchId: "missing" } })).toBe(state);
    expect(editorReducer(state, { type: "element/add", element: { ...element, fill: "#000000" } })).toBe(state);
    const stroke = { color: "#be123c", swatchId: "missing", width: 1, dash: "solid" } as const;
    expect(editorReducer(state, { type: "element/add", element: { ...element, stroke } })).toBe(state);
    expect(selectActivePage(run(state, { type: "element/add", element })).elements).toHaveLength(1);
  });

  it("links and unlinks element colors through updates", () => {
    const element = createShapeElement("rect", { x: 100, y: 100 });
    const state = run(swatchState(), { type: "element/add", element });
    const linked = run(state, { type: "element/update", id: element.id, patch: { fill: "#be123c", fillSwatchId: "brand" } });
    expect(shapeOf(linked, element.id)).toMatchObject({ fill: "#be123c", fillSwatchId: "brand" });
    // 只給顏色 = 取消連結；只改透明度時呼叫端連同連結一起給
    const plain = run(linked, { type: "element/update", id: element.id, patch: { fill: "#000000" } });
    expect(shapeOf(plain, element.id).fillSwatchId).toBeNull();
    const faded = run(linked, { type: "element/update", id: element.id, patch: { fill: "#be123c80", fillSwatchId: "brand" } });
    expect(shapeOf(faded, element.id)).toMatchObject({ fill: "#be123c80", fillSwatchId: "brand" });
    // 連結和顏色對不上、連到不存在的色票、型別不對：不做
    expect(editorReducer(state, { type: "element/update", id: element.id, patch: { fillSwatchId: "brand" } })).toBe(state);
    expect(editorReducer(state, { type: "element/update", id: element.id, patch: { fill: "#be123c", fillSwatchId: "x" } })).toBe(state);
    expect(editorReducer(state, { type: "element/update", id: element.id, patch: { fillSwatchId: 3 as never } })).toBe(state);
  });

  it("links page backgrounds and copies the link to new pages", () => {
    const state = swatchState();
    const pageId = selectActivePage(state).id;
    const linked = run(state, { type: "page/setBackground", id: pageId, color: "#ffffff", swatchId: WHITE });
    expect(selectActivePage(linked)).toMatchObject({ background: "#ffffff", backgroundSwatchId: WHITE });
    expect(editorReducer(state, { type: "page/setBackground", id: pageId, color: "#000000", swatchId: WHITE })).toBe(state);
    expect(selectActivePage(run(linked, { type: "page/add" })).backgroundSwatchId).toBe(WHITE);
    const plain = run(linked, { type: "page/setBackground", id: pageId, color: "#ffffff" });
    expect(selectActivePage(plain).backgroundSwatchId).toBeNull();
  });

  it("checks links in new pages, master pages, text styles and page numbers", () => {
    const state = swatchState();
    const page = { ...createPage("Page-2", { width: 595, height: 842 }, "#ffffff"), backgroundSwatchId: "missing" };
    expect(editorReducer(state, { type: "page/addMany", pages: [page], index: 1 })).toBe(state);
    const master = createMasterPage("Master A", { width: 595, height: 842 }, "#ffffff", null, "missing");
    expect(editorReducer(state, { type: "master/add", master })).toBe(state);
    const style = { ...defaultTextStyles()[0], id: "s", name: "s", fillSwatchId: "missing" };
    expect(editorReducer(state, { type: "textStyle/add", style })).toBe(state);
    const rule = createPageNumberRule("r", 1, 1);
    const bad = { ...rule, style: { ...rule.style, fillSwatchId: "missing" } };
    expect(editorReducer(state, { type: "document/setPageNumbering", rules: [bad] })).toBe(state);
    const good = { ...rule, style: { ...rule.style, fill: "#171717", fillSwatchId: TEXT } };
    expect(run(state, { type: "document/setPageNumbering", rules: [good] }).history.present.pageNumberRules).toEqual([good]);
  });
});
