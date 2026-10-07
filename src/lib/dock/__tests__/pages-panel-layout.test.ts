import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGES_PANEL_LAYOUT,
  MASTERS_RATIO_DEFAULT,
  PAGES_PANEL_STORAGE_KEY,
  PAGES_SECTION_MIN_PX,
  canResizeSections,
  loadPagesPanelLayout,
  parsePagesPanelLayout,
  resizeMastersRatio,
  savePagesPanelLayout,
  setMastersRatio,
  toggleSection,
} from "../pages-panel-layout";

describe("toggleSection / canResizeSections", () => {
  it("collapses each section on its own", () => {
    const masters = toggleSection(DEFAULT_PAGES_PANEL_LAYOUT, "masters");
    expect(masters).toMatchObject({ mastersCollapsed: true, pagesCollapsed: false });
    const both = toggleSection(masters, "pages");
    expect(both).toMatchObject({ mastersCollapsed: true, pagesCollapsed: true });
    expect(toggleSection(both, "masters")).toMatchObject({ mastersCollapsed: false, pagesCollapsed: true });
  });

  it("allows dragging only while both sections are open", () => {
    expect(canResizeSections(DEFAULT_PAGES_PANEL_LAYOUT)).toBe(true);
    expect(canResizeSections(toggleSection(DEFAULT_PAGES_PANEL_LAYOUT, "masters"))).toBe(false);
    expect(canResizeSections(toggleSection(DEFAULT_PAGES_PANEL_LAYOUT, "pages"))).toBe(false);
  });
});

describe("resizeMastersRatio", () => {
  it("moves the boundary by the pointer movement", () => {
    expect(resizeMastersRatio(0.5, 100, 1000)).toBeCloseTo(0.6);
    expect(resizeMastersRatio(0.5, -50, 1000)).toBeCloseTo(0.45);
  });

  it("keeps both sections at least the minimum height", () => {
    const min = PAGES_SECTION_MIN_PX / 1000;
    expect(resizeMastersRatio(0.5, -10_000, 1000)).toBeCloseTo(min);
    expect(resizeMastersRatio(0.5, 10_000, 1000)).toBeCloseTo(1 - min);
  });

  it("leaves the share alone when there is no room for both minimums", () => {
    expect(resizeMastersRatio(0.3, 50, 2 * PAGES_SECTION_MIN_PX - 1)).toBe(0.3);
    expect(resizeMastersRatio(0.3, 50, Number.NaN)).toBe(0.3);
  });
});

describe("setMastersRatio", () => {
  it("sets a valid share and returns the same layout otherwise", () => {
    expect(setMastersRatio(DEFAULT_PAGES_PANEL_LAYOUT, 0.6).mastersRatio).toBe(0.6);
    for (const bad of [MASTERS_RATIO_DEFAULT, 0, 1, -0.2, Number.NaN]) {
      expect(setMastersRatio(DEFAULT_PAGES_PANEL_LAYOUT, bad)).toBe(DEFAULT_PAGES_PANEL_LAYOUT);
    }
  });
});

describe("parsePagesPanelLayout", () => {
  it("keeps valid fields and replaces bad ones with defaults", () => {
    expect(parsePagesPanelLayout({ mastersCollapsed: true, pagesCollapsed: false, mastersRatio: 0.5 })).toEqual({
      mastersCollapsed: true,
      pagesCollapsed: false,
      mastersRatio: 0.5,
    });
    expect(parsePagesPanelLayout({ mastersCollapsed: "yes", mastersRatio: 3 })).toEqual(DEFAULT_PAGES_PANEL_LAYOUT);
    expect(parsePagesPanelLayout(null)).toBe(DEFAULT_PAGES_PANEL_LAYOUT);
    expect(parsePagesPanelLayout([1, 2])).toEqual(DEFAULT_PAGES_PANEL_LAYOUT);
  });
});

describe("load / save", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
  };

  it("round-trips a layout", () => {
    const storage = memory();
    const layout = { mastersCollapsed: false, pagesCollapsed: true, mastersRatio: 0.42 };
    savePagesPanelLayout(storage, layout);
    expect(loadPagesPanelLayout(storage)).toEqual(layout);
  });

  it("falls back to the default for missing, broken or unavailable storage", () => {
    expect(loadPagesPanelLayout(null)).toBe(DEFAULT_PAGES_PANEL_LAYOUT);
    expect(loadPagesPanelLayout(memory())).toBe(DEFAULT_PAGES_PANEL_LAYOUT);
    expect(loadPagesPanelLayout({ getItem: (key) => (key === PAGES_PANEL_STORAGE_KEY ? "{oops" : null) })).toBe(
      DEFAULT_PAGES_PANEL_LAYOUT,
    );
    expect(() =>
      savePagesPanelLayout({ setItem: () => { throw new Error("quota"); } }, DEFAULT_PAGES_PANEL_LAYOUT),
    ).not.toThrow();
  });
});
