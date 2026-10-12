import { describe, expect, it } from "vitest";
import { createInitialState, selectActivePage } from "@/lib/editor/editor-reducer";
import { createBlankDocument } from "@/lib/editor/element-factory";
import { BUILT_IN_SWATCH_IDS } from "@/lib/editor/swatches";
import type { ShapeElement, TextElement } from "@/lib/editor/types";
import { toolSession } from "./tool-session";

/** A new document (文字 / 黑 / 白) with 品牌紅 added. */
function session() {
  const s = toolSession(createInitialState(createBlankDocument()));
  s.ok("add_swatch", { name: "品牌紅", color: "#BE123C" });
  return s;
}

const elementOf = (s: ReturnType<typeof toolSession>, id: string) => s.ok("get_element", { id }).element;

describe("swatch tools", () => {
  it("lists, adds, renames and recolors swatches", () => {
    const s = session();
    expect(s.ok("list_swatches")).toEqual([
      { id: BUILT_IN_SWATCH_IDS.text, name: "文字", color: "#171717", usedBy: 3 }, // 三個內建樣式
      { id: BUILT_IN_SWATCH_IDS.black, name: "黑", color: "#000000", usedBy: 0 },
      { id: BUILT_IN_SWATCH_IDS.white, name: "白", color: "#ffffff", usedBy: 0 },
      expect.objectContaining({ name: "品牌紅", color: "#be123c", usedBy: 0 }),
    ]);
    expect(s.error("add_swatch", { name: "黑", color: "#111111" })).toBe("已經有名為「黑」的色票");
    expect(s.error("add_swatch", { name: "x", color: "#11111180" })).toContain("#rrggbb");
    expect(s.ok("update_swatch", { swatch: "品牌紅", name: "主色" })).toMatchObject({ name: "主色", changed: true });
    expect(s.error("update_swatch", { swatch: "主色" })).toBe("沒有要修改的欄位");
    expect(s.error("update_swatch", { swatch: "不存在" })).toContain("list_swatches");
    expect(s.ok("get_document").swatches).toBe(4);
  });

  it("links colors given as { swatch, opacity } and keeps hex colors unlinked", () => {
    const s = session();
    const { id } = s.ok("add_shape", {
      shape: "rect",
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      fill: { swatch: "品牌紅", opacity: 0.5 },
      stroke: { color: { swatch: "黑" }, width: 1, dash: "solid" },
      text: "圖",
      textColor: { swatch: "白" },
      shadow: { color: { swatch: "黑", opacity: 0.25 }, offsetX: 1, offsetY: 1 },
    });
    const shape = elementOf(s, id) as ShapeElement;
    expect(shape).toMatchObject({ fill: "#be123c80", stroke: { color: "#000000", swatchId: BUILT_IN_SWATCH_IDS.black } });
    expect(shape.fillSwatchId).toBe(s.ok("list_swatches")[3].id);
    expect(shape.label).toMatchObject({ fill: "#ffffff", fillSwatchId: BUILT_IN_SWATCH_IDS.white, shadow: { color: "#00000040" } });
    // hex = 取消連結
    s.ok("update_element", { id, fill: "#00ff00" });
    expect(elementOf(s, id)).toMatchObject({ fill: "#00ff00", fillSwatchId: null });
    expect(s.error("update_element", { id, fill: { swatch: "不存在" } })).toContain("找不到色票");
    expect(s.error("update_element", { id, fill: { swatch: "黑", extra: 1 } })).toContain("fill");
  });

  it("recolors every linked use when a swatch changes, in one undo step", () => {
    const s = session();
    const { id } = s.ok("add_text", { text: "內文", x: 0, y: 0, style: "內文" });
    expect(elementOf(s, id)).toMatchObject({ fillSwatchId: BUILT_IN_SWATCH_IDS.text });
    const result = s.ok("update_swatch", { swatch: "文字", color: "#1d4ed8" });
    expect(result).toMatchObject({ changed: true, linkedColors: 4 });
    expect((elementOf(s, id) as TextElement).fill).toBe("#1d4ed8");
    expect(s.ok("list_text_styles")[0]).toMatchObject({ textColor: "#1d4ed8", textColorSwatch: "文字" });
    s.ok("undo");
    expect((elementOf(s, id) as TextElement).fill).toBe("#171717");
  });

  it("links page backgrounds and reports the swatch name", () => {
    const s = session();
    const pageId = selectActivePage(s.state).id;
    expect(s.ok("set_page_background", { pageId, color: { swatch: "白" } })).toMatchObject({ swatchId: BUILT_IN_SWATCH_IDS.white });
    expect(s.ok("list_pages").pages[0]).toMatchObject({ background: "#ffffff", backgroundSwatch: "白" });
    expect(s.error("set_page_background", { pageId, color: { swatch: "白", opacity: 0.5 } })).toContain("color");
    const master = s.ok("add_master", { background: { swatch: "品牌紅" } });
    expect(s.ok("list_pages").masters[0]).toMatchObject({ id: master.id, background: "#be123c", backgroundSwatch: "品牌紅" });
  });

  it("deletes swatches, moving uses to a replacement or unlinking them", () => {
    const s = session();
    const { id } = s.ok("add_shape", { shape: "rect", x: 0, y: 0, width: 10, height: 10, fill: { swatch: "品牌紅", opacity: 0.5 } });
    expect(s.error("delete_swatch", { swatch: "品牌紅", replaceWith: "品牌紅" })).toContain("同一個色票");
    expect(s.ok("delete_swatch", { swatch: "品牌紅", replaceWith: "黑" })).toMatchObject({ affectedColors: 1 });
    expect(elementOf(s, id)).toMatchObject({ fill: "#00000080", fillSwatchId: BUILT_IN_SWATCH_IDS.black });
    expect(s.ok("delete_swatch", { swatch: "黑" })).toMatchObject({ replaceWith: null, affectedColors: 1 });
    expect(elementOf(s, id)).toMatchObject({ fill: "#00000080", fillSwatchId: null });
  });

  it("gives text styles swatch colors", () => {
    const s = session();
    s.ok("add_text_style", { name: "強調", textColor: { swatch: "品牌紅" } });
    expect(s.ok("list_text_styles").find((style: { name: string }) => style.name === "強調")).toMatchObject({
      textColor: "#be123c",
      textColorSwatch: "品牌紅",
    });
    s.ok("update_text_style", { style: "強調", textColor: "#123456" });
    expect(s.ok("list_text_styles").find((style: { name: string }) => style.name === "強調").textColorSwatch).toBeUndefined();
  });
});
