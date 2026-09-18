import { describe, expect, it } from "vitest";
import { formatWindowTitle } from "../project-context";

describe("formatWindowTitle", () => {
  it("prefixes a dot for unsaved changes", () => {
    expect(formatWindowTitle("春季號", false)).toBe("春季號 — 雜誌編輯軟體");
    expect(formatWindowTitle("春季號", true)).toBe("● 春季號 — 雜誌編輯軟體");
  });
});
