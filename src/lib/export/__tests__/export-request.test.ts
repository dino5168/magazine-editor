import { describe, expect, it } from "vitest";
import { DEFAULT_MARGINS, createPage, createShapeElement, createTextElement } from "@/lib/editor/element-factory";
import { createPageNumberRule, pageNumberShapeId } from "@/lib/editor/page-numbers";
import { LABEL_PADDING_PT, createLabel } from "@/lib/editor/shape-label";
import type { EditorDocument } from "@/lib/editor/types";
import { buildExportRequest, masterCopyId, spilloverCopyId } from "../export-request";

// 假的量測：每個字寬 = 字級的一半
const measureWidth = (text: string, style: { fontSize: number }) => Array.from(text).length * style.fontSize * 0.5;

describe("buildExportRequest", () => {
  it("measures every text element on every page and nothing else", () => {
    const first = createPage("封面", { width: 595, height: 842 }, "#ffffff");
    const second = createPage("內頁", { width: 595, height: 842 }, "#ffffff");
    const title = createTextElement("heading", { x: 100, y: 100 });
    const body = createTextElement("body", { x: 100, y: 200 });
    const document: EditorDocument = {
      name: "測試",
      margins: DEFAULT_MARGINS,
      textStyles: [],
      pageNumberRules: [],
      masters: [],
      pages: [
        { ...first, elements: [title, createShapeElement("rect", { x: 50, y: 50 })] },
        { ...second, elements: [body] },
      ],
    };
    const measured: string[] = [];

    const request = buildExportRequest(document, (element) => {
      measured.push(element.id);
      return { lines: [element.text], baseline: element.fontSize, lineWidths: [100] };
    }, measureWidth);

    expect(request.document).toBe(document);
    expect(measured).toEqual([title.id, body.id]);
    expect(request.textLayouts[title.id]).toEqual({ lines: [title.text], baseline: title.fontSize, lineWidths: [100] });
    expect(Object.keys(request.textLayouts)).toHaveLength(2);
  });

  it("measures shape labels at the label's wrapping width, keyed <id>#label", () => {
    const shape = createShapeElement("rect", { x: 100, y: 100 });
    const labelled = { ...shape, label: createLabel("圖形內文字") };
    const empty = { ...createShapeElement("ellipse", { x: 0, y: 0 }), label: createLabel("") };
    const page = createPage("P", { width: 595, height: 842 }, "#ffffff");
    const document: EditorDocument = {
      name: "測試",
      margins: DEFAULT_MARGINS,
      textStyles: [],
      pageNumberRules: [],
      masters: [],
      pages: [{ ...page, elements: [shape, labelled, empty] }],
    };
    const widths: number[] = [];

    const request = buildExportRequest(document, (element) => {
      widths.push(element.width);
      return { lines: [element.text], baseline: 10, lineWidths: [100] };
    }, measureWidth);

    expect(Object.keys(request.textLayouts)).toEqual([`${labelled.id}#label`]);
    expect(request.textLayouts[`${labelled.id}#label`].lines).toEqual(["圖形內文字"]);
    expect(widths).toEqual([labelled.width - 2 * LABEL_PADDING_PT]);
  });

  it("adds each page's number as a shape on top and measures it like any label", () => {
    const first = createPage("封面", { width: 595, height: 842 }, "#ffffff");
    const second = createPage("內頁", { width: 595, height: 842 }, "#ffffff");
    const rule = createPageNumberRule("r", 2, 9);
    const source: EditorDocument = {
      name: "測試",
      margins: DEFAULT_MARGINS,
      textStyles: [],
      pageNumberRules: [{ ...rule, even: { ...rule.even, prefix: "第 ", suffix: " 頁" } }],
      masters: [],
      pages: [first, { ...second, elements: [createShapeElement("rect", { x: 50, y: 50 })] }],
    };

    const request = buildExportRequest(source, (element) => ({ lines: [element.text], baseline: 10, lineWidths: [100] }), measureWidth);

    // 原本的文件不變；匯出的副本在第 2 頁最上層多一個頁碼圖形，第 1 頁不在範圍內
    expect(source.pages[1].elements).toHaveLength(1);
    expect(request.document.pages[0]).toBe(first);
    const numbered = request.document.pages[1].elements;
    expect(numbered).toHaveLength(2);
    const pageNumber = numbered[1];
    expect(pageNumber.id).toBe(pageNumberShapeId(second.id));
    expect(request.textLayouts[`${pageNumber.id}#label`].lines).toEqual(["第 2 頁"]);
  });

  it("draws master page content under each page with per-page ids and resolved variables", () => {
    const size = { width: 595, height: 842 };
    const band = createShapeElement("rect", { x: 50, y: 50 });
    const footer = { ...createTextElement("body", { x: 100, y: 800 }), text: "{文件名稱} {頁碼}/{總頁數}" };
    const own = { ...createTextElement("body", { x: 100, y: 300 }), text: "{頁面名稱}" };
    const first = { ...createPage("封面", size, "#ffffff"), elements: [own] };
    const second = { ...createPage("內頁", size, "#ffffff", "B"), elements: [createShapeElement("star", { x: 0, y: 0 })] };
    const third = createPage("內頁 2", size, "#ffffff", "B");
    const source: EditorDocument = {
      name: "十月號",
      margins: DEFAULT_MARGINS,
      textStyles: [],
      pageNumberRules: [],
      masters: [
        { id: "A", name: "Master A", ...size, background: "#ffffff", parentId: null, elements: [band] },
        { id: "B", name: "Master B", ...size, background: "#ffffff", parentId: "A", elements: [footer] },
      ],
      pages: [first, second, third],
    };

    const request = buildExportRequest(source, (element) => ({ lines: [element.text], baseline: 10, lineWidths: [100] }), measureWidth);
    const [p1, p2, p3] = request.document.pages;

    // 沒有主頁的頁面：只換變數
    expect(p1.elements).toEqual([{ ...own, text: "封面" }]);
    // 有主頁：祖先主頁的物件在最下面、自己的物件在上面，id 每頁不同
    expect(p2.elements.map((e) => e.id)).toEqual([masterCopyId(1, 0), masterCopyId(1, 1), second.elements[0].id]);
    expect(p2.elements[0]).toEqual({ ...band, id: masterCopyId(1, 0) });
    expect(p3.elements.map((e) => e.id)).toEqual([masterCopyId(2, 0), masterCopyId(2, 1)]);
    expect(request.textLayouts[masterCopyId(1, 1)].lines).toEqual(["十月號 2/3"]);
    expect(request.textLayouts[masterCopyId(2, 1)].lines).toEqual(["十月號 3/3"]);
    // Rust 只接受 64 字以內的 id
    expect(request.document.pages.flatMap((page) => page.elements).every((e) => e.id.length <= 64)).toBe(true);
    // 原本的文件不變
    expect(source.pages[1].elements).toHaveLength(1);
  });

  it("copies elements crossing the spine onto the facing page, between master content and the page's own elements", () => {
    const size = { width: 500, height: 700 };
    // 第 2 頁（左）的圖跨過右緣 100 pt；第 3 頁（右）的文字跨過左緣；頁尾含 {頁碼}
    const wide = { ...createShapeElement("rect", { x: 0, y: 0 }), x: 300, y: 50, width: 300, height: 200 };
    const reach = { ...createTextElement("body", { x: 0, y: 0 }), x: -80, y: 400, width: 200, text: "第 {頁碼} 頁" };
    const own3 = createShapeElement("star", { x: 250, y: 250 });
    const band = createShapeElement("ellipse", { x: 100, y: 100 });
    const source: EditorDocument = {
      name: "測試",
      margins: DEFAULT_MARGINS,
      textStyles: [],
      pageNumberRules: [],
      masters: [{ id: "M", name: "Master A", ...size, background: "#ffffff", parentId: null, elements: [band] }],
      pages: [
        createPage("封面", size, "#ffffff"),
        { ...createPage("左", size, "#ffffff"), elements: [wide] },
        { ...createPage("右", size, "#ffffff", "M"), elements: [reach, own3] },
      ],
    };

    const request = buildExportRequest(source, (element) => ({ lines: [element.text], baseline: 10, lineWidths: [100] }), measureWidth);
    const [cover, left, right] = request.document.pages;

    expect(cover).toBe(source.pages[0]);
    // 右頁：主頁內容 → 左頁跨過來的圖（x − 500）→ 自己的物件
    expect(right.elements.map((e) => e.id)).toEqual([masterCopyId(2, 0), spilloverCopyId(2, 0), reach.id, own3.id]);
    expect(right.elements[1]).toMatchObject({ type: "shape", x: 300 - 500, width: 300 });
    // 左頁：右頁跨過來的文字（x + 500），{頁碼} 用它所屬頁（第 3 頁）的值；自己的圖在上面
    expect(left.elements.map((e) => e.id)).toEqual([spilloverCopyId(1, 0), wide.id]);
    expect(left.elements[0]).toMatchObject({ type: "text", x: -80 + 500, text: "第 3 頁" });
    expect(request.textLayouts[spilloverCopyId(1, 0)].lines).toEqual(["第 3 頁"]);
    // 右頁自己的文字也是第 3 頁
    expect(request.textLayouts[reach.id].lines).toEqual(["第 3 頁"]);
    expect(request.document.pages.flatMap((page) => page.elements).every((e) => e.id.length <= 64)).toBe(true);
    // 原本的文件不變
    expect(source.pages[2].elements).toHaveLength(2);
  });

  it("returns the same document when there are no masters, variables or page numbers", () => {
    const page = { ...createPage("P", { width: 595, height: 842 }, "#ffffff"), elements: [createTextElement("body", { x: 0, y: 0 })] };
    const source: EditorDocument = { name: "測試", margins: DEFAULT_MARGINS, textStyles: [], pageNumberRules: [], masters: [], pages: [page] };
    const request = buildExportRequest(source, (element) => ({ lines: [element.text], baseline: 10, lineWidths: [100] }), measureWidth);
    expect(request.document).toBe(source);
  });
});
