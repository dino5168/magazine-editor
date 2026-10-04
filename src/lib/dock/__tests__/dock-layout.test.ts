import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOCK_LAYOUT,
  DOCK_WIDTH,
  closePanel,
  dropPanel,
  findPanel,
  insertionSlot,
  isPanelVisible,
  movePanel,
  parseDockLayout,
  resizeDockWidth,
  setDockWidth,
  toggleCollapsed,
  togglePanel,
  type DockLayout,
} from "../dock-layout";
import { PANEL_IDS, getPanelLabel, isPanelId } from "../panels";

const layout: DockLayout = {
  left: [
    { id: "templates", collapsed: false },
    { id: "text", collapsed: true },
    { id: "photos", collapsed: false },
  ],
  right: [{ id: "layers", collapsed: false }],
  width: { left: 300, right: 280 },
};

function ids(dock: DockLayout, side: "left" | "right") {
  return dock[side].map((panel) => panel.id);
}

describe("panels", () => {
  it("has unique ids and labels", () => {
    expect(new Set(PANEL_IDS).size).toBe(PANEL_IDS.length);
    expect(getPanelLabel("layers")).toBe("圖層");
  });

  it("recognizes panel ids", () => {
    expect(isPanelId("text")).toBe(true);
    expect(isPanelId("unknown")).toBe(false);
    expect(isPanelId(1)).toBe(false);
  });
});

describe("findPanel / isPanelVisible", () => {
  it("locates docked panels", () => {
    expect(findPanel(layout, "text")).toEqual({ side: "left", index: 1 });
    expect(findPanel(layout, "layers")).toEqual({ side: "right", index: 0 });
    expect(findPanel(layout, "draw")).toBeNull();
    expect(isPanelVisible(layout, "draw")).toBe(false);
  });
});

describe("togglePanel / closePanel", () => {
  it("opens a closed panel at the bottom of its default side", () => {
    expect(ids(togglePanel(layout, "draw"), "left")).toEqual(["templates", "text", "photos", "draw"]);
    expect(ids(togglePanel(layout, "properties"), "right")).toEqual(["layers", "properties"]);
  });

  it("closes an open panel wherever it is docked", () => {
    const moved = movePanel(layout, "layers", "left", 0);
    expect(isPanelVisible(togglePanel(moved, "layers"), "layers")).toBe(false);
  });

  it("returns the same reference when closing a closed panel", () => {
    expect(closePanel(layout, "draw")).toBe(layout);
  });
});

describe("movePanel", () => {
  it("reorders within a side", () => {
    expect(ids(movePanel(layout, "photos", "left", 0), "left")).toEqual(["photos", "templates", "text"]);
    expect(ids(movePanel(layout, "templates", "left", 2), "left")).toEqual(["text", "photos", "templates"]);
  });

  it("moves across sides and keeps the collapsed state", () => {
    const moved = movePanel(layout, "text", "right", 1);
    expect(ids(moved, "left")).toEqual(["templates", "photos"]);
    expect(moved.right).toEqual([
      { id: "layers", collapsed: false },
      { id: "text", collapsed: true },
    ]);
  });

  it("clamps the target index", () => {
    expect(ids(movePanel(layout, "layers", "left", 99), "left")).toEqual(["templates", "text", "photos", "layers"]);
    expect(ids(movePanel(layout, "layers", "left", -5), "left")).toEqual(["layers", "templates", "text", "photos"]);
  });

  it("opens a closed panel at the target position", () => {
    expect(ids(movePanel(layout, "draw", "right", 0), "right")).toEqual(["draw", "layers"]);
  });

  it("returns the same reference when the position does not change", () => {
    expect(movePanel(layout, "text", "left", 1)).toBe(layout);
    expect(movePanel(layout, "photos", "left", 99)).toBe(layout);
  });
});

describe("dropPanel", () => {
  it("counts the dragged panel when dropping on its own side", () => {
    // 左側 [templates, text, photos]：把 templates 拖到 text 與 photos 之間（slot 2）
    expect(ids(dropPanel(layout, "templates", { side: "left", slot: 2 }), "left")).toEqual([
      "text",
      "templates",
      "photos",
    ]);
    expect(ids(dropPanel(layout, "photos", { side: "left", slot: 0 }), "left")).toEqual([
      "photos",
      "templates",
      "text",
    ]);
  });

  it("returns the same reference when dropped right above or below itself", () => {
    expect(dropPanel(layout, "text", { side: "left", slot: 1 })).toBe(layout);
    expect(dropPanel(layout, "text", { side: "left", slot: 2 })).toBe(layout);
  });

  it("inserts at the slot on the other side", () => {
    expect(ids(dropPanel(layout, "text", { side: "right", slot: 0 }), "right")).toEqual(["text", "layers"]);
    expect(ids(dropPanel(layout, "text", { side: "right", slot: 1 }), "right")).toEqual(["layers", "text"]);
  });
});

describe("insertionSlot", () => {
  it("counts the panel centers above the pointer", () => {
    expect(insertionSlot([100, 300, 500], 50)).toBe(0);
    expect(insertionSlot([100, 300, 500], 301)).toBe(2);
    expect(insertionSlot([100, 300, 500], 900)).toBe(3);
    expect(insertionSlot([], 10)).toBe(0);
  });
});

describe("toggleCollapsed", () => {
  it("flips only the target panel", () => {
    const next = toggleCollapsed(layout, "text");
    expect(next.left.map((panel) => panel.collapsed)).toEqual([false, false, false]);
    expect(next.right).toBe(layout.right);
  });

  it("returns the same reference for a closed panel", () => {
    expect(toggleCollapsed(layout, "draw")).toBe(layout);
  });
});

describe("setDockWidth", () => {
  it("clamps and rounds the width", () => {
    expect(setDockWidth(layout, "left", 10).width.left).toBe(DOCK_WIDTH.min);
    expect(setDockWidth(layout, "left", 9999).width.left).toBe(DOCK_WIDTH.max);
    expect(setDockWidth(layout, "right", 333.6).width).toEqual({ left: 300, right: 334 });
  });

  it("returns the same reference when the width does not change", () => {
    expect(setDockWidth(layout, "left", 300.2)).toBe(layout);
  });
});

describe("resizeDockWidth", () => {
  it("widens the left dock when dragging right and the right dock when dragging left", () => {
    expect(resizeDockWidth(300, 40, "left", 1000)).toBe(340);
    expect(resizeDockWidth(300, 40, "right", 1000)).toBe(260);
    expect(resizeDockWidth(300, -40, "right", 1000)).toBe(340);
  });

  it("stops growing when the canvas reaches its minimum width", () => {
    expect(resizeDockWidth(300, 200, "left", 50)).toBe(350);
    expect(resizeDockWidth(300, -200, "right", 50)).toBe(350);
  });

  it("still allows shrinking when there is no room to grow", () => {
    expect(resizeDockWidth(300, 40, "left", -80)).toBe(300);
    expect(resizeDockWidth(300, -40, "left", -80)).toBe(260);
  });

  it("clamps to the dock width limits", () => {
    expect(resizeDockWidth(300, -500, "left", 1000)).toBe(DOCK_WIDTH.min);
    expect(resizeDockWidth(300, 500, "left", 1000)).toBe(DOCK_WIDTH.max);
  });
});

describe("parseDockLayout", () => {
  it("round-trips a valid layout through JSON", () => {
    expect(parseDockLayout(JSON.parse(JSON.stringify(layout)))).toEqual(layout);
  });

  it("falls back to the default for non-layout values", () => {
    expect(parseDockLayout(null)).toBe(DEFAULT_DOCK_LAYOUT);
    expect(parseDockLayout("left")).toBe(DEFAULT_DOCK_LAYOUT);
    expect(parseDockLayout([])).toBe(DEFAULT_DOCK_LAYOUT);
  });

  it("drops unknown and duplicate panels and repairs fields", () => {
    const parsed = parseDockLayout({
      left: [{ id: "text", collapsed: "yes" }, { id: "nope" }, "layers", { id: "text" }],
      right: [{ id: "text" }, { id: "layers", collapsed: true }],
      width: { left: "wide", right: 10_000 },
    });
    expect(parsed).toEqual({
      left: [{ id: "text", collapsed: false }],
      right: [{ id: "layers", collapsed: true }],
      width: { left: DOCK_WIDTH.default, right: DOCK_WIDTH.max },
    });
  });

  it("treats missing sides and widths as empty / default", () => {
    expect(parseDockLayout({})).toEqual({
      left: [],
      right: [],
      width: { left: DOCK_WIDTH.default, right: DOCK_WIDTH.default },
    });
  });
});
