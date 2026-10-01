import { describe, expect, it } from "vitest";
import { DEFAULT_DOCK_LAYOUT, type DockLayout } from "../dock-layout";
import { DOCK_LAYOUT_STORAGE_KEY, DOCK_LAYOUT_STORAGE_KEY_V1, loadDockLayout, saveDockLayout } from "../dock-storage";

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

  it("keeps a v1 layout and opens the property panel at the top right once", () => {
    const v1 = JSON.stringify({ left: [{ id: "text" }], right: [{ id: "layers", collapsed: true }], width: { left: 300, right: 300 } });
    const loaded = loadDockLayout(memoryStorage({ [DOCK_LAYOUT_STORAGE_KEY_V1]: v1 }));
    expect(loaded.left).toEqual([{ id: "text", collapsed: false }]);
    expect(loaded.right).toEqual([
      { id: "properties", collapsed: false },
      { id: "layers", collapsed: true },
    ]);

    // v2 已經存在時以 v2 為準（使用者之後關掉屬性面板，不會再被打開）
    const v2 = JSON.stringify({ left: [], right: [{ id: "layers" }], width: { left: 300, right: 300 } });
    const both = memoryStorage({ [DOCK_LAYOUT_STORAGE_KEY_V1]: v1, [DOCK_LAYOUT_STORAGE_KEY]: v2 });
    expect(loadDockLayout(both).right).toEqual([{ id: "layers", collapsed: false }]);
  });

  it("does not move a property panel that a v1 layout already has", () => {
    const v1 = JSON.stringify({ left: [{ id: "properties" }], right: [], width: { left: 300, right: 300 } });
    const loaded = loadDockLayout(memoryStorage({ [DOCK_LAYOUT_STORAGE_KEY_V1]: v1 }));
    expect(loaded.left).toEqual([{ id: "properties", collapsed: false }]);
    expect(loaded.right).toEqual([]);
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
