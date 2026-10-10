import { describe, expect, it } from "vitest";
import { createInitialState, selectActivePage } from "@/lib/editor/editor-reducer";
import { createBlankDocument } from "@/lib/editor/element-factory";
import { FONT_OPTIONS } from "@/lib/editor/fonts";
import type { EditorDocument, ImageElement, ShapeElement, TextElement } from "@/lib/editor/types";
import type { Library } from "@/lib/library/types";
import { DEFAULT_TEXT_WIDTH } from "../edits";
import { NO_COMMANDS, toolSession } from "./tool-session";
import fixtureJson from "../../../../tests/fixtures/sample.magproj?raw";
import libraryJson from "../../../../tests/fixtures/sample-library.json?raw";

const fixture = (JSON.parse(fixtureJson) as { document: EditorDocument }).document;

/** A blank document with two pages; the user looks at the first. */
function twoPages() {
  const session = toolSession(createInitialState(createBlankDocument()));
  session.ok("add_page");
  const [first, second] = session.state.history.present.pages;
  // 回到第 1 頁、清掉新增頁面那一筆復原（lastPageId 也要一起改，否則 reducer 下一次會補記而產生新的 state）
  const reset = toolSession({
    ...session.state,
    activePageId: first.id,
    lastPageId: first.id,
    history: { ...session.state.history, past: [] },
  });
  return { session: reset, first, second };
}

function elementOf(session: ReturnType<typeof toolSession>, id: string) {
  return session.ok("get_element", { id }).element;
}

describe("add_text", () => {
  it("adds body text at the given box with defaults, one undo step", () => {
    const session = toolSession(createInitialState(createBlankDocument()));
    const { id, pageId } = session.ok("add_text", { text: "標題\n第二行", x: 40, y: 50 });
    const element = elementOf(session, id) as TextElement;
    expect(pageId).toBe(session.state.activePageId);
    expect(element).toMatchObject({
      type: "text",
      x: 40,
      y: 50,
      rotation: 0,
      text: "標題\n第二行",
      width: DEFAULT_TEXT_WIDTH,
      align: "left",
      fontFamily: FONT_OPTIONS[0].family,
    });
    expect(session.state.history.past).toHaveLength(1);
    expect(session.state.selectedIds).toEqual([id]);
  });

  it("applies the style arguments", () => {
    const session = toolSession(createInitialState(createBlankDocument()));
    const { id } = session.ok("add_text", {
      text: "x",
      x: 0,
      y: 0,
      width: 100,
      rotation: 15,
      fontSize: 24,
      font: "明體",
      bold: true,
      italic: true,
      underline: true,
      align: "center",
      textColor: "#ff000080",
      shadow: { color: "#000000", offsetX: 1, offsetY: 2 },
    });
    expect(elementOf(session, id)).toMatchObject({
      width: 100,
      rotation: 15,
      fontSize: 24,
      fontFamily: FONT_OPTIONS.find((option) => option.label === "明體")!.family,
      fontStyle: "bold",
      italic: true,
      underline: true,
      strikethrough: false,
      align: "center",
      fill: "#ff000080",
      shadow: { color: "#000000", offsetX: 1, offsetY: 2 },
    });
  });

  it("adds to another page without switching or touching the selection", () => {
    const { session, first, second } = twoPages();
    const { id, pageId } = session.ok("add_text", { pageId: second.id, text: "別頁", x: 0, y: 0 });
    expect(pageId).toBe(second.id);
    expect(session.state.activePageId).toBe(first.id);
    expect(session.state.selectedIds).toEqual([]);
    expect(session.state.history.present.pages[1].elements.map((e) => e.id)).toEqual([id]);
  });

  it("rejects bad arguments without changing the document", () => {
    const session = toolSession(createInitialState(createBlankDocument()));
    const before = session.state;
    expect(session.error("add_text", { text: "", x: 0, y: 0 })).toContain("參數 text");
    expect(session.error("add_text", { text: "x", x: 0, y: 0, fontSize: 9999 })).toContain("參數 fontSize");
    expect(session.error("add_text", { text: "x", x: 0, y: 0, font: "Comic Sans" })).toContain("參數 font");
    expect(session.error("add_text", { text: "x", x: 0, y: 0, textColor: "red" })).toContain("#rrggbb");
    expect(session.error("add_text", { text: "x", x: 1e9, y: 0 })).toContain("參數 x");
    expect(session.error("add_text", { text: "x", x: 0, y: 0, pageId: "nope" })).toContain("list_pages");
    expect(session.state).toBe(before);
  });
});

describe("place_library_item", () => {
  const library = JSON.parse(libraryJson) as Library;
  function withLibrary() {
    const { session, first, second } = twoPages();
    return { session: toolSession(session.state, NO_COMMANDS, library), first, second };
  }

  it("places an image at the page center like the library panel, one undo step", () => {
    const { session, first } = withLibrary();
    const { id, pageId, width, height } = session.ok("place_library_item", { item: "i-cover-photo" });
    const element = elementOf(session, id) as ImageElement;
    // A4 直式：1600×900 px 縮到頁寬的一半
    expect(pageId).toBe(first.id);
    expect(element).toMatchObject({ type: "image", src: "assets/images/0123456789abcdef0123456789abcdef.png", rotation: 0 });
    expect(element.width).toBeCloseTo(first.width / 2);
    expect(element.height).toBeCloseTo((first.width / 2) * (900 / 1600));
    expect([width, height]).toEqual([element.width, element.height]);
    expect(element.x + element.width / 2).toBeCloseTo(first.width / 2);
    expect(element.y + element.height / 2).toBeCloseTo(first.height / 2);
    expect(session.state.history.past).toHaveLength(1);
  });

  it("finds the item by name and keeps the aspect ratio for a given width and position", () => {
    const { session } = withLibrary();
    const { id } = session.ok("place_library_item", { item: " 未命名-01.png ", x: 10, y: 20, width: 200 });
    expect(elementOf(session, id)).toMatchObject({ x: 10, y: 20, width: 200, height: 300 });
  });

  it("centers only the axis that is not given", () => {
    const { session, first } = withLibrary();
    const { id } = session.ok("place_library_item", { item: "i-unsorted", x: 0, width: 100 });
    expect(elementOf(session, id)).toMatchObject({ x: 0, y: (first.height - 150) / 2 });
  });

  it("adds to another page without switching the user's page", () => {
    const { session, first, second } = withLibrary();
    const { pageId } = session.ok("place_library_item", { item: "i-illustration", pageId: second.id });
    expect(pageId).toBe(second.id);
    expect(session.state.activePageId).toBe(first.id);
    expect(session.state.history.present.pages[1].elements).toHaveLength(1);
    expect(session.error("place_library_item", { item: "i-illustration", pageId: "nope" })).toContain("list_pages");
  });

  it("rejects text, audio, trashed, unknown and ambiguous items without changing anything", () => {
    const duplicated: Library = {
      ...library,
      items: [...library.items, { ...library.items[0], id: "i-copy", src: "assets/images/55555555555555555555555555555555.png" }],
    };
    const { session } = withLibrary();
    const before = session.state;
    expect(session.error("place_library_item", { item: "i-editorial" })).toContain("add_text");
    expect(session.error("place_library_item", { item: "訪談錄音.mp3" })).toContain("音訊");
    expect(session.error("place_library_item", { item: "舊封面試排.jpg" })).toContain("垃圾桶");
    expect(session.error("place_library_item", { item: "nope" })).toContain("list_library_items");
    const ambiguous = toolSession(before, NO_COMMANDS, duplicated).error("place_library_item", { item: "封面照片.png" });
    expect(ambiguous).toContain("i-cover-photo");
    expect(ambiguous).toContain("i-copy");
    expect(session.state).toBe(before);
  });
});

describe("add_shape", () => {
  it("fills the box and sets fill, stroke and text", () => {
    const session = toolSession(createInitialState(createBlankDocument()));
    const { id } = session.ok("add_shape", {
      shape: "ellipse",
      x: 10,
      y: 20,
      width: 200,
      height: 100,
      fill: "#00000000",
      stroke: { color: "#112233", width: 2, dash: "dashed" },
      text: "圓",
      verticalAlign: "top",
      fontSize: 30,
    });
    const shape = elementOf(session, id) as ShapeElement;
    expect(shape).toMatchObject({ x: 10, y: 20, width: 200, height: 100, geometry: { kind: "ellipse" }, fill: "#00000000" });
    expect(shape.stroke).toEqual({ color: "#112233", width: 2, dash: "dashed" });
    expect(shape.label).toMatchObject({ text: "圓", verticalAlign: "top", fontSize: 30 });
    expect(session.state.history.past).toHaveLength(1);
  });

  it("uses the factory's geometry for each kind", () => {
    const session = toolSession(createInitialState(createBlankDocument()));
    const kinds = { rect: "rect", roundedRect: "rect", triangle: "polygon", star: "star" } as const;
    for (const [shape, geometry] of Object.entries(kinds)) {
      const { id } = session.ok("add_shape", { shape, x: 0, y: 0, width: 50, height: 50 });
      expect(elementOf(session, id).geometry.kind).toBe(geometry);
    }
  });

  it("needs text for text styles", () => {
    const session = toolSession(createInitialState(createBlankDocument()));
    expect(session.error("add_shape", { shape: "rect", x: 0, y: 0, width: 10, height: 10, bold: true })).toContain("text");
    expect(session.error("add_shape", { shape: "hexagon", x: 0, y: 0, width: 10, height: 10 })).toContain("參數 shape");
    expect(session.error("add_shape", { shape: "rect", x: 0, y: 0, width: 0, height: 10 })).toContain("參數 width");
  });
});

describe("update_element", () => {
  it("changes only the given fields and reports no-ops", () => {
    const session = toolSession(createInitialState(fixture));
    expect(session.ok("update_element", { id: "el-text", x: 1, fontSize: 40, textColor: "#123456" })).toEqual({
      id: "el-text",
      pageId: "page-1",
      changed: true,
    });
    expect(elementOf(session, "el-text")).toMatchObject({ x: 1, y: 110, fontSize: 40, fill: "#123456" });
    expect(session.ok("update_element", { id: "el-text", x: 1 }).changed).toBe(false);
    expect(session.state.history.past).toHaveLength(1);
  });

  it("rejects fields that do not belong to the element type", () => {
    const session = toolSession(createInitialState(fixture));
    expect(session.error("update_element", { id: "el-text", height: 10 })).toContain("height");
    expect(session.error("update_element", { id: "el-text", fill: "#000000" })).toContain("textColor");
    expect(session.error("update_element", { id: "el-image", text: "x" })).toContain("圖片不能修改");
    expect(session.error("update_element", { id: "el-ellipse", cornerRadius: 3 })).toContain("矩形");
    expect(session.error("update_element", { id: "el-text" })).toContain("沒有要修改");
    expect(session.error("update_element", { id: "nope", x: 1 })).toContain("list_elements");
    expect(session.state.history.past).toHaveLength(0);
  });

  it("edits the text inside shapes: add, restyle, remove", () => {
    const session = toolSession(createInitialState(fixture));
    expect(elementOf(session, "el-rect").label).toBeNull();
    expect(session.error("update_element", { id: "el-rect", bold: true })).toContain("text");

    session.ok("update_element", { id: "el-rect", text: "內文", verticalAlign: "bottom" });
    expect(elementOf(session, "el-rect").label).toMatchObject({ text: "內文", verticalAlign: "bottom" });
    session.ok("update_element", { id: "el-rect", bold: true });
    expect(elementOf(session, "el-rect").label).toMatchObject({ text: "內文", fontStyle: "bold" });
    session.ok("update_element", { id: "el-rect", text: "" });
    expect(elementOf(session, "el-rect").label).toBeNull();
  });

  it("clamps the corner radius and keeps fill / stroke", () => {
    const session = toolSession(createInitialState(fixture));
    session.ok("update_element", { id: "el-rect", cornerRadius: 9999, stroke: null, fill: "#ffffff" });
    const rect = elementOf(session, "el-rect");
    expect(rect.geometry).toEqual({ kind: "rect", cornerRadius: 130 / 2 });
    expect(rect).toMatchObject({ stroke: null, fill: "#ffffff" });
  });

  it("edits elements on master pages without switching to them", () => {
    const session = toolSession(createInitialState(fixture));
    expect(session.ok("update_element", { id: "el-master-footer", text: "頁尾" }).pageId).toBe("master-b");
    expect(session.state.activePageId).toBe("page-1");
    expect(session.state.history.present.masters[1].elements[0]).toMatchObject({ text: "頁尾" });
  });
});

describe("delete_elements", () => {
  it("deletes several elements of one page in one undo step", () => {
    const session = toolSession(createInitialState(fixture));
    expect(session.ok("delete_elements", { ids: ["el-rect", "el-star", "el-rect"] })).toEqual({ deleted: 2, pageId: "page-1" });
    expect(selectActivePage(session.state).elements.map((e) => e.id)).not.toContain("el-star");
    expect(session.state.history.past).toHaveLength(1);
  });

  it("refuses unknown ids and mixed pages", () => {
    const session = toolSession(createInitialState(fixture));
    expect(session.error("delete_elements", { ids: ["el-rect", "nope"] })).toContain("nope");
    expect(session.error("delete_elements", { ids: ["el-rect", "el-master-band"] })).toContain("同一頁");
    expect(session.error("delete_elements", { ids: [] })).toContain("參數 ids");
    expect(session.state.history.past).toHaveLength(0);
  });
});

describe("pages, document and history", () => {
  it("add_page follows the Add Pages dialog defaults and rules", () => {
    const session = toolSession(createInitialState(fixture));
    const added = session.ok("add_page", { count: 2, pageNumber: 1, side: "before" });
    const pages = session.state.history.present.pages;
    expect(pages.map((page) => page.id).slice(0, 2)).toEqual(added.pages.map((page: { id: string }) => page.id));
    // 預設套用目前頁的主頁
    expect(pages[0].masterId).toBe("master-b");
    expect(session.state.activePageId).toBe(added.activePageId);
    expect(session.state.history.past).toHaveLength(1);

    expect(session.error("add_page", { pageNumber: 99 })).toContain("頁必須是");
    expect(session.error("add_page", { masterId: "nope" })).toContain("主頁");
    expect(session.ok("add_page", { masterId: null }).pages).toHaveLength(1);
    const pagesAfter = session.state.history.present.pages;
    expect(pagesAfter[pagesAfter.length - 1].masterId).toBeNull();
  });

  it("add_master follows the Add Master Page dialog defaults and rules", () => {
    const { session, first } = twoPages();
    const added = session.ok("add_master");
    expect(added).toMatchObject({ name: "Master A", parentId: null, activePageId: added.id });
    const master = session.state.history.present.masters[0];
    expect(master).toMatchObject({ id: added.id, background: "#ffffff", width: first.width, height: first.height });
    expect(session.state.activePageId).toBe(added.id);
    expect(session.state.history.past).toHaveLength(1);

    // 正在編輯主頁時，預設以它為基礎
    const child = session.ok("add_master", { name: "  內頁  ", background: "#fef3c7" });
    expect(child).toMatchObject({ name: "內頁", parentId: added.id });
    expect(session.state.history.present.masters[1].background).toBe("#fef3c7");
    expect(session.ok("add_master", { parentId: null }).name).toBe("Master B");

    expect(session.error("add_master", { parentId: "nope" })).toContain("list_pages");
    expect(session.error("add_master", { name: "   " })).toContain("空白");
    expect(session.error("add_master", { background: "#fef3c780" })).toContain("#rrggbb");
    expect(session.state.history.present.masters).toHaveLength(3);
  });

  it("set_page_master applies or clears a master page without switching pages", () => {
    const { session, first, second } = twoPages();
    const { id: masterId } = session.ok("add_master");
    const undoSteps = session.state.history.past.length;
    const active = session.state.activePageId;

    expect(session.ok("set_page_master", { pageIds: [first.id, second.id, first.id], masterId })).toEqual({
      pageIds: [first.id, second.id],
      masterId,
      changed: true,
    });
    expect(session.state.history.present.pages.slice(0, 2).map((page) => page.masterId)).toEqual([masterId, masterId]);
    expect(session.state.activePageId).toBe(active);
    expect(session.state.history.past).toHaveLength(undoSteps + 1);
    expect(session.ok("set_page_master", { pageIds: [first.id], masterId }).changed).toBe(false);
    expect(session.ok("set_page_master", { pageIds: [second.id], masterId: null }).changed).toBe(true);

    expect(session.error("set_page_master", { pageIds: [masterId], masterId: null })).toContain("主頁不能套用主頁");
    expect(session.error("set_page_master", { pageIds: ["nope"], masterId })).toContain("list_pages");
    expect(session.error("set_page_master", { pageIds: [first.id], masterId: first.id })).toContain("找不到主頁");
    expect(session.error("set_page_master", { pageIds: [], masterId })).toContain("pageIds");
  });

  it("renames pages and the document, sets backgrounds", () => {
    const session = toolSession(createInitialState(fixture));
    expect(session.ok("rename_page", { pageId: "page-1", name: "  目錄  " })).toEqual({
      pageId: "page-1",
      name: "目錄",
      changed: true,
    });
    expect(session.error("rename_page", { pageId: "page-1", name: "   " })).toContain("空白");
    expect(session.error("rename_page", { pageId: "nope", name: "x" })).toContain("list_pages");
    expect(session.ok("set_page_background", { pageId: "master-a", color: "#fef3c7" }).changed).toBe(true);
    expect(session.error("set_page_background", { pageId: "page-1", color: "#fef3c780" })).toContain("#rrggbb");
    expect(session.ok("rename_document", { name: "十月號" }).name).toBe("十月號");
    expect(session.state.history.present).toMatchObject({ name: "十月號", pages: [{ name: "目錄" }] });
    expect(session.state.history.present.masters[0].background).toBe("#fef3c7");
  });

  it("undo / redo step through the tool calls", () => {
    const { session } = twoPages();
    expect(session.error("undo")).toContain("沒有可以復原");
    const { id } = session.ok("add_text", { text: "x", x: 0, y: 0 });
    expect(session.ok("undo")).toEqual({ canUndo: false, canRedo: true });
    expect(session.error("get_element", { id })).toContain(id);
    session.ok("redo");
    expect(elementOf(session, id).text).toBe("x");
    expect(session.error("redo")).toContain("沒有可以重做");
  });
});

describe("text styles", () => {
  // fixture：「標題」「內文」「頁尾」；主頁頁尾連「頁尾」、橢圓內文字連「內文」（覆寫字級 14）
  const session = () => toolSession(createInitialState(fixture));

  it("list_text_styles uses the add_text vocabulary and counts linked texts", () => {
    const styles = session().ok("list_text_styles");
    expect(styles.map((s: { name: string }) => s.name)).toEqual(["標題", "內文", "頁尾"]);
    expect(styles[2]).toMatchObject({ id: "style-footer", font: "黑體", fontSize: 9, bold: false, align: "right", textColor: "#525252", usedBy: 1 });
    expect(styles[0].usedBy).toBe(0);
    expect(session().ok("get_document").textStyles).toBe(3);
  });

  it("list_elements names the linked style", () => {
    const { elements } = session().ok("list_elements", { pageId: "page-1" });
    expect(elements.find((e: { id: string }) => e.id === "el-ellipse").textStyle).toBe("內文");
    expect(elements.find((e: { id: string }) => e.id === "el-text")).not.toHaveProperty("textStyle");
  });

  it("add_text with a style links it; explicit fields become overrides", () => {
    const s = session();
    const { id } = s.ok("add_text", { text: "引言", x: 0, y: 0, style: "頁尾", bold: true });
    expect(elementOf(s, id)).toMatchObject({ styleId: "style-footer", fontSize: 9, align: "right", fill: "#525252", fontStyle: "bold" });
    expect(s.error("add_text", { text: "x", x: 0, y: 0, style: "不存在" })).toContain("list_text_styles");
    // 也可以用 id
    expect(elementOf(s, s.ok("add_text", { text: "y", x: 0, y: 0, style: "text-style-body" }).id).styleId).toBe("text-style-body");
  });

  it("add_shape links the label; style needs text", () => {
    const s = session();
    const { id } = s.ok("add_shape", { shape: "rect", x: 0, y: 0, width: 100, height: 50, text: "框", style: "標題" });
    expect(elementOf(s, id).label).toMatchObject({ styleId: "text-style-heading", fontSize: 32, text: "框" });
    expect(s.error("add_shape", { shape: "rect", x: 0, y: 0, width: 100, height: 50, style: "標題" })).toContain("text");
  });

  it("add / update / delete text styles, each one undo step", () => {
    const s = session();
    const { id } = s.ok("add_text_style", { name: " 引言 ", italic: true, fontSize: 13 });
    const styles = s.state.history.present.textStyles;
    expect(styles[styles.length - 1]).toMatchObject({ id, name: "引言", italic: true, fontSize: 13, align: "left" });
    expect(s.error("add_text_style", { name: "內文" })).toContain("已經有");

    const updated = s.ok("update_text_style", { style: "內文", fontSize: 12, textColor: "#1e3a8a", name: "本文" });
    expect(updated).toMatchObject({ id: "text-style-body", name: "本文", changed: true, linkedTexts: 1 });
    // 圖形內文字的字級是覆寫（14），顏色跟著樣式
    expect(elementOf(s, "el-ellipse").label).toMatchObject({ fontSize: 14, fill: "#1e3a8a" });
    expect(s.error("update_text_style", { style: "本文" })).toContain("沒有要修改");
    expect(s.error("update_text_style", { style: "本文", name: "標題" })).toContain("已經有");
    expect(s.ok("update_text_style", { style: "本文", fontSize: 12 }).changed).toBe(false);

    const past = s.state.history.past.length;
    expect(s.ok("delete_text_style", { style: "頁尾" })).toEqual({ deleted: "style-footer", name: "頁尾", unlinkedTexts: 1 });
    expect(s.state.history.present.masters[1].elements[0]).toMatchObject({ styleId: null, fontSize: 9 });
    expect(s.state.history.past).toHaveLength(past + 1);
  });

  it("apply_text_style links texts and labels, reports skipped elements, null unlinks", () => {
    const s = session();
    const applied = s.ok("apply_text_style", { ids: ["el-text", "el-ellipse", "el-image"], style: "標題" });
    expect(applied).toEqual({ style: "text-style-heading", applied: 2, skipped: ["el-image"], changed: true });
    expect(elementOf(s, "el-text")).toMatchObject({ styleId: "text-style-heading", fontSize: 32, italic: false });
    expect(elementOf(s, "el-ellipse").label).toMatchObject({ styleId: "text-style-heading", fontSize: 32 });
    expect(s.ok("apply_text_style", { ids: ["el-text"], style: null })).toMatchObject({ style: null, changed: true });
    expect(elementOf(s, "el-text")).toMatchObject({ styleId: null, fontSize: 32 });
    expect(s.error("apply_text_style", { ids: ["el-image"], style: "標題" })).toContain("沒有文字");
    expect(s.error("apply_text_style", { ids: ["el-text", "el-master-footer"], style: "標題" })).toContain("同一頁");
  });
});
