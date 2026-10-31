import { describe, expect, it } from "vitest";
import { createInitialState } from "@/lib/editor/editor-reducer";
import { createBlankDocument } from "@/lib/editor/element-factory";
import { createPageNumberRule } from "@/lib/editor/page-numbers";
import { RENDER_DEFAULT_PX } from "../render-page";
import { toolSession } from "./tool-session";

// 前端只交出那一頁的匯出請求（RenderJob）；畫圖在 Rust（bridge.rs / page_image.rs），這裡測不到圖片

function threePages() {
  const session = toolSession(
    createInitialState({ ...createBlankDocument(), pageNumberRules: [createPageNumberRule("rule", 1, 99)] }),
  );
  session.ok("add_page", { count: 2 });
  const pages = session.state.history.present.pages;
  return { session, pages };
}

describe("render_page", () => {
  it("hands Rust the export request of that page only, numbered as in the document", () => {
    const { session, pages } = threePages();
    session.ok("add_text", { pageId: pages[0].id, x: 100, y: 100, width: 200, text: "第一頁" });
    const text = session.ok("add_text", { pageId: pages[2].id, x: 100, y: 100, width: 200, text: "第三頁" });
    const { render } = session.ok("render_page", { pageId: pages[2].id });

    expect(render).toMatchObject({ pageIndex: 0, maxPx: RENDER_DEFAULT_PX, region: null, pageName: pages[2].name });
    expect(render.request.document.pages.map((page: any) => page.id)).toEqual([pages[2].id]);
    // 只量了那一頁：它的文字與頁碼（第 3 頁）
    const layouts = render.request.textLayouts;
    expect(layouts[text.id].lines).toEqual(["第三頁"]);
    expect(Object.values(layouts).map((layout: any) => layout.lines[0])).toEqual(["第三頁", "3"]);
  });

  it("defaults to the page the user is looking at and passes size and region through", () => {
    // add_page 會切到新頁面：使用者正在看的是最後新增的那一頁
    const { session } = threePages();
    const { render } = session.ok("render_page", { maxWidth: 800, region: { x: 10, y: 20, width: 100, height: 50 } });
    expect(render.request.document.pages[0].id).toBe(session.state.activePageId);
    expect(render).toMatchObject({ maxPx: 800, region: { x: 10, y: 20, width: 100, height: 50 } });
  });

  it("does not change the document, the user's page or the history", () => {
    const { session, pages } = threePages();
    const before = session.state;
    session.ok("render_page", { pageId: pages[1].id });
    expect(session.state).toBe(before);
  });

  it("rejects master pages, unknown pages, regions off the page and bad sizes", () => {
    const { session, pages } = threePages();
    const master = session.ok("add_master", { name: "A" });
    expect(session.error("render_page", { pageId: master.id })).toContain("主頁");
    expect(session.error("render_page", { pageId: "nope" })).toContain("list_pages");
    // add_master 會切到主頁，下面都指定頁面
    const { id: pageId, width } = pages[0];
    expect(session.error("render_page", { pageId, region: { x: width + 5, y: 0, width: 50, height: 50 } })).toContain("region");
    expect(session.error("render_page", { pageId, maxWidth: 5000 })).toContain("maxWidth");
    expect(session.error("render_page", { pageId, region: { x: 0, y: 0, width: 0, height: 10 } })).toContain("region");
  });

  it("cannot go into a batch", () => {
    const { session } = threePages();
    expect(session.error("batch", { ops: [{ tool: "render_page", args: {} }] })).toContain("不能放進 batch");
  });
});
