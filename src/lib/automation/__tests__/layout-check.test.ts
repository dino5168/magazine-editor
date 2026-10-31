import { describe, expect, it } from "vitest";
import { createInitialState } from "@/lib/editor/editor-reducer";
import { createBlankDocument } from "@/lib/editor/element-factory";
import { createPageNumberRule, pageNumberShape } from "@/lib/editor/page-numbers";
import type { EditorDocument } from "@/lib/editor/types";
import { LAYOUT_ISSUES_MAX } from "../layout-check";
import { fakeMeasureWidth, toolSession } from "./tool-session";

// 假量測（tool-session.ts）：每字 1 em、到寬度就換行；行高 = 字級 × lineHeight。
// 文字的外框只算字畫到的地方（靠左時從 x 到最長一行的結尾）

function blankSession(change: (document: EditorDocument) => EditorDocument = (document) => document) {
  return toolSession(createInitialState(change(createBlankDocument())));
}

function issuesOf(session: ReturnType<typeof toolSession>, pageId?: string): any[] {
  return session.ok("check_layout", pageId === undefined ? {} : { pageId }).issues;
}

/** Inside the default margins of a blank A4 page. */
const X = 100;
const Y = 100;

describe("check_layout", () => {
  it("reports nothing on a clean page and does not change the document", () => {
    const session = blankSession();
    session.ok("add_text", { x: X, y: Y, width: 200, text: "標題" });
    const before = session.state;
    const report = session.ok("check_layout");
    expect(report).toMatchObject({ issues: [], truncated: 0, checked: 1 });
    expect(session.state).toBe(before);
  });

  it("reports a shape whose text needs more height than the shape has", () => {
    const session = blankSession();
    // 三行 9 pt、行高 1.4 = 37.8 pt；30 pt 高的矩形扣掉上下各 4 pt 只有 22 pt
    const { id } = session.ok("add_shape", { shape: "rect", x: X, y: Y, width: 120, height: 30, text: "一\n二\n三", fontSize: 9, lineHeight: 1.4 });
    const issues = issuesOf(session);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ type: "textOverflow", severity: "error", id, direction: "height", summary: "圖形「一 二 三」" });
    expect(issues[0].overflowPt).toBeCloseTo(15.8, 1);
  });

  it("reports a line wider than its text box", () => {
    const session = blankSession();
    // 假量測至少放一個字：寬 5 pt 的框放 10 pt 的字
    const { id } = session.ok("add_text", { x: X, y: Y, width: 5, text: "字", fontSize: 10 });
    expect(issuesOf(session)).toEqual([expect.objectContaining({ type: "textOverflow", id, direction: "width", overflowPt: 5 })]);
  });

  it("reports two overlapping text boxes, using the measured height", () => {
    const session = blankSession();
    // 第一個文字 4 行 × 10 pt × 1.5 = 60 pt 高：y = 100..160，壓到 y = 150 的第二個；寬度只算字（一行一字 = 10 pt）
    const first = session.ok("add_text", { x: X, y: Y, width: 100, text: "一\n二\n三\n四", fontSize: 10, lineHeight: 1.5 });
    const second = session.ok("add_text", { x: X, y: 150, width: 100, text: "下面", fontSize: 10, lineHeight: 1.5 });
    const issues = issuesOf(session);
    expect(issues).toEqual([expect.objectContaining({ type: "overlap", ids: [first.id, second.id], areaPt2: 100 })]);
    expect(issues[0]).not.toHaveProperty("sources");
  });

  it("does not report a table of neighbouring cells", () => {
    const session = blankSession();
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        session.ok("add_shape", { shape: "rect", x: X + column * 60, y: Y + row * 30, width: 60, height: 30, text: "格", fontSize: 9 });
      }
    }
    expect(issuesOf(session)).toEqual([]);
  });

  it("does not report text placed inside a box, but does when it sticks out of it", () => {
    const session = blankSession();
    session.ok("add_shape", { shape: "rect", x: X, y: Y, width: 200, height: 100 });
    session.ok("add_text", { x: X + 10, y: Y + 10, width: 100, text: "在框裡" });
    expect(issuesOf(session)).toEqual([]);
    session.ok("add_text", { x: X + 170, y: Y + 10, width: 100, text: "一半在外" });
    expect(issuesOf(session).map((issue) => issue.type)).toEqual(["overlap"]);
  });

  it("measures text by where its lines are drawn, not by its box", () => {
    const session = blankSession();
    // 置中的短標籤：框寬 100 伸進左邊的方塊 20 pt，字（20 pt 寬，位於 40..60）沒有碰到
    session.ok("add_shape", { shape: "rect", x: X, y: Y, width: 100, height: 100 });
    session.ok("add_text", { x: X + 80, y: Y + 40, width: 100, text: "標籤", fontSize: 10, align: "center" });
    expect(issuesOf(session)).toEqual([]);
    // 靠右：字在框的右端，伸進右邊的方塊
    session.ok("add_shape", { shape: "rect", x: X + 250, y: Y, width: 100, height: 100 });
    session.ok("add_text", { x: X + 160, y: Y + 40, width: 100, text: "靠右", fontSize: 10, align: "right" });
    expect(issuesOf(session).map((issue) => issue.type)).toEqual(["overlap"]);
  });

  it("only warns when a rectangle's text eats its padding but stays inside", () => {
    const session = blankSession();
    // 兩行 9 pt × 1.2 = 21.6 pt：24 pt 高的矩形文字區 16 pt，但還在 24 pt 的外框裡
    const cell = session.ok("add_shape", { shape: "rect", x: X, y: Y, width: 120, height: 24, text: "一\n二", fontSize: 9, lineHeight: 1.2 });
    // 同樣的文字放在橢圓裡：文字區是內接矩形，超出就碰到曲線
    const oval = session.ok("add_shape", { shape: "ellipse", x: X, y: 300, width: 120, height: 24, text: "一\n二", fontSize: 9, lineHeight: 1.2 });
    const issues = issuesOf(session);
    expect(issues).toEqual([
      expect.objectContaining({ type: "textOverflow", id: cell.id, direction: "height", severity: "warning" }),
      expect.objectContaining({ type: "textOverflow", id: oval.id, direction: "height", severity: "error" }),
    ]);
    expect(issues[0].overflowPt).toBeCloseTo(5.6, 1);
  });

  it("ignores lines and shapes without text", () => {
    const session = blankSession();
    session.ok("add_shape", { shape: "rect", x: X, y: Y, width: 100, height: 100 });
    session.ok("add_shape", { shape: "ellipse", x: X + 50, y: Y + 50, width: 100, height: 100 });
    session.ok("add_text", { x: X, y: 300, width: 100, text: "線上" });
    session.ok("add_line", { points: [{ x: X - 20, y: 305 }, { x: X + 150, y: 305 }] });
    expect(issuesOf(session)).toEqual([]);
  });

  it("reports elements off the page and outside the margins", () => {
    const session = blankSession();
    const { width } = session.state.history.present.pages[0];
    const { left } = session.state.history.present.margins;
    const off = session.ok("add_shape", { shape: "rect", x: width - 50, y: Y, width: 80, height: 40 });
    const margin = session.ok("add_shape", { shape: "rect", x: left / 2, y: Y, width: 40, height: 40 });
    // 碰到頁緣的滿版色帶與蓋滿整頁的背景都不算
    session.ok("add_shape", { shape: "rect", x: 0, y: 400, width, height: 40 });
    session.ok("add_shape", { shape: "rect", x: -10, y: -10, width: width + 20, height: 900 });
    const issues = issuesOf(session);
    expect(issues).toEqual([
      expect.objectContaining({ type: "outOfPage", severity: "error", id: off.id, overflowPt: { right: 30 } }),
      expect.objectContaining({ type: "outOfMargin", severity: "warning", id: margin.id }),
    ]);
  });

  it("lets an element cross the spine of a spread, not the outer edge", () => {
    const session = blankSession();
    session.ok("add_page");
    session.ok("add_page");
    const [, left, right] = session.state.history.present.pages;
    // 第 2 頁（左頁）的物件越過中縫到第 3 頁：不算超出；第 3 頁收到它（facingPage），和那裡的文字重疊
    const { left: margin } = session.state.history.present.margins;
    const crossing = session.ok("add_shape", { pageId: left.id, shape: "rect", x: left.width - 50, y: Y, width: margin + 100, height: 50 });
    const text = session.ok("add_text", { pageId: right.id, x: margin + 10, y: Y + 40, width: 100, text: "右頁" });
    expect(issuesOf(session, left.id)).toEqual([]);
    expect(issuesOf(session, right.id)).toEqual([
      expect.objectContaining({ type: "overlap", ids: [crossing.id, text.id], sources: ["facingPage", "own"] }),
    ]);
    const outer = session.ok("add_shape", { pageId: left.id, shape: "rect", x: -20, y: 300, width: 60, height: 50 });
    expect(issuesOf(session, left.id)).toEqual([expect.objectContaining({ type: "outOfPage", id: outer.id, overflowPt: { left: 20 } })]);
  });

  it("names the master element that a page's text overlaps", () => {
    const session = blankSession();
    const pageId = session.state.history.present.pages[0].id;
    const master = session.ok("add_master", { name: "A" });
    const footer = session.ok("add_text", { pageId: master.id, x: X, y: 700, width: 200, text: "頁尾" });
    session.ok("set_page_master", { pageIds: [pageId], masterId: master.id });
    const text = session.ok("add_text", { pageId, x: X + 20, y: 695, width: 100, text: "壓到頁尾" });
    expect(issuesOf(session, pageId)).toEqual([
      expect.objectContaining({ type: "overlap", ids: [footer.id, text.id], sources: ["master", "own"] }),
    ]);
    // 主頁本身只有一個物件，沒有問題
    expect(issuesOf(session, master.id)).toEqual([]);
  });

  it("checks against the page number", () => {
    const session = blankSession((document) => ({ ...document, pageNumberRules: [createPageNumberRule("rule", 1, 99)] }));
    const page = session.state.history.present.pages[0];
    const shape = pageNumberShape(page, 0, session.state.history.present.pageNumberRules, session.state.history.present.margins, fakeMeasureWidth)!;
    const text = session.ok("add_text", { x: shape.x - 5, y: shape.y, width: shape.width + 10, text: "壓到頁碼" });
    // 頁碼在頁緣附近，壓到它的文字另外可能超出邊界或頁面；這裡只看重疊
    const issues = issuesOf(session);
    expect(issues.filter((issue) => issue.type === "overlap")).toEqual([
      expect.objectContaining({ ids: [text.id, shape.id], sources: ["own", "pageNumber"] }),
    ]);
  });

  it("caps the number of issues", () => {
    const session = blankSession();
    // 互相重疊的文字：n 個有 n(n-1)/2 對
    for (let index = 0; index < 12; index += 1) session.ok("add_text", { x: X + index, y: Y, width: 100, text: "重疊" });
    const report = session.ok("check_layout");
    expect(report.issues).toHaveLength(LAYOUT_ISSUES_MAX);
    expect(report.truncated).toBe(66 - LAYOUT_ISSUES_MAX);
  });

  it("sees the document as the batch has changed it so far", () => {
    const session = blankSession();
    const { results } = session.ok("batch", {
      ops: [
        { tool: "add_text", args: { x: X, y: Y, width: 100, text: "一\n二\n三\n四", fontSize: 10, lineHeight: 1.5 } },
        { tool: "add_text", args: { x: X, y: 150, width: 100, text: "下面", fontSize: 10, lineHeight: 1.5 } },
        { tool: "check_layout", args: {} },
      ],
    });
    expect(results[2].issues.map((issue: any) => issue.type)).toEqual(["overlap"]);
  });

  it("rejects an unknown page", () => {
    expect(blankSession().error("check_layout", { pageId: "nope" })).toContain("list_pages");
  });
});
