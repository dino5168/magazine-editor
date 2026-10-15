import { describe, expect, it } from "vitest";
import {
  DEFAULT_ELEMENTS_PANEL_LAYOUT,
  ELEMENTS_PANEL_STORAGE_KEY,
  accordionValue,
  layoutFromAccordion,
  loadElementsPanelLayout,
  parseElementsPanelLayout,
  saveElementsPanelLayout,
} from "../elements-panel-layout";

describe("parseElementsPanelLayout", () => {
  it("keeps a known category and a stored 'all collapsed'", () => {
    expect(parseElementsPanelLayout({ openCategory: "arrows" })).toEqual({ openCategory: "arrows" });
    expect(parseElementsPanelLayout({ openCategory: null })).toEqual({ openCategory: null });
  });

  it("falls back to 基本 for anything else", () => {
    for (const value of [null, 3, "basic", {}, { openCategory: "shapes-removed-later" }, { openCategory: 1 }]) {
      expect(parseElementsPanelLayout(value)).toBe(DEFAULT_ELEMENTS_PANEL_LAYOUT);
    }
    expect(DEFAULT_ELEMENTS_PANEL_LAYOUT.openCategory).toBe("basic");
  });
});

describe("accordion value", () => {
  it("maps the open category to the accordion and back; '' = all collapsed", () => {
    expect(accordionValue({ openCategory: "flow" })).toBe("flow");
    expect(accordionValue({ openCategory: null })).toBe("");
    expect(layoutFromAccordion("callouts")).toEqual({ openCategory: "callouts" });
    expect(layoutFromAccordion("")).toEqual({ openCategory: null });
    expect(layoutFromAccordion("nonsense")).toEqual({ openCategory: null });
  });
});

describe("load / save", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
  };

  it("round-trips a layout, including all collapsed", () => {
    const storage = memory();
    saveElementsPanelLayout(storage, { openCategory: "callouts" });
    expect(loadElementsPanelLayout(storage)).toEqual({ openCategory: "callouts" });
    saveElementsPanelLayout(storage, { openCategory: null });
    expect(loadElementsPanelLayout(storage)).toEqual({ openCategory: null });
  });

  it("falls back to the default for missing, broken or unavailable storage", () => {
    expect(loadElementsPanelLayout(null)).toBe(DEFAULT_ELEMENTS_PANEL_LAYOUT);
    expect(loadElementsPanelLayout(memory())).toBe(DEFAULT_ELEMENTS_PANEL_LAYOUT);
    expect(loadElementsPanelLayout({ getItem: (key) => (key === ELEMENTS_PANEL_STORAGE_KEY ? "{oops" : null) })).toBe(
      DEFAULT_ELEMENTS_PANEL_LAYOUT,
    );
    expect(() =>
      saveElementsPanelLayout({ setItem: () => { throw new Error("quota"); } }, DEFAULT_ELEMENTS_PANEL_LAYOUT),
    ).not.toThrow();
  });
});
