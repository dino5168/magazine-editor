import { describe, expect, it } from "vitest";
import { createPage, createShapeElement, createTextElement } from "@/lib/editor/element-factory";
import { LABEL_PADDING_PT, createLabel } from "@/lib/editor/shape-label";
import type { EditorDocument } from "@/lib/editor/types";
import { buildExportRequest } from "../export-request";

describe("buildExportRequest", () => {
  it("measures every text element on every page and nothing else", () => {
    const first = createPage("封面", { width: 595, height: 842 }, "#ffffff");
    const second = createPage("內頁", { width: 595, height: 842 }, "#ffffff");
    const title = createTextElement("heading", { x: 100, y: 100 });
    const body = createTextElement("body", { x: 100, y: 200 });
    const document: EditorDocument = {
      name: "測試",
      pages: [
        { ...first, elements: [title, createShapeElement("rect", { x: 50, y: 50 })] },
        { ...second, elements: [body] },
      ],
    };
    const measured: string[] = [];

    const request = buildExportRequest(document, (element) => {
      measured.push(element.id);
      return { lines: [element.text], baseline: element.fontSize };
    });

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
    const document: EditorDocument = { name: "測試", pages: [{ ...page, elements: [shape, labelled, empty] }] };
    const widths: number[] = [];

    const request = buildExportRequest(document, (element) => {
      widths.push(element.width);
      return { lines: [element.text], baseline: 10 };
    });

    expect(Object.keys(request.textLayouts)).toEqual([`${labelled.id}#label`]);
    expect(request.textLayouts[`${labelled.id}#label`].lines).toEqual(["圖形內文字"]);
    expect(widths).toEqual([labelled.width - 2 * LABEL_PADDING_PT]);
  });
});
