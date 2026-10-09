import { describe, expect, it } from "vitest";
import { DEFAULT_DOCK_LAYOUT, type DockLayout } from "../dock-layout";
import { DOCK_LAYOUT_STORAGE_KEY, OLDER_DOCK_LAYOUT_STORAGE_KEYS, loadDockLayout, saveDockLayout } from "../dock-storage";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const layout: DockLayout = {
  left: [],
  right: [{ panels: ["layers", "text"], active: "text", collapsed: true }],
  width: { left: 320, right: 400 },
};

const [V2_KEY, V1_KEY] = OLDER_DOCK_LAYOUT_STORAGE_KEYS;

describe("dock layout storage", () => {
  it("round-trips a layout", () => {
    const storage = memoryStorage();
    saveDockLayout(storage, layout);

    expect(storage.data.has(DOCK_LAYOUT_STORAGE_KEY)).toBe(true);
    expect(loadDockLayout(storage)).toEqual(layout);
  });

  it("returns the default when nothing is saved or storage is unavailable", () => {
    expect(loadDockLayout(memoryStorage())).toBe(DEFAULT_DOCK_LAYOUT);
    expect(loadDockLayout(null)).toBe(DEFAULT_DOCK_LAYOUT);
  });

  it("returns the default for corrupted JSON", () => {
    expect(loadDockLayout(memoryStorage({ [DOCK_LAYOUT_STORAGE_KEY]: "{not json" }))).toBe(DEFAULT_DOCK_LAYOUT);
  });

  it("repairs saved data through parseDockLayout", () => {
    const saved = JSON.stringify({ left: [{ panels: ["nope", "draw"] }], right: [], width: { left: 1, right: 300 } });
    expect(loadDockLayout(memoryStorage({ [DOCK_LAYOUT_STORAGE_KEY]: saved }))).toEqual({
      left: [{ panels: ["draw"], active: "draw", collapsed: false }],
      right: [],
      width: { left: 200, right: 300 },
    });
  });

  it("replaces a v2 / v1 layout with the default groups, keeping only the widths", () => {
    const v2 = JSON.stringify({ left: [{ id: "text" }], right: [{ id: "layers", collapsed: true }], width: { left: 260, right: 410 } });
    const fromV2 = loadDockLayout(memoryStorage({ [V2_KEY]: v2 }));
    expect(fromV2).toEqual({ ...DEFAULT_DOCK_LAYOUT, width: { left: 260, right: 410 } });

    const v1 = JSON.stringify({ left: [], right: [], width: { left: 240, right: 300 } });
    expect(loadDockLayout(memoryStorage({ [V1_KEY]: v1 })).width).toEqual({ left: 240, right: 300 });
    // 兩個都有時以較新的 v2 為準
    expect(loadDockLayout(memoryStorage({ [V1_KEY]: v1, [V2_KEY]: v2 })).width).toEqual({ left: 260, right: 410 });
  });

  it("prefers a v3 layout over older ones", () => {
    const storage = memoryStorage({ [V2_KEY]: JSON.stringify({ width: { left: 500, right: 500 } }) });
    saveDockLayout(storage, layout);
    expect(loadDockLayout(storage)).toEqual(layout);
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

    expect(loadDockLayout(broken)).toBe(DEFAULT_DOCK_LAYOUT);
    expect(() => saveDockLayout(broken, layout)).not.toThrow();
  });
});
