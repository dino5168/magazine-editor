import { describe, expect, it } from "vitest";
import { folderNameError, isAssetPathIn, itemNameError, libraryProblem } from "../library-validation";
import { LIBRARY_DEPTH_MAX, TEXT_EXCERPT_MAX_CHARS, type Library, type LibraryFolder } from "../types";
// 與 src-tauri 的 cargo test 共用同一份 fixture；兩邊欄位名稱或規則不一致時，其中一邊的測試會失敗
import fixtureJson from "../../../../tests/fixtures/sample-library.json?raw";

type Mutable = { folders: Record<string, unknown>[]; items: Record<string, unknown>[]; libraryVersion: unknown };

const fresh = (): Mutable => JSON.parse(fixtureJson) as Mutable;
const problemOf = (value: Mutable): string | null => libraryProblem(value as unknown as Library);

describe("library fixture", () => {
  it("is valid", () => {
    expect(problemOf(fresh())).toBeNull();
  });

  it("uses the TypeScript field names", () => {
    const library = fresh();
    expect(Object.keys(library.folders[0]).sort()).toEqual(["id", "name", "parentId"]);
    const base = ["bytes", "folderId", "id", "importedAt", "kind", "name", "src", "trashed"];
    const byKind = Object.fromEntries(library.items.map((item) => [item.kind, Object.keys(item).sort()]));
    expect(byKind.image).toEqual([...base, "height", "width"].sort());
    expect(byKind.text).toEqual([...base, "excerpt"].sort());
    expect(byKind.audio).toEqual(base);
    const trashed = library.items.find((item) => item.trashed !== null)!.trashed as object;
    expect(Object.keys(trashed).sort()).toEqual(["at", "fromFolderId", "fromName"]);
  });
});

describe("libraryProblem", () => {
  // 和 Rust library.rs 的 rejects_bad_folders / rejects_bad_items 同樣的案例
  const cases: [string, (value: Mutable) => void][] = [
    ["cycle", (v) => (v.folders[0].parentId = "f-people")],
    ["missing parent", (v) => (v.folders[1].parentId = "nope")],
    ["duplicate sibling name", (v) => (v.folders[3].name = v.folders[0].name)],
    ["duplicate folder id", (v) => (v.folders[3].id = v.folders[0].id)],
    ["untrimmed name", (v) => (v.folders[0].name = " 封面")],
    ["empty name", (v) => (v.folders[0].name = "")],
    ["image in texts dir", (v) => (v.items[0].src = "assets/texts/0123456789abcdef0123456789abcdef.png")],
    ["text in images dir", (v) => (v.items[2].src = "assets/images/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.md")],
    ["path escape", (v) => (v.items[3].src = "assets/audio/../../secret.mp3")],
    ["duplicate src", (v) => (v.items[1].src = v.items[0].src)],
    ["duplicate item id", (v) => (v.items[1].id = v.items[0].id)],
    ["missing folder", (v) => (v.items[0].folderId = "nope")],
    ["trashed but in a folder", (v) => (v.items[5].folderId = "f-cover")],
    ["zero size image", (v) => (v.items[0].width = 0)],
    ["long excerpt", (v) => (v.items[2].excerpt = "字".repeat(TEXT_EXCERPT_MAX_CHARS + 1))],
    ["version 2", (v) => (v.libraryVersion = 2)],
  ];

  it.each(cases)("rejects %s", (_label, edit) => {
    const value = fresh();
    edit(value);
    expect(problemOf(value)).not.toBeNull();
  });

  it("allows the same name in different parents", () => {
    const value = fresh();
    value.folders[3].name = "人物";
    expect(problemOf(value)).toBeNull();
  });

  it("allows 8 levels but not 9", () => {
    const chain = (count: number): Library => ({
      libraryVersion: 1,
      folders: Array.from({ length: count }, (_, i) => ({ id: `d${i}`, name: `層${i}`, parentId: i === 0 ? null : `d${i - 1}` })),
      items: [],
    });
    expect(libraryProblem(chain(LIBRARY_DEPTH_MAX))).toBeNull();
    expect(libraryProblem(chain(LIBRARY_DEPTH_MAX + 1))).not.toBeNull();
  });
});

describe("names", () => {
  const folders: LibraryFolder[] = [
    { id: "a", name: "封面", parentId: null },
    { id: "b", name: "人物", parentId: "a" },
  ];

  it("explains folder name problems in Chinese", () => {
    expect(folderNameError(folders, null, "  ")).toBe("名稱不可空白");
    expect(folderNameError(folders, null, "a\nb")).toBe("名稱不可換行");
    expect(folderNameError(folders, null, "字".repeat(101))).toBe("名稱最多 100 個字");
    expect(folderNameError(folders, null, " 封面 ")).toBe("同一層已經有「封面」");
    expect(folderNameError(folders, "a", "封面")).toBeNull();
    // 改名成自己原本的名稱不算重複
    expect(folderNameError(folders, null, "封面", "a")).toBeNull();
  });

  it("counts characters like Rust (code points)", () => {
    // 罕用字（UTF-16 兩個單位）算一個字
    expect(folderNameError(folders, null, "𠀀".repeat(100))).toBeNull();
    expect(itemNameError("𠀀".repeat(255))).toBeNull();
    expect(itemNameError("𠀀".repeat(256))).toBe("名稱最多 255 個字");
  });

  it("checks asset paths like Rust", () => {
    expect(isAssetPathIn("assets/texts/a.md", "assets/texts")).toBe(true);
    for (const bad of ["assets/texts/", "assets/texts/.a", "assets/texts/a/b", "assets/texts/a\\b", "assets/textsX/a", "assets/texts/.."]) {
      expect(isAssetPathIn(bad, "assets/texts"), bad).toBe(false);
    }
  });
});
