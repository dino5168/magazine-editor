import { describe, expect, it } from "vitest";
import { DEFAULT_MARGINS, createShapeElement, createTextElement } from "../element-factory";
import { createPageNumberRule } from "../page-numbers";
import { createLabel } from "../shape-label";
import type { EditorDocument, Page } from "../types";
import { resolveElementsVariables, resolveElementVariables, resolveVariables, variableValues } from "../variables";

const page = (id: string): Page => ({ id, name: `第 ${id} 頁`, width: 600, height: 800, background: "#ffffff", elements: [], masterId: null });
const document: EditorDocument = {
  name: "十月號",
  margins: DEFAULT_MARGINS,
  // 第 3 頁起從 1 起算
  pageNumberRules: [{ ...createPageNumberRule("body", 3, 99), start: 1 }],
  masters: [{ id: "M", name: "Master A", width: 600, height: 800, background: "#ffffff", elements: [], parentId: null }],
  pages: [page("a"), page("b"), page("c"), page("d")],
};

describe("variableValues", () => {
  it("numbers pages by the page number rules, else by position", () => {
    expect(variableValues(document, "a")?.["{頁碼}"]).toBe("1");
    expect(variableValues(document, "c")?.["{頁碼}"]).toBe("1");
    expect(variableValues(document, "d")?.["{頁碼}"]).toBe("2");
  });

  it("knows the page count, document name and page name", () => {
    expect(variableValues(document, "b")).toMatchObject({ "{總頁數}": "4", "{文件名稱}": "十月號", "{頁面名稱}": "第 b 頁" });
  });

  it("has no values on a master page", () => {
    expect(variableValues(document, "M")).toBeNull();
  });
});

describe("resolveVariables", () => {
  const values = variableValues(document, "d")!;

  it("replaces every known token, as often as it appears", () => {
    expect(resolveVariables("{文件名稱} · {頁碼} / {總頁數} · {頁碼}", values)).toBe("十月號 · 2 / 4 · 2");
  });

  it("leaves other braces alone", () => {
    expect(resolveVariables("{頁 碼} {page} {{頁碼}}", values)).toBe("{頁 碼} {page} {2}");
  });
});

describe("resolveElementVariables", () => {
  const values = variableValues(document, "a")!;

  it("replaces text in text elements and shape labels, keeping other elements as they are", () => {
    const text = { ...createTextElement("body", { x: 0, y: 0 }), text: "第 {頁碼} 頁" };
    const shape = createShapeElement("rect", { x: 0, y: 0 });
    const labelled = { ...shape, label: createLabel("{頁面名稱}") };
    expect(resolveElementVariables(text, values)).toMatchObject({ text: "第 1 頁" });
    expect(resolveElementVariables(labelled, values)).toMatchObject({ label: { text: "第 a 頁" } });
    expect(resolveElementVariables(shape, values)).toBe(shape);
  });

  it("returns the same array when nothing changes, or for a master page", () => {
    const plain = [createTextElement("body", { x: 0, y: 0 })];
    expect(resolveElementsVariables(plain, values)).toBe(plain);
    const withToken = [{ ...plain[0], text: "{頁碼}" }];
    expect(resolveElementsVariables(withToken, null)).toBe(withToken);
    expect(resolveElementsVariables(withToken, values)).not.toBe(withToken);
  });
});
