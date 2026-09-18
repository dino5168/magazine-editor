import { describe, expect, it } from "vitest";
import { createBlankDocument } from "@/lib/editor/element-factory";
import { formatWindowTitle, isDirty } from "../project-context";

const info = { id: "p", root: "D:\p", untitled: false };

describe("isDirty", () => {
  it("compares documents by reference", () => {
    const saved = createBlankDocument();
    expect(isDirty(info, saved, saved)).toBe(false);
    expect(isDirty(info, { ...saved }, saved)).toBe(true);
  });

  it("is dirty when there is no saved version (opened from backup)", () => {
    expect(isDirty(info, createBlankDocument(), null)).toBe(true);
  });

  it("is never dirty without a project (browser-only mode)", () => {
    expect(isDirty(null, createBlankDocument(), null)).toBe(false);
  });
});

describe("formatWindowTitle", () => {
  it("prefixes a dot for unsaved changes", () => {
    expect(formatWindowTitle("春季號", false)).toBe("春季號 — 雜誌編輯軟體");
    expect(formatWindowTitle("春季號", true)).toBe("● 春季號 — 雜誌編輯軟體");
  });
});
