import { describe, expect, it } from "vitest";
import { libraryReducer, type LibraryAction } from "../library-reducer";
import { libraryProblem } from "../library-validation";
import type { ImageItem, Library, LibraryItem } from "../types";
import fixtureJson from "../../../../tests/fixtures/sample-library.json?raw";

// fixture：封面(f-cover) ─ 人物(f-people)、內頁插圖(f-inner)、文字稿(f-text)
// 素材：i-cover-photo（人物）、i-unsorted、i-editorial（文字稿）、i-interview（音訊、未分類）、
//       i-illustration（內頁插圖）、i-old-cover（垃圾桶，來自已刪除的 f-deleted）
const fixture = (): Library => JSON.parse(fixtureJson) as Library;
const AT = "2026-10-08T12:00:00Z";

function apply(library: Library, ...actions: LibraryAction[]): Library {
  const result = actions.reduce(libraryReducer, library);
  expect(libraryProblem(result)).toBeNull();
  return result;
}

const item = (library: Library, id: string): LibraryItem => library.items.find((candidate) => candidate.id === id)!;

function newImage(id: string, src: string, folderId: string | null): ImageItem {
  return { kind: "image", id, name: " 新圖片.png ", src, bytes: 1, folderId, importedAt: AT, trashed: null, width: 10, height: 10 };
}

describe("items", () => {
  it("adds a new item (name trimmed) and ignores the same file again", () => {
    const library = fixture();
    const added = apply(library, { type: "item/add", item: newImage("n1", "assets/images/abc.png", "f-inner") });
    expect(item(added, "n1")).toMatchObject({ name: "新圖片.png", folderId: "f-inner" });
    expect(libraryReducer(added, { type: "item/add", item: newImage("n2", "assets/images/abc.png", null) })).toBe(added);
  });

  it("restores a trashed file into the import folder instead of adding it", () => {
    const library = fixture();
    const old = item(library, "i-old-cover");
    const next = apply(library, { type: "item/add", item: newImage("n1", old.src, "f-inner") });
    expect(next.items).toHaveLength(library.items.length);
    expect(item(next, "i-old-cover")).toMatchObject({ folderId: "f-inner", trashed: null });
  });

  it("moves items, skipping trashed ones and missing folders", () => {
    const library = fixture();
    const moved = apply(library, { type: "item/move", ids: ["i-unsorted", "i-old-cover"], folderId: "f-cover" });
    expect(item(moved, "i-unsorted").folderId).toBe("f-cover");
    expect(item(moved, "i-old-cover").trashed).not.toBeNull();
    expect(apply(moved, { type: "item/move", ids: ["i-unsorted"], folderId: null }).items).toEqual(library.items);
    expect(libraryReducer(library, { type: "item/move", ids: ["i-unsorted"], folderId: "nope" })).toBe(library);
    expect(libraryReducer(library, { type: "item/move", ids: ["i-unsorted"], folderId: null })).toBe(library);
  });

  it("renames with the same rules as the UI", () => {
    const library = fixture();
    expect(item(apply(library, { type: "item/rename", id: "i-unsorted", name: " 改名 " }), "i-unsorted").name).toBe("改名");
    expect(libraryReducer(library, { type: "item/rename", id: "i-unsorted", name: "  " })).toBe(library);
    expect(libraryReducer(library, { type: "item/rename", id: "i-unsorted", name: "未命名-01.png" })).toBe(library);
  });

  it("trashes with the folder path and restores to it", () => {
    const library = fixture();
    const trashed = apply(library, { type: "item/trash", ids: ["i-cover-photo"], at: AT });
    expect(item(trashed, "i-cover-photo")).toMatchObject({
      folderId: null,
      trashed: { at: AT, fromFolderId: "f-people", fromName: "封面 / 人物" },
    });
    expect(libraryReducer(trashed, { type: "item/trash", ids: ["i-cover-photo"], at: AT })).toBe(trashed);
    const restored = apply(trashed, { type: "item/restore", ids: ["i-cover-photo"] });
    expect(item(restored, "i-cover-photo")).toEqual(item(library, "i-cover-photo"));
  });

  it("restores to 未分類 when the folder is gone, or to an explicit folder", () => {
    const library = fixture();
    expect(item(apply(library, { type: "item/restore", ids: ["i-old-cover"] }), "i-old-cover")).toMatchObject({
      folderId: null,
      trashed: null,
    });
    const dropped = apply(library, { type: "item/restore", ids: ["i-old-cover"], folderId: "f-text" });
    expect(item(dropped, "i-old-cover").folderId).toBe("f-text");
    expect(libraryReducer(library, { type: "item/restore", ids: ["i-old-cover"], folderId: "nope" })).toBe(library);
  });

  it("purges only trashed items and empties the trash", () => {
    const library = fixture();
    expect(libraryReducer(library, { type: "item/purge", ids: ["i-unsorted"] })).toBe(library);
    const purged = apply(library, { type: "item/purge", ids: ["i-old-cover", "i-unsorted"] });
    expect(purged.items.map((candidate) => candidate.id)).not.toContain("i-old-cover");
    expect(purged.items).toHaveLength(library.items.length - 1);
    expect(apply(library, { type: "trash/empty" }).items).toEqual(purged.items);
    expect(libraryReducer(purged, { type: "trash/empty" })).toBe(purged);
  });
});

describe("folders", () => {
  it("adds folders with valid names and depth", () => {
    const library = fixture();
    const added = apply(library, { type: "folder/add", folder: { id: "n", name: "新資料夾", parentId: "f-people" } });
    expect(added.folders[added.folders.length - 1]).toEqual({ id: "n", name: "新資料夾", parentId: "f-people" });
    for (const folder of [
      { id: "n", name: "人物", parentId: "f-cover" },
      { id: "n", name: " 空白 ", parentId: null },
      { id: "n", name: "x", parentId: "nope" },
      { id: "f-cover", name: "x", parentId: null },
    ]) {
      expect(libraryReducer(library, { type: "folder/add", folder }), folder.name).toBe(library);
    }
  });

  it("renames, refusing clashes", () => {
    const library = fixture();
    expect(apply(library, { type: "folder/rename", id: "f-inner", name: " 插圖 " }).folders[2].name).toBe("插圖");
    expect(libraryReducer(library, { type: "folder/rename", id: "f-inner", name: "封面" })).toBe(library);
    expect(libraryReducer(library, { type: "folder/rename", id: "f-inner", name: "內頁插圖" })).toBe(library);
  });

  it("moves folders into, before, after and to the top level", () => {
    const library = fixture();
    const ids = (next: Library) => next.folders.map((folder) => `${folder.id}<${folder.parentId ?? ""}`);
    const into = apply(library, { type: "folder/move", id: "f-text", targetId: "f-cover", zone: "into" });
    expect(ids(into)).toEqual(["f-cover<", "f-people<f-cover", "f-inner<", "f-text<f-cover"]);
    const before = apply(library, { type: "folder/move", id: "f-text", targetId: "f-cover", zone: "before" });
    expect(ids(before)).toEqual(["f-text<", "f-cover<", "f-people<f-cover", "f-inner<"]);
    const after = apply(library, { type: "folder/move", id: "f-people", targetId: "f-inner", zone: "after" });
    expect(ids(after)).toEqual(["f-cover<", "f-inner<", "f-people<", "f-text<"]);
    const root = apply(library, { type: "folder/move", id: "f-people", targetId: null, zone: "root" });
    expect(ids(root)).toEqual(["f-cover<", "f-inner<", "f-text<", "f-people<"]);
  });

  it("returns the same state for moves that change nothing or are refused", () => {
    const library = fixture();
    expect(libraryReducer(library, { type: "folder/move", id: "f-text", targetId: null, zone: "root" })).toBe(library);
    expect(libraryReducer(library, { type: "folder/move", id: "f-inner", targetId: "f-text", zone: "before" })).toBe(library);
    expect(libraryReducer(library, { type: "folder/move", id: "f-inner", targetId: "f-inner", zone: "after" })).toBe(library);
    expect(libraryReducer(library, { type: "folder/move", id: "f-cover", targetId: "f-people", zone: "into" })).toBe(library);
  });

  it("deletes a folder with its subfolders and trashes their items", () => {
    const library = fixture();
    const next = apply(library, { type: "folder/delete", id: "f-cover", at: AT });
    expect(next.folders.map((folder) => folder.id)).toEqual(["f-inner", "f-text"]);
    expect(item(next, "i-cover-photo")).toMatchObject({
      folderId: null,
      trashed: { at: AT, fromFolderId: "f-people", fromName: "封面 / 人物" },
    });
    // 其他資料夾的素材不受影響；還原時原資料夾不在 → 未分類
    expect(item(next, "i-illustration")).toEqual(item(library, "i-illustration"));
    expect(item(apply(next, { type: "item/restore", ids: ["i-cover-photo"] }), "i-cover-photo").folderId).toBeNull();
    expect(libraryReducer(library, { type: "folder/delete", id: "nope", at: AT })).toBe(library);
  });
});

describe("library/load", () => {
  it("replaces the whole library", () => {
    const library = fixture();
    const other = { ...library, items: [] };
    expect(libraryReducer(library, { type: "library/load", library: other })).toBe(other);
    expect(libraryReducer(library, { type: "library/load", library })).toBe(library);
  });
});
