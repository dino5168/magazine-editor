import { describe, expect, it } from "vitest";
import { DEFAULT_MARGINS, createPage, createShapeElement, createTextElement } from "@/lib/editor/element-factory";
import { createPageNumberRule, pageNumberShapeId } from "@/lib/editor/page-numbers";
import { LABEL_PADDING_PT, createLabel } from "@/lib/editor/shape-label";
import type { EditorDocument } from "@/lib/editor/types";
import { buildExportRequest } from "../export-request";

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
      pageNumberRules: [],
      pages: [
        { ...first, elements: [title, createShapeElement("rect", { x: 50, y: 50 })] },
        { ...second, elements: [body] },
      ],
    };
    const measured: string[] = [];

    const request = buildExportRequest(document, (element) => {
      measured.push(element.id);
      return { lines: [element.text], baseline: element.fontSize };
    }, measureWidth);

    expect(request.document).toBe(document);
    expect(measured).toEqual([title.id, body.id]);
    expect(request.textLayouts[title.id]).toEqual({ lines: [title.text], baseline: title.fontSize });
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
      pageNumberRules: [],
      pages: [{ ...page, elements: [shape, labelled, empty] }],
    };
    const widths: number[] = [];

    const request = buildExportRequest(document, (element) => {
      widths.push(element.width);
      return { lines: [element.text], baseline: 10 };
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
      pageNumberRules: [{ ...rule, even: { ...rule.even, prefix: "第 ", suffix: " 頁" } }],
      pages: [first, { ...second, elements: [createShapeElement("rect", { x: 50, y: 50 })] }],
    };

    const request = buildExportRequest(source, (element) => ({ lines: [element.text], baseline: 10 }), measureWidth);

    // 原本的文件不變；匯出的副本在第 2 頁最上層多一個頁碼圖形，第 1 頁不在範圍內
    expect(source.pages[1].elements).toHaveLength(1);
    expect(request.document.pages[0]).toBe(first);
    const numbered = request.document.pages[1].elements;
    expect(numbered).toHaveLength(2);
    const pageNumber = numbered[1];
    expect(pageNumber.id).toBe(pageNumberShapeId(second.id));
    expect(request.textLayouts[`${pageNumber.id}#label`].lines).toEqual(["第 2 頁"]);
  });
});
