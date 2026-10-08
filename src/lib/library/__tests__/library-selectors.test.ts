import { describe, expect, it } from "vitest";
import { importFolderOf, importOutcome, libraryCounts, projectAssets, visibleItems } from "../library-selectors";
import type { Library } from "../types";
import fixtureJson from "../../../../tests/fixtures/sample-library.json?raw";

const library = JSON.parse(fixtureJson) as Library;
const ids = (items: readonly { id: string }[]) => items.map((item) => item.id);

describe("libraryCounts", () => {
  it("counts system entries and folders including subfolders", () => {
    const counts = libraryCounts(library);
    expect([counts.all, counts.unsorted, counts.trash]).toEqual([5, 2, 1]);
    expect(Object.fromEntries(counts.folders)).toEqual({ "f-cover": 1, "f-people": 1, "f-inner": 1, "f-text": 1 });
  });
});

describe("visibleItems", () => {
  it("lists each view newest first", () => {
    expect(ids(visibleItems(library, { type: "all" }))).toEqual([
      "i-illustration",
      "i-interview",
      "i-editorial",
      "i-unsorted",
      "i-cover-photo",
    ]);
    expect(ids(visibleItems(library, { type: "unsorted" }))).toEqual(["i-interview", "i-unsorted"]);
    expect(ids(visibleItems(library, { type: "trash" }))).toEqual(["i-old-cover"]);
    // 資料夾包含子資料夾的素材
    expect(ids(visibleItems(library, { type: "folder", id: "f-cover" }))).toEqual(["i-cover-photo"]);
  });

  it("filters by name and keeps array order for equal times", () => {
    expect(ids(visibleItems(library, { type: "all" }, " PNG "))).toEqual(["i-illustration", "i-unsorted", "i-cover-photo"]);
    const same = { ...library, items: library.items.map((item) => ({ ...item, importedAt: "2026-01-01T00:00:00Z" })) };
    // 同時間時陣列後面的比較新
    expect(ids(visibleItems(same, { type: "unsorted" }))).toEqual(["i-interview", "i-unsorted"]);
  });
});

describe("projectAssets", () => {
  it("lists every image, trash included, for project.magproj", () => {
    expect(projectAssets(library)).toEqual([
      { src: "assets/images/0123456789abcdef0123456789abcdef.png", name: "封面照片.png", width: 1600, height: 900 },
      { src: "assets/images/fedcba9876543210fedcba9876543210.png", name: "未命名-01.png", width: 800, height: 1200 },
      { src: "assets/images/33333333333333333333333333333333.png", name: "貓咪插畫.png", width: 900, height: 1200 },
      { src: "assets/images/44444444444444444444444444444444.jpg", name: "舊封面試排.jpg", width: 1000, height: 1400 },
    ]);
  });
});

describe("imports", () => {
  it("goes to the shown folder, otherwise 未分類", () => {
    expect(importFolderOf({ type: "folder", id: "f-inner" })).toBe("f-inner");
    expect(importFolderOf({ type: "all" })).toBeNull();
    expect(importFolderOf({ type: "trash" })).toBeNull();
  });

  it("tells new, duplicate and restore apart", () => {
    expect(importOutcome(library, "assets/images/new.png")).toBe("new");
    expect(importOutcome(library, library.items[0].src)).toBe("duplicate");
    expect(importOutcome(library, library.items[5].src)).toBe("restore");
  });
});
