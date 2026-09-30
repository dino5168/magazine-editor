import { describe, expect, it } from "vitest";
import { DEFAULT_DOCK_LAYOUT, type DockLayout } from "../dock-layout";
import { DOCK_LAYOUT_STORAGE_KEY, loadDockLayout, saveDockLayout } from "../dock-storage";

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
  right: [
    { id: "layers", collapsed: true },
    { id: "text", collapsed: false },
  ],
  width: { left: 320, right: 400 },
};

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
    const saved = JSON.stringify({ left: [{ id: "nope" }, { id: "draw" }], right: [], width: { left: 1, right: 300 } });
    expect(loadDockLayout(memoryStorage({ [DOCK_LAYOUT_STORAGE_KEY]: saved }))).toEqual({
      left: [{ id: "draw", collapsed: false }],
      right: [],
      width: { left: 200, right: 300 },
    });
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
