import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, type Preferences } from "../preferences";
import { VIEW_TOGGLES, getViewToggle } from "../view-toggles";

// 每個開關對應的欄位；用來確認切換時只改自己的欄位
const FIELD_OF = {
  rulers: (p: Preferences) => p.showRulers,
  grid: (p: Preferences) => p.grid.visible,
  contentGuides: (p: Preferences) => p.showContentGuides,
  margins: (p: Preferences) => p.showMargins,
  snap: (p: Preferences) => p.grid.snap,
} as const;

describe("VIEW_TOGGLES", () => {
  it("lists 尺規, 格線, 內容區對齊線, 邊界參考線, 吸附格線 in menu order with unique ids", () => {
    expect(VIEW_TOGGLES.map((toggle) => toggle.id)).toEqual(["rulers", "grid", "contentGuides", "margins", "snap"]);
    expect(VIEW_TOGGLES.map((toggle) => toggle.label)).toEqual(["尺規", "格線", "內容區對齊線", "邊界參考線", "吸附格線"]);
  });

  it("toggles the content guides apart from the grid", () => {
    const shown = getViewToggle("contentGuides").toggle(DEFAULT_PREFERENCES);
    expect(shown.showContentGuides).toBe(true);
    expect(shown.grid.visible).toBe(false);
  });

  it("reads the matching preference", () => {
    for (const toggle of VIEW_TOGGLES) expect(toggle.read(DEFAULT_PREFERENCES)).toBe(FIELD_OF[toggle.id](DEFAULT_PREFERENCES));
  });

  it("flips only its own field and keeps the rest", () => {
    for (const toggle of VIEW_TOGGLES) {
      const next = toggle.toggle(DEFAULT_PREFERENCES);
      expect(toggle.read(next)).toBe(!toggle.read(DEFAULT_PREFERENCES));
      for (const other of VIEW_TOGGLES.filter((candidate) => candidate.id !== toggle.id)) {
        expect(other.read(next), `${toggle.id} changed ${other.id}`).toBe(other.read(DEFAULT_PREFERENCES));
      }
      expect(next.grid.spacing).toBe(DEFAULT_PREFERENCES.grid.spacing);
      expect(next.showPageNumbers).toBe(DEFAULT_PREFERENCES.showPageNumbers);
      expect(next.pageView).toBe(DEFAULT_PREFERENCES.pageView);
    }
  });

  it("returns to the original values when toggled twice, without mutating the input", () => {
    const before = structuredClone(DEFAULT_PREFERENCES);
    for (const toggle of VIEW_TOGGLES) expect(toggle.toggle(toggle.toggle(DEFAULT_PREFERENCES))).toEqual(DEFAULT_PREFERENCES);
    expect(DEFAULT_PREFERENCES).toEqual(before);
  });

  it("finds a toggle by id", () => {
    expect(getViewToggle("snap").label).toBe("吸附格線");
  });
});
