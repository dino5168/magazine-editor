import { describe, expect, it } from "vitest";
import { fileExtension, kindOfFile, libraryItemName, normalizeText, textExcerpt } from "../library-files";
import { itemNameError } from "../library-validation";
import { MASONRY_MAX_ASPECT, masonryLayout } from "../masonry";
import { ITEM_NAME_MAX_CHARS, TEXT_EXCERPT_MAX_CHARS } from "../types";

describe("masonryLayout", () => {
  const options = { width: 330, minColumnWidth: 100, gap: 10, captionHeight: 20 };

  it("fits as many columns as possible", () => {
    const layout = masonryLayout([], options);
    expect([layout.columns, layout.columnWidth, layout.height]).toEqual([3, 103.33333333333333, 0]);
    expect(masonryLayout([], { ...options, width: 50 }).columns).toBe(1);
  });

  it("puts each card in the shortest column, left to right", () => {
    // 寬 100 的欄：高 200、100、100，第 4 張放進最矮（第 2 欄，同高時取左邊）
    const layout = masonryLayout([{ aspect: 2 }, { aspect: 1 }, { aspect: 1 }, { aspect: 1 }], { ...options, width: 320 });
    expect(layout.columnWidth).toBe(100);
    expect(layout.boxes.map((box) => [box.x, box.y, box.height])).toEqual([
      [0, 0, 200],
      [110, 0, 100],
      [220, 0, 100],
      [110, 130, 100],
    ]);
    expect(layout.height).toBe(250);
  });

  it("clamps extreme aspects", () => {
    const layout = masonryLayout([{ aspect: 10 }, { aspect: Number.NaN }], { ...options, width: 100 });
    expect(layout.boxes[0].height).toBe(100 * MASONRY_MAX_ASPECT);
    expect(layout.boxes[1].height).toBe(100);
  });
});

describe("library files", () => {
  it("routes files by extension", () => {
    expect(kindOfFile("Photo.JPEG")).toBe("image");
    expect(kindOfFile("創刊詞.md")).toBe("text");
    expect(kindOfFile("訪談.m4a")).toBe("audio");
    expect(kindOfFile("影片.mp4")).toBeNull();
    expect(kindOfFile(".md")).toBeNull();
    expect(fileExtension("a.tar.GZ")).toBe("gz");
  });

  it("turns file names into valid item names", () => {
    expect(libraryItemName("  封面\r\n照片.png ")).toBe("封面 照片.png");
    expect(libraryItemName("   ")).toBe("未命名");
    expect([...libraryItemName("𠀀".repeat(300))]).toHaveLength(ITEM_NAME_MAX_CHARS);
    expect(itemNameError(libraryItemName(` ${"字".repeat(254)} x`))).toBeNull();
  });

  it("normalizes text and keeps a code-point excerpt", () => {
    expect(normalizeText("﻿a\r\nb\rc")).toBe("a\nb\nc");
    const excerpt = textExcerpt("𠀀".repeat(TEXT_EXCERPT_MAX_CHARS + 5));
    expect([...excerpt]).toHaveLength(TEXT_EXCERPT_MAX_CHARS);
  });
});
