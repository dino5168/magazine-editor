import { describe, expect, it } from "vitest";
import {
  descendants,
  folderChainLength,
  folderMoveError,
  folderPath,
  treeDropZone,
  treeRows,
} from "../library-tree";
import { LIBRARY_DEPTH_MAX, type LibraryFolder } from "../types";

// 封面 ─ 人物 ─ 近照
//      └ 風景
// 內頁
const folders: LibraryFolder[] = [
  { id: "cover", name: "封面", parentId: null },
  { id: "people", name: "人物", parentId: "cover" },
  { id: "close", name: "近照", parentId: "people" },
  { id: "land", name: "風景", parentId: "cover" },
  { id: "inner", name: "內頁", parentId: null },
];

const chain = (count: number): LibraryFolder[] =>
  Array.from({ length: count }, (_, i) => ({ id: `d${i}`, name: `層${i}`, parentId: i === 0 ? null : `d${i - 1}` }));

describe("tree queries", () => {
  it("walks parents, children and paths", () => {
    expect(folderChainLength(folders, "close")).toBe(3);
    expect(folderChainLength(folders, "inner")).toBe(1);
    expect(folderChainLength([{ id: "a", name: "a", parentId: "a" }], "a")).toBeNull();
    expect(descendants(folders, "cover")).toEqual(["cover", "people", "land", "close"]);
    expect(folderPath(folders, "close")).toEqual(["封面", "人物", "近照"]);
    expect(folderPath(folders, "nope")).toEqual([]);
  });

  it("flattens expanded folders into rows", () => {
    const rows = (expanded: string[]) =>
      treeRows(folders, new Set(expanded)).map((row) => `${"-".repeat(row.depth)}${row.folder.name}${row.hasChildren ? "+" : ""}`);
    expect(rows([])).toEqual(["封面+", "內頁"]);
    expect(rows(["cover"])).toEqual(["封面+", "-人物+", "-風景", "內頁"]);
    expect(rows(["cover", "people"])).toEqual(["封面+", "-人物+", "--近照", "-風景", "內頁"]);
    // 父資料夾收起時，子資料夾展開也看不到
    expect(rows(["people"])).toEqual(["封面+", "內頁"]);
  });

  it("splits a row into before / into / after", () => {
    expect(treeDropZone(100, 40, 105)).toBe("before");
    expect(treeDropZone(100, 40, 120)).toBe("into");
    expect(treeDropZone(100, 40, 135)).toBe("after");
  });
});

describe("folderMoveError", () => {
  it("allows normal moves", () => {
    expect(folderMoveError(folders, "inner", "cover", "into")).toBeNull();
    expect(folderMoveError(folders, "land", "inner", "before")).toBeNull();
    expect(folderMoveError(folders, "people", null, "root")).toBeNull();
    // 放在自己前後 = 沒有變化，不算錯
    expect(folderMoveError(folders, "inner", "inner", "after")).toBeNull();
  });

  it("refuses moves into itself or a descendant", () => {
    expect(folderMoveError(folders, "cover", "cover", "into")).toBe("不能放進自己裡面");
    expect(folderMoveError(folders, "cover", "close", "into")).toBe("不能放進自己的子資料夾");
    expect(folderMoveError(folders, "cover", "people", "after")).toBe("不能放進自己的子資料夾");
  });

  it("refuses a name clash at the new level", () => {
    const withClash = [...folders, { id: "people2", name: "人物", parentId: null }];
    expect(folderMoveError(withClash, "people2", "cover", "into")).toBe("同一層已經有「人物」");
    // 同一層裡調整順序不算撞名
    expect(folderMoveError(withClash, "people2", "inner", "before")).toBeNull();
  });

  it("counts the whole subtree against the depth limit", () => {
    const deep = chain(LIBRARY_DEPTH_MAX - 1);
    const two: LibraryFolder[] = [...deep, { id: "x", name: "x", parentId: null }, { id: "y", name: "y", parentId: "x" }];
    // 7 層 + 1 層的資料夾 = 8，可以；7 層 + 2 層 = 9，不行
    expect(folderMoveError(two, "y", `d${LIBRARY_DEPTH_MAX - 2}`, "into")).toBeNull();
    expect(folderMoveError(two, "x", `d${LIBRARY_DEPTH_MAX - 2}`, "into")).toBe(`資料夾最多 ${LIBRARY_DEPTH_MAX} 層`);
  });
});
