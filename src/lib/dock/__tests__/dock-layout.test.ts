import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOCK_LAYOUT,
  DOCK_WIDTH,
  activatePanel,
  closePanel,
  dropMovesPanel,
  dropPanel,
  findPanel,
  insertionSlot,
  isPanelVisible,
  parseDockLayout,
  parseDockWidths,
  resizeDockWidth,
  setDockWidth,
  toggleCollapsed,
  togglePanel,
  type DockLayout,
  type DockSide,
} from "../dock-layout";
import { PANEL_IDS, getPanelLabel, isPanelId } from "../panels";

// 左：[templates* text photos] / [pages]；右：[layers]（* = 目前頁籤）
const layout: DockLayout = {
  left: [
    { panels: ["templates", "text", "photos"], active: "templates", collapsed: false },
    { panels: ["pages"], active: "pages", collapsed: true },
  ],
  right: [{ panels: ["layers"], active: "layers", collapsed: false }],
  width: { left: 300, right: 280 },
};

/** Groups of one side as tab lists. */
function tabs(dock: DockLayout, side: DockSide) {
  return dock[side].map((group) => group.panels);
}

function actives(dock: DockLayout, side: DockSide) {
  return dock[side].map((group) => group.active);
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

describe("DEFAULT_DOCK_LAYOUT", () => {
  it("shows content panels as tabs on the left, then 頁面; 屬性 and 圖層 as two groups on the right", () => {
    expect(tabs(DEFAULT_DOCK_LAYOUT, "left")).toEqual([
      ["templates", "text", "photos", "elements", "upload", "background"],
      ["pages"],
    ]);
    expect(tabs(DEFAULT_DOCK_LAYOUT, "right")).toEqual([["properties"], ["layers"]]);
    expect(actives(DEFAULT_DOCK_LAYOUT, "left")).toEqual(["templates", "pages"]);
    expect(isPanelVisible(DEFAULT_DOCK_LAYOUT, "draw")).toBe(false);
    // 預設版面本身就是合法的版面
    expect(parseDockLayout(JSON.parse(JSON.stringify(DEFAULT_DOCK_LAYOUT)))).toEqual(DEFAULT_DOCK_LAYOUT);
  });
});

describe("findPanel / isPanelVisible", () => {
  it("locates docked panels, including background tabs", () => {
    expect(findPanel(layout, "photos")).toEqual({ side: "left", group: 0, tab: 2 });
    expect(findPanel(layout, "pages")).toEqual({ side: "left", group: 1, tab: 0 });
    expect(findPanel(layout, "layers")).toEqual({ side: "right", group: 0, tab: 0 });
    expect(findPanel(layout, "draw")).toBeNull();
    expect(isPanelVisible(layout, "text")).toBe(true);
    expect(isPanelVisible(layout, "draw")).toBe(false);
  });
});

describe("closePanel", () => {
  it("removes a background tab and keeps the shown tab", () => {
    const next = closePanel(layout, "text");
    expect(tabs(next, "left")[0]).toEqual(["templates", "photos"]);
    expect(next.left[0].active).toBe("templates");
    expect(next.left[1]).toBe(layout.left[1]);
    expect(next.right).toBe(layout.right);
  });

  it("shows the next tab when the shown tab closes, or the previous one at the end", () => {
    expect(closePanel(layout, "templates").left[0].active).toBe("text");
    const lastShown = activatePanel(layout, "photos");
    expect(closePanel(lastShown, "photos").left[0].active).toBe("text");
  });

  it("removes a group when its last tab closes", () => {
    expect(tabs(closePanel(layout, "pages"), "left")).toEqual([["templates", "text", "photos"]]);
    expect(closePanel(layout, "layers").right).toEqual([]);
  });

  it("returns the same reference when the panel is already closed", () => {
    expect(closePanel(layout, "draw")).toBe(layout);
  });
});

describe("togglePanel", () => {
  it("opens a closed panel as the shown tab at the end of the first group on its default side", () => {
    const next = togglePanel(layout, "draw");
    expect(tabs(next, "left")).toEqual([["templates", "text", "photos", "draw"], ["pages"]]);
    expect(next.left[0].active).toBe("draw");
    expect(tabs(togglePanel(layout, "properties"), "right")).toEqual([["layers", "properties"]]);
  });

  it("creates a group when the default side is empty", () => {
    const empty: DockLayout = { ...layout, right: [] };
    expect(togglePanel(empty, "properties").right).toEqual([
      { panels: ["properties"], active: "properties", collapsed: false },
    ]);
  });

  it("closes an open panel wherever it is docked", () => {
    expect(isPanelVisible(togglePanel(layout, "text"), "text")).toBe(false);
    expect(isPanelVisible(togglePanel(layout, "layers"), "layers")).toBe(false);
  });
});

describe("activatePanel", () => {
  it("shows a background tab", () => {
    const next = activatePanel(layout, "photos");
    expect(next.left[0]).toEqual({ ...layout.left[0], active: "photos" });
    expect(next.left[1]).toBe(layout.left[1]);
  });

  it("returns the same reference when already shown or closed", () => {
    expect(activatePanel(layout, "templates")).toBe(layout);
    expect(activatePanel(layout, "draw")).toBe(layout);
  });
});

describe("toggleCollapsed", () => {
  it("flips the group that contains the panel", () => {
    const next = toggleCollapsed(layout, "text");
    expect(next.left.map((group) => group.collapsed)).toEqual([true, true]);
    expect(toggleCollapsed(layout, "pages").left[1].collapsed).toBe(false);
    expect(next.right).toBe(layout.right);
  });

  it("returns the same reference for a closed panel", () => {
    expect(toggleCollapsed(layout, "draw")).toBe(layout);
  });
});

describe("dropPanel into a tab bar", () => {
  it("reorders tabs within a group (slots count the dragged tab) and shows it", () => {
    // [templates text photos]：把 templates 拖到 text 與 photos 之間（slot 2）
    const next = dropPanel(layout, "templates", { side: "left", kind: "tab", group: 0, slot: 2 });
    expect(tabs(next, "left")[0]).toEqual(["text", "templates", "photos"]);
    expect(next.left[0].active).toBe("templates");
    expect(tabs(dropPanel(layout, "photos", { side: "left", kind: "tab", group: 0, slot: 0 }), "left")[0]).toEqual([
      "photos",
      "templates",
      "text",
    ]);
  });

  it("only shows the tab when dropped right before or after itself", () => {
    expect(dropPanel(layout, "templates", { side: "left", kind: "tab", group: 0, slot: 1 })).toBe(layout);
    const next = dropPanel(layout, "text", { side: "left", kind: "tab", group: 0, slot: 2 });
    expect(tabs(next, "left")).toEqual(tabs(layout, "left"));
    expect(next.left[0].active).toBe("text");
  });

  it("merges into another group at the slot and shows it there", () => {
    const next = dropPanel(layout, "text", { side: "right", kind: "tab", group: 0, slot: 0 });
    expect(tabs(next, "right")).toEqual([["text", "layers"]]);
    expect(next.right[0].active).toBe("text");
    expect(tabs(next, "left")[0]).toEqual(["templates", "photos"]);
  });

  it("adjusts the target group index when the source group disappears before it", () => {
    // 左側 [pages] 只有一個頁籤：拖進右側不影響 index；改成拖進同側後面的組
    const base: DockLayout = {
      ...layout,
      left: [
        { panels: ["pages"], active: "pages", collapsed: false },
        { panels: ["templates", "text"], active: "templates", collapsed: false },
      ],
    };
    const next = dropPanel(base, "pages", { side: "left", kind: "tab", group: 1, slot: 2 });
    expect(tabs(next, "left")).toEqual([["templates", "text", "pages"]]);
    expect(next.left[0].active).toBe("pages");
  });

  it("keeps the target group's collapsed state", () => {
    const next = dropPanel(layout, "text", { side: "left", kind: "tab", group: 1, slot: 1 });
    expect(next.left[1]).toEqual({ panels: ["pages", "text"], active: "text", collapsed: true });
  });

  it("opens a closed panel in the tab bar", () => {
    const next = dropPanel(layout, "draw", { side: "right", kind: "tab", group: 0, slot: 1 });
    expect(tabs(next, "right")).toEqual([["layers", "draw"]]);
  });

  it("returns the same reference for a group that does not exist", () => {
    expect(dropPanel(layout, "text", { side: "right", kind: "tab", group: 5, slot: 0 })).toBe(layout);
  });
});

describe("dropPanel as a new group", () => {
  it("splits a tab out into a new group at the slot", () => {
    const next = dropPanel(layout, "text", { side: "left", kind: "group", slot: 1 });
    expect(tabs(next, "left")).toEqual([["templates", "photos"], ["text"], ["pages"]]);
    expect(next.left[1]).toEqual({ panels: ["text"], active: "text", collapsed: false });
  });

  it("moves a single-tab group, counting the dragged group in the slots", () => {
    // 左 [A] [pages]：把 pages 拖到最上面（slot 0）
    expect(tabs(dropPanel(layout, "pages", { side: "left", kind: "group", slot: 0 }), "left")).toEqual([
      ["pages"],
      ["templates", "text", "photos"],
    ]);
    const three: DockLayout = { ...layout, left: [...layout.left, { panels: ["draw"], active: "draw", collapsed: false }] };
    // [A] [pages] [draw]：把 pages 拖到最下面（slot 3）
    expect(tabs(dropPanel(three, "pages", { side: "left", kind: "group", slot: 3 }), "left")).toEqual([
      ["templates", "text", "photos"],
      ["draw"],
      ["pages"],
    ]);
  });

  it("returns the same reference when a single-tab group is dropped right above or below itself", () => {
    expect(dropPanel(layout, "pages", { side: "left", kind: "group", slot: 1 })).toBe(layout);
    expect(dropPanel(layout, "pages", { side: "left", kind: "group", slot: 2 })).toBe(layout);
  });

  it("moves to the other side and clamps the slot", () => {
    const next = dropPanel(layout, "pages", { side: "right", kind: "group", slot: 99 });
    expect(tabs(next, "right")).toEqual([["layers"], ["pages"]]);
    expect(tabs(next, "left")).toEqual([["templates", "text", "photos"]]);
    expect(tabs(dropPanel(layout, "text", { side: "right", kind: "group", slot: -3 }), "right")).toEqual([
      ["text"],
      ["layers"],
    ]);
  });

  it("opens a closed panel as a new group", () => {
    expect(tabs(dropPanel(layout, "draw", { side: "right", kind: "group", slot: 0 }), "right")).toEqual([
      ["draw"],
      ["layers"],
    ]);
  });
});

describe("dropMovesPanel", () => {
  it("is false when the tab would stay where it is (even if it only becomes shown)", () => {
    expect(dropMovesPanel(layout, "text", { side: "left", kind: "tab", group: 0, slot: 1 })).toBe(false);
    expect(dropMovesPanel(layout, "text", { side: "left", kind: "tab", group: 0, slot: 2 })).toBe(false);
    expect(dropMovesPanel(layout, "pages", { side: "left", kind: "group", slot: 2 })).toBe(false);
    expect(dropMovesPanel(layout, "pages", { side: "left", kind: "tab", group: 1, slot: 0 })).toBe(false);
  });

  it("is true when the tab order or grouping changes", () => {
    expect(dropMovesPanel(layout, "text", { side: "left", kind: "tab", group: 0, slot: 0 })).toBe(true);
    expect(dropMovesPanel(layout, "text", { side: "left", kind: "tab", group: 1, slot: 0 })).toBe(true);
    expect(dropMovesPanel(layout, "text", { side: "left", kind: "group", slot: 0 })).toBe(true);
    expect(dropMovesPanel(layout, "draw", { side: "right", kind: "group", slot: 0 })).toBe(true);
  });
});

describe("insertionSlot", () => {
  it("counts the item centers before the pointer", () => {
    expect(insertionSlot([100, 300, 500], 50)).toBe(0);
    expect(insertionSlot([100, 300, 500], 301)).toBe(2);
    expect(insertionSlot([100, 300, 500], 900)).toBe(3);
    expect(insertionSlot([], 10)).toBe(0);
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

  it("drops unknown and duplicate panels and empty groups, and repairs fields", () => {
    const parsed = parseDockLayout({
      left: [
        { panels: ["text", "nope", "text"], active: "nope", collapsed: "yes" },
        { panels: ["nope"] },
        { id: "layers" },
        "layers",
      ],
      right: [{ panels: ["text", "layers", "photos"], active: "photos", collapsed: true }],
      width: { left: "wide", right: 10_000 },
    });
    expect(parsed).toEqual({
      left: [{ panels: ["text"], active: "text", collapsed: false }],
      right: [{ panels: ["layers", "photos"], active: "photos", collapsed: true }],
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

  it("drops v2 panel entries (no panels array) but keeps the widths", () => {
    expect(parseDockLayout({ left: [{ id: "text", collapsed: false }], right: [], width: { left: 250, right: 300 } })).toEqual({
      left: [],
      right: [],
      width: { left: 250, right: 300 },
    });
    expect(parseDockWidths({ width: { left: 250 } })).toEqual({ left: 250, right: DOCK_WIDTH.default });
    expect(parseDockWidths(null)).toEqual({ left: DOCK_WIDTH.default, right: DOCK_WIDTH.default });
  });
});
