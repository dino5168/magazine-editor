import { describe, expect, it } from "vitest";
import { libraryDropResult, type LibraryDragPayload, type LibraryDropTarget } from "../library-drop";
import type { Library } from "../types";
import fixtureJson from "../../../../tests/fixtures/sample-library.json?raw";

// fixture：封面(f-cover) ─ 人物(f-people)、內頁插圖(f-inner)、文字稿(f-text)
const library = JSON.parse(fixtureJson) as Library;
const AT = "2026-10-08T12:00:00Z";
const drop = (payload: LibraryDragPayload, target: LibraryDropTarget) => libraryDropResult(library, payload, target, AT);
const items = (...ids: string[]): LibraryDragPayload => ({ type: "items", ids });
const folder = (id: string): LibraryDragPayload => ({ type: "folder", id });

describe("dropping items", () => {
  it("moves into a folder from any part of the row, or to 未分類", () => {
    for (const zone of ["before", "into", "after"] as const) {
      expect(drop(items("i-unsorted"), { type: "folder", id: "f-inner", zone })).toEqual({
        action: { type: "item/move", ids: ["i-unsorted"], folderId: "f-inner" },
      });
    }
    expect(drop(items("i-cover-photo"), { type: "unsorted" })).toEqual({
      action: { type: "item/move", ids: ["i-cover-photo"], folderId: null },
    });
  });

  it("trashes on 垃圾桶 and restores when dragged out of the trash", () => {
    expect(drop(items("i-unsorted"), { type: "trash" })).toEqual({ action: { type: "item/trash", ids: ["i-unsorted"], at: AT } });
    expect(drop(items("i-old-cover"), { type: "folder", id: "f-text", zone: "into" })).toEqual({
      action: { type: "item/restore", ids: ["i-old-cover"], folderId: "f-text" },
    });
    expect(drop(items("i-old-cover"), { type: "unsorted" })).toEqual({
      action: { type: "item/restore", ids: ["i-old-cover"], folderId: null },
    });
    expect(drop(items("i-old-cover"), { type: "trash" })).toBeNull();
  });

  it("does nothing on 全部, the header, or where the items already are", () => {
    expect(drop(items("i-unsorted"), { type: "all" })).toBeNull();
    expect(drop(items("i-unsorted"), { type: "root" })).toBeNull();
    expect(drop(items("i-unsorted"), { type: "unsorted" })).toBeNull();
    expect(drop(items("i-cover-photo"), { type: "folder", id: "f-people", zone: "into" })).toBeNull();
  });
});

describe("dropping folders", () => {
  it("nests, reorders and moves to the top level", () => {
    expect(drop(folder("f-text"), { type: "folder", id: "f-cover", zone: "into" })).toEqual({
      action: { type: "folder/move", id: "f-text", targetId: "f-cover", zone: "into" },
    });
    expect(drop(folder("f-text"), { type: "folder", id: "f-cover", zone: "before" })).toEqual({
      action: { type: "folder/move", id: "f-text", targetId: "f-cover", zone: "before" },
    });
    expect(drop(folder("f-people"), { type: "root" })).toEqual({
      action: { type: "folder/move", id: "f-people", targetId: null, zone: "root" },
    });
  });

  it("explains refused moves and ignores no-ops", () => {
    expect(drop(folder("f-cover"), { type: "folder", id: "f-people", zone: "into" })).toEqual({ error: "不能放進自己的子資料夾" });
    expect(drop(folder("f-cover"), { type: "folder", id: "f-cover", zone: "into" })).toBeNull();
    // 已經在最後一個 / 已經在那個位置
    expect(drop(folder("f-text"), { type: "root" })).toBeNull();
    expect(drop(folder("f-inner"), { type: "folder", id: "f-text", zone: "before" })).toBeNull();
    // 系統列不收資料夾
    expect(drop(folder("f-text"), { type: "trash" })).toBeNull();
    expect(drop(folder("f-text"), { type: "unsorted" })).toBeNull();
  });
});
