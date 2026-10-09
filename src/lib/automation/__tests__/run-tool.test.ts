import { describe, expect, it } from "vitest";
import { createInitialState, editorReducer } from "@/lib/editor/editor-reducer";
import type { EditorDocument } from "@/lib/editor/types";
import { excerpt, TEXT_EXCERPT_LENGTH } from "../queries";
import { TOOL_DEFINITIONS, TOOL_NAMES } from "../tool-definitions";
import { toolSession } from "./tool-session";
import fixtureJson from "../../../../tests/fixtures/sample.magproj?raw";

const document = (JSON.parse(fixtureJson) as { document: EditorDocument }).document;
const state = createInitialState(document);
const session = toolSession(state);
const data = session.ok;
const error = session.error;

describe("runTool: arguments", () => {
  it("rejects an unknown tool", () => {
    expect(error("delete_everything")).toContain("delete_everything");
  });

  it("treats missing arguments as an empty object", () => {
    expect(data("get_document").name).toBe("範例雜誌");
  });

  it("reports unknown keys and wrong types in Chinese with the argument path", () => {
    expect(error("get_document", { verbose: true })).toContain("verbose");
    const message = error("get_element", { id: 3 });
    expect(message).toContain("參數 id");
  });

  it("rejects arguments that are not an object", () => {
    expect(error("list_pages", "all")).not.toBe("");
  });
});

describe("runTool: queries", () => {
  it("get_document summarizes the fixture", () => {
    const summary = data("get_document");
    expect(summary).toMatchObject({
      name: "範例雜誌",
      unit: "pt",
      pageCount: document.pages.length,
      masterCount: 2,
      pageNumberRules: document.pageNumberRules.length,
      unsavedChanges: false,
      activeSheet: { id: "page-1", kind: "page", index: 1 },
    });
    expect(summary.pageSizes).toEqual([{ width: 595.28, height: 841.89, pages: document.pages.length }]);
    expect(summary.margins.top).toBe(42.52);
  });

  it("get_document reports unsaved changes and an edited master page", () => {
    const edited = editorReducer(
      editorReducer(state, { type: "document/rename", name: "新名稱" }),
      { type: "page/select", id: "master-b" },
    );
    expect(toolSession(edited).ok("get_document")).toMatchObject({
      name: "新名稱",
      unsavedChanges: true,
      activeSheet: { id: "master-b", kind: "master", index: null },
    });
  });

  it("list_pages lists pages in order and masters with their users", () => {
    const { pages, masters } = data("list_pages");
    expect(pages[0]).toMatchObject({ index: 1, id: "page-1", name: "封面", masterId: "master-b" });
    expect(pages[0].elementCount).toBe(document.pages[0].elements.length);
    // page-1 套用 master-b，master-b 以 master-a 為基礎：兩個主頁都算被使用
    expect(masters.map((m: any) => [m.id, m.parentId, m.usedByPages])).toEqual([
      ["master-a", null, 1],
      ["master-b", "master-a", 1],
    ]);
  });

  it("list_elements defaults to the active page, bottom layer first", () => {
    const { sheet, elements } = data("list_elements");
    expect(sheet.id).toBe("page-1");
    expect(elements.map((e: any) => e.id)).toEqual(document.pages[0].elements.map((e) => e.id));
    expect(elements[0]).toMatchObject({ type: "text", layer: 0, summary: "文字「雜誌標題 ⏎ 副標」" });
    expect(elements[0]).not.toHaveProperty("height");
    expect(elements[1]).toMatchObject({ type: "shape", height: 130, rotation: 12.5 });
  });

  it("list_elements reads a master page and rejects an unknown page", () => {
    expect(data("list_elements", { pageId: "master-b" }).sheet).toMatchObject({ kind: "master" });
    expect(error("list_elements", { pageId: "nope" })).toContain("list_pages");
  });

  it("get_element finds elements on pages and master pages", () => {
    expect(data("get_element", { id: "el-text" })).toMatchObject({
      sheet: { id: "page-1" },
      layer: 0,
      element: document.pages[0].elements[0],
    });
    expect(data("get_element", { id: "el-master-logo" }).sheet.kind).toBe("master");
    expect(error("get_element", { id: "nope" })).toContain("list_elements");
  });

  it("read-only tools leave the state untouched", () => {
    const readOnly = TOOL_NAMES.filter((name) => TOOL_DEFINITIONS[name].readOnly);
    expect(readOnly).toContain("get_document");
    const readOnlySession = toolSession(state);
    for (const name of readOnly) readOnlySession.call(name, {});
    expect(readOnlySession.state).toBe(state);
  });
});

describe("excerpt", () => {
  it("cuts long text by characters, not UTF-16 units", () => {
    const text = "😀".repeat(TEXT_EXCERPT_LENGTH + 5);
    expect(Array.from(excerpt(text))).toHaveLength(TEXT_EXCERPT_LENGTH + 1);
    expect(excerpt("短")).toBe("短");
  });
});
