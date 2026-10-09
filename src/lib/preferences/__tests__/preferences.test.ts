import { describe, expect, it } from "vitest";
import { colorAlpha, findPaletteColor } from "@/lib/editor/palette";
import {
  DEFAULT_PREFERENCES,
  FACTORY_LINE_STYLES,
  GRID_SPACING,
  GUIDE_LINE_WIDTH,
  clampGuideLineWidth,
  defaultLineStyles,
  parsePreferences,
  sameLineStyles,
  type GuideLineStyles,
  type Preferences,
} from "../preferences";
import { loadPreferences, PREFERENCES_STORAGE_KEY, savePreferences } from "../preferences-storage";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const customStyles: GuideLineStyles = {
  grid: { color: "#ff000080", dash: "dotted", width: 2 },
  contentGuides: { color: "#00ff00", dash: "solid", width: 0.5 },
  margins: { color: "#0000ff", dash: "dashed", width: 4 },
};

const custom: Preferences = {
  grid: { visible: true, spacing: 20, snap: true },
  // 和格線不同，確認是獨立的欄位
  showContentGuides: false,
  showMargins: false,
  showPageNumbers: false,
  pageView: "spread",
  showRulers: false,
  lineStyles: customStyles,
  lineStyleDefaults: { ...customStyles, margins: { color: "#000000", dash: "solid", width: 1 } },
  mcpEnabled: true,
};

describe("parsePreferences", () => {
  it("returns the defaults for non-objects", () => {
    expect(parsePreferences(null)).toBe(DEFAULT_PREFERENCES);
    expect(parsePreferences("grid")).toBe(DEFAULT_PREFERENCES);
    expect(parsePreferences([])).toBe(DEFAULT_PREFERENCES);
  });

  it("keeps valid fields", () => {
    expect(parsePreferences(custom)).toEqual(custom);
  });

  it("replaces only the broken fields with defaults", () => {
    const parsed = parsePreferences({ grid: { visible: "yes", spacing: "10", snap: true }, showMargins: false });
    expect(parsed).toEqual({
      grid: { visible: false, spacing: GRID_SPACING.default, snap: true },
      showContentGuides: false,
      showMargins: false,
      // 舊的紀錄沒有這個欄位：回到預設（顯示）
      showPageNumbers: true,
      pageView: "single",
      showRulers: true,
      lineStyles: FACTORY_LINE_STYLES,
      lineStyleDefaults: null,
      mcpEnabled: false,
    });
    expect(parsePreferences({ showPageNumbers: "no" }).showPageNumbers).toBe(true);
    expect(parsePreferences({ showPageNumbers: false }).showPageNumbers).toBe(false);
    expect(parsePreferences({ grid: 3 }).grid).toEqual(DEFAULT_PREFERENCES.grid);
  });

  it("keeps MCP off unless it was explicitly turned on", () => {
    expect(DEFAULT_PREFERENCES.mcpEnabled).toBe(false);
    expect(parsePreferences({}).mcpEnabled).toBe(false);
    expect(parsePreferences({ mcpEnabled: "true" }).mcpEnabled).toBe(false);
    expect(parsePreferences({ mcpEnabled: 1 }).mcpEnabled).toBe(false);
    expect(parsePreferences({ mcpEnabled: true }).mcpEnabled).toBe(true);
  });

  it("reads the page view, falling back to single", () => {
    expect(parsePreferences({ pageView: "spread" }).pageView).toBe("spread");
    expect(parsePreferences({ pageView: "single" }).pageView).toBe("single");
    expect(parsePreferences({ pageView: "double" }).pageView).toBe("single");
    expect(parsePreferences({}).pageView).toBe("single");
  });

  it("shows the rulers unless turned off", () => {
    // 舊的紀錄沒有這個欄位：預設顯示
    expect(parsePreferences({}).showRulers).toBe(true);
    expect(parsePreferences({ showRulers: "off" }).showRulers).toBe(true);
    expect(parsePreferences({ showRulers: false }).showRulers).toBe(false);
  });

  it("shows the content guides like the grid when an old record has no such field", () => {
    expect(parsePreferences({ grid: { visible: true } }).showContentGuides).toBe(true);
    expect(parsePreferences({ grid: { visible: false } }).showContentGuides).toBe(false);
    expect(parsePreferences({}).showContentGuides).toBe(false);
    // 之後兩者獨立
    expect(parsePreferences({ grid: { visible: true }, showContentGuides: false }).showContentGuides).toBe(false);
    expect(parsePreferences({ grid: { visible: false }, showContentGuides: true }).showContentGuides).toBe(true);
  });

  it("uses the factory line styles for old records, and the factory look is the old hard-coded one", () => {
    expect(parsePreferences({}).lineStyles).toEqual(FACTORY_LINE_STYLES);
    expect(parsePreferences({}).lineStyleDefaults).toBeNull();
    expect(DEFAULT_PREFERENCES.lineStyles).toBe(FACTORY_LINE_STYLES);
    // 透明度和原本的常數相同（格線 0.45、對齊線 1/2 線 0.85、邊界不透明）
    expect(colorAlpha(FACTORY_LINE_STYLES.grid.color)).toBeCloseTo(0.45, 2);
    expect(colorAlpha(FACTORY_LINE_STYLES.contentGuides.color)).toBeCloseTo(0.85, 2);
    expect(colorAlpha(FACTORY_LINE_STYLES.margins.color)).toBe(1);
    // 顏色在色票上（調色板才標得出位置）
    expect(findPaletteColor(FACTORY_LINE_STYLES.grid.color)).toEqual({ kind: "shade", family: "slate", step: 400 });
    expect(findPaletteColor(FACTORY_LINE_STYLES.contentGuides.color)).toEqual({ kind: "shade", family: "indigo", step: 500 });
    expect(findPaletteColor(FACTORY_LINE_STYLES.margins.color)).toEqual({ kind: "shade", family: "pink", step: 500 });
    for (const style of Object.values(FACTORY_LINE_STYLES)) expect(style).toMatchObject({ dash: "dashed", width: 1 });
  });

  it("replaces only the broken parts of a line style", () => {
    const parsed = parsePreferences({
      lineStyles: {
        grid: { color: "red", dash: "wavy", width: 2 },
        contentGuides: { color: "#123456", dash: "dotted", width: "3" },
        margins: 7,
      },
    }).lineStyles;
    expect(parsed.grid).toEqual({ ...FACTORY_LINE_STYLES.grid, width: 2 });
    expect(parsed.contentGuides).toEqual({ ...FACTORY_LINE_STYLES.contentGuides, color: "#123456", dash: "dotted" });
    expect(parsed.margins).toEqual(FACTORY_LINE_STYLES.margins);
  });

  it("reads saved defaults only when they are an object", () => {
    expect(parsePreferences({ lineStyleDefaults: "x" }).lineStyleDefaults).toBeNull();
    expect(parsePreferences({ lineStyleDefaults: {} }).lineStyleDefaults).toEqual(FACTORY_LINE_STYLES);
    expect(parsePreferences({ lineStyleDefaults: { margins: { width: 3 } } }).lineStyleDefaults?.margins.width).toBe(3);
  });

  it("clamps line widths into 0.5–4 px and rounds them to 0.5", () => {
    expect(clampGuideLineWidth(0)).toBe(GUIDE_LINE_WIDTH.min);
    expect(clampGuideLineWidth(10)).toBe(GUIDE_LINE_WIDTH.max);
    expect(clampGuideLineWidth(1.3)).toBe(1.5);
    expect(clampGuideLineWidth(1.2)).toBe(1);
    expect(parsePreferences({ lineStyles: { grid: { width: 9 } } }).lineStyles.grid.width).toBe(4);
    expect(parsePreferences({ lineStyles: { grid: { width: Number.NaN } } }).lineStyles.grid.width).toBe(1);
  });

  it("clamps the grid spacing into range", () => {
    expect(parsePreferences({ grid: { spacing: 0 } }).grid.spacing).toBe(GRID_SPACING.min);
    expect(parsePreferences({ grid: { spacing: 1e9 } }).grid.spacing).toBe(GRID_SPACING.max);
    expect(parsePreferences({ grid: { spacing: Number.NaN } }).grid.spacing).toBe(GRID_SPACING.default);
  });
});

describe("line style defaults", () => {
  it("goes back to my defaults, or the factory styles when none were saved", () => {
    expect(defaultLineStyles(DEFAULT_PREFERENCES)).toBe(FACTORY_LINE_STYLES);
    expect(defaultLineStyles(custom)).toBe(custom.lineStyleDefaults);
  });

  it("compares styles by value", () => {
    expect(sameLineStyles(FACTORY_LINE_STYLES, structuredClone(FACTORY_LINE_STYLES))).toBe(true);
    expect(sameLineStyles(FACTORY_LINE_STYLES, null)).toBe(false);
    expect(sameLineStyles(customStyles, { ...customStyles, margins: { ...customStyles.margins, width: 3.5 } })).toBe(false);
    expect(sameLineStyles(customStyles, { ...customStyles, grid: { ...customStyles.grid, dash: "solid" } })).toBe(false);
    expect(sameLineStyles(customStyles, { ...customStyles, contentGuides: { ...customStyles.contentGuides, color: "#00ff0080" } })).toBe(false);
  });
});

describe("preferences storage", () => {
  it("round-trips preferences", () => {
    const storage = memoryStorage();
    savePreferences(storage, custom);

    expect(storage.data.has(PREFERENCES_STORAGE_KEY)).toBe(true);
    expect(loadPreferences(storage)).toEqual(custom);
  });

  it("returns the defaults when nothing is saved, storage is unavailable or the JSON is corrupted", () => {
    expect(loadPreferences(memoryStorage())).toBe(DEFAULT_PREFERENCES);
    expect(loadPreferences(null)).toBe(DEFAULT_PREFERENCES);
    expect(loadPreferences(memoryStorage({ [PREFERENCES_STORAGE_KEY]: "{not json" }))).toBe(DEFAULT_PREFERENCES);
  });

  it("ignores storage that throws", () => {
    const broken = {
      getItem: (): string | null => {
        throw new Error("SecurityError");
      },
      setItem: (): void => {
        throw new Error("QuotaExceededError");
      },
    };

    expect(loadPreferences(broken)).toBe(DEFAULT_PREFERENCES);
    expect(() => savePreferences(broken, custom)).not.toThrow();
  });
});
