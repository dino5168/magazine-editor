import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, GRID_SPACING, parsePreferences, type Preferences } from "../preferences";
import { loadPreferences, PREFERENCES_STORAGE_KEY, savePreferences } from "../preferences-storage";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const custom: Preferences = {
  grid: { visible: true, spacing: 20, snap: true },
  showMargins: false,
  showPageNumbers: false,
  pageView: "spread",
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
      showMargins: false,
      // 舊的紀錄沒有這個欄位：回到預設（顯示）
      showPageNumbers: true,
      pageView: "single",
    });
    expect(parsePreferences({ showPageNumbers: "no" }).showPageNumbers).toBe(true);
    expect(parsePreferences({ showPageNumbers: false }).showPageNumbers).toBe(false);
    expect(parsePreferences({ grid: 3 }).grid).toEqual(DEFAULT_PREFERENCES.grid);
  });

  it("reads the page view, falling back to single", () => {
    expect(parsePreferences({ pageView: "spread" }).pageView).toBe("spread");
    expect(parsePreferences({ pageView: "single" }).pageView).toBe("single");
    expect(parsePreferences({ pageView: "double" }).pageView).toBe("single");
    expect(parsePreferences({}).pageView).toBe("single");
  });

  it("clamps the grid spacing into range", () => {
    expect(parsePreferences({ grid: { spacing: 0 } }).grid.spacing).toBe(GRID_SPACING.min);
    expect(parsePreferences({ grid: { spacing: 1e9 } }).grid.spacing).toBe(GRID_SPACING.max);
    expect(parsePreferences({ grid: { spacing: Number.NaN } }).grid.spacing).toBe(GRID_SPACING.default);
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
