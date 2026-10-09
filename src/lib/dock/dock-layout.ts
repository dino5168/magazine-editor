import { getPanelDefaultSide, isPanelId, type PanelId } from "./panels";

export type DockSide = "left" | "right";

export const DOCK_SIDES: readonly DockSide[] = ["left", "right"];

/**
 * Panels shown as tabs in one block of a dock (Affinity-style panel group).
 * Never empty; `active` is always one of `panels`.
 */
export interface DockGroup {
  /** Tab order, left to right. */
  readonly panels: readonly PanelId[];
  /** Tab whose content is shown. */
  readonly active: PanelId;
  /** Only the tab bar is shown when collapsed. */
  readonly collapsed: boolean;
}

/**
 * Tool panel arrangement: panel groups on each side (top to bottom) and each dock's width.
 * App preference, not document content: it is neither in the undo history nor in the project file.
 * A panel appears at most once in the whole layout.
 */
export interface DockLayout {
  readonly left: readonly DockGroup[];
  readonly right: readonly DockGroup[];
  /** Dock widths in CSS px (screen space, independent of zoom). */
  readonly width: { readonly left: number; readonly right: number };
}

export interface PanelLocation {
  readonly side: DockSide;
  /** Group index within the side, top to bottom. */
  readonly group: number;
  /** Tab index within the group, left to right. */
  readonly tab: number;
}

/**
 * Where a dragged panel would be dropped. Slots count items as currently shown
 * (including the dragged panel itself), which is what the user sees while dragging.
 */
export type DropTarget =
  /** Into a group's tab bar, before its `slot`-th tab (merge, or reorder within the group). */
  | { readonly side: DockSide; readonly kind: "tab"; readonly group: number; readonly slot: number }
  /** As a new group before the side's `slot`-th group (0 = top, length = bottom). */
  | { readonly side: DockSide; readonly kind: "group"; readonly slot: number };

/** Dock width limits in CSS px. */
export const DOCK_WIDTH = { min: 200, max: 560, default: 320 } as const;

/** Width change per arrow key press on a size control bar, in CSS px. */
export const DOCK_WIDTH_STEP = 16;

/**
 * The canvas column never gets narrower than this when a dock is widened, in CSS px.
 * Wide enough for the system control bar (document name, undo/redo, zoom, export).
 */
export const CANVAS_MIN_WIDTH = 480;

function group(panels: readonly PanelId[], active: PanelId = panels[0]): DockGroup {
  return { panels, active, collapsed: false };
}

// 左側：上面一組放內容類面板（頁籤一開始就看得到），下面是頁面（同 Affinity 的 Pages 位置）；
// 右側：屬性與圖層各一組，可以同時看到。「繪圖」還是佔位，不放進預設
export const DEFAULT_DOCK_LAYOUT: DockLayout = {
  left: [group(["templates", "text", "photos", "elements", "upload", "background"]), group(["pages"])],
  right: [group(["properties"]), group(["layers"])],
  width: { left: DOCK_WIDTH.default, right: DOCK_WIDTH.default },
};

/**
 * Finds where a panel is docked.
 *
 * Args:
 *   layout: Dock layout.
 *   id: Panel id.
 *
 * Returns:
 *   Side, group and tab index, or null when the panel is closed.
 */
export function findPanel(layout: DockLayout, id: PanelId): PanelLocation | null {
  for (const side of DOCK_SIDES) {
    const groups = layout[side];
    for (let index = 0; index < groups.length; index++) {
      const tab = groups[index].panels.indexOf(id);
      if (tab >= 0) return { side, group: index, tab };
    }
  }
  return null;
}

/**
 * Checks whether a panel is open (in a group on either side, possibly as a background tab).
 *
 * Args:
 *   layout: Dock layout.
 *   id: Panel id.
 *
 * Returns:
 *   True when the panel is docked.
 */
export function isPanelVisible(layout: DockLayout, id: PanelId): boolean {
  return findPanel(layout, id) !== null;
}

function replaceGroup(layout: DockLayout, side: DockSide, index: number, next: DockGroup | null): DockLayout {
  const groups = layout[side];
  return {
    ...layout,
    [side]: next ? groups.map((g, i) => (i === index ? next : g)) : groups.filter((_, i) => i !== index),
  };
}

/**
 * Closes a panel. When it was the shown tab, the next tab (or the previous one at the end) is shown;
 * a group whose last tab closes disappears.
 *
 * Args:
 *   layout: Dock layout.
 *   id: Panel id.
 *
 * Returns:
 *   New layout, or the same reference when the panel is already closed.
 */
export function closePanel(layout: DockLayout, id: PanelId): DockLayout {
  const location = findPanel(layout, id);
  if (!location) return layout;
  const old = layout[location.side][location.group];
  const panels = old.panels.filter((panel) => panel !== id);
  if (panels.length === 0) return replaceGroup(layout, location.side, location.group, null);
  const active = old.active === id ? panels[Math.min(location.tab, panels.length - 1)] : old.active;
  return replaceGroup(layout, location.side, location.group, { ...old, panels, active });
}

/**
 * Opens a closed panel as the shown tab at the end of the first group on its default side
 * (a new group when that side is empty), or closes it when it is open (menu checkbox).
 *
 * Args:
 *   layout: Dock layout.
 *   id: Panel id.
 *
 * Returns:
 *   New layout.
 */
export function togglePanel(layout: DockLayout, id: PanelId): DockLayout {
  if (isPanelVisible(layout, id)) return closePanel(layout, id);
  const side = getPanelDefaultSide(id);
  const first = layout[side][0];
  if (!first) return { ...layout, [side]: [group([id])] };
  return replaceGroup(layout, side, 0, { ...first, panels: [...first.panels, id], active: id });
}

/**
 * Shows a panel's tab in its group.
 *
 * Args:
 *   layout: Dock layout.
 *   id: Panel id.
 *
 * Returns:
 *   New layout, or the same reference when the panel is closed or already shown.
 */
export function activatePanel(layout: DockLayout, id: PanelId): DockLayout {
  const location = findPanel(layout, id);
  if (!location) return layout;
  const old = layout[location.side][location.group];
  if (old.active === id) return layout;
  return replaceGroup(layout, location.side, location.group, { ...old, active: id });
}

/**
 * Collapses or expands the group that contains a panel.
 *
 * Args:
 *   layout: Dock layout.
 *   id: Any panel in the group.
 *
 * Returns:
 *   New layout, or the same reference when the panel is closed.
 */
export function toggleCollapsed(layout: DockLayout, id: PanelId): DockLayout {
  const location = findPanel(layout, id);
  if (!location) return layout;
  const old = layout[location.side][location.group];
  return replaceGroup(layout, location.side, location.group, { ...old, collapsed: !old.collapsed });
}

function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(0, Math.trunc(index)), length);
}

/**
 * Drops a dragged panel: into a group's tab bar, or as a new group between groups.
 * The dropped panel becomes the shown tab of its group. A closed panel is opened there.
 *
 * Args:
 *   layout: Dock layout.
 *   id: Dragged panel id.
 *   target: Drop target, with slots counted as shown while dragging.
 *
 * Returns:
 *   New layout, or the same reference when the drop does not change anything.
 */
export function dropPanel(layout: DockLayout, id: PanelId, target: DropTarget): DockLayout {
  const from = findPanel(layout, id);
  const fromGroup = from && layout[from.side][from.group];

  if (target.kind === "tab") {
    const into = layout[target.side][target.group];
    if (!into) return layout;
    // 同一組：只換頁籤位置（並顯示它）
    if (from && fromGroup && from.side === target.side && from.group === target.group) {
      const index = clampIndex(from.tab < target.slot ? target.slot - 1 : target.slot, into.panels.length - 1);
      if (index === from.tab) return activatePanel(layout, id);
      const rest = into.panels.filter((panel) => panel !== id);
      const panels = [...rest.slice(0, index), id, ...rest.slice(index)];
      return replaceGroup(layout, target.side, target.group, { ...into, panels, active: id });
    }
    // 併入別組：先從原本的位置拿掉（原組可能因此消失，同側後面的組 index 往前一格）
    const removed = closePanel(layout, id);
    const groupVanished = from !== null && fromGroup !== null && fromGroup.panels.length === 1;
    const groupIndex =
      groupVanished && from.side === target.side && from.group < target.group ? target.group - 1 : target.group;
    const slot = clampIndex(target.slot, into.panels.length);
    const panels = [...into.panels.slice(0, slot), id, ...into.panels.slice(slot)];
    return replaceGroup(removed, target.side, groupIndex, { ...into, panels, active: id });
  }

  // 另成一組：自己就是一整組、放回原處時不變
  const alone = from !== null && fromGroup !== null && fromGroup.panels.length === 1;
  if (alone && from.side === target.side && (target.slot === from.group || target.slot === from.group + 1)) {
    return layout;
  }
  const removed = closePanel(layout, id);
  const shift = alone && from.side === target.side && from.group < target.slot ? 1 : 0;
  const groups = removed[target.side];
  const slot = clampIndex(target.slot - shift, groups.length);
  return { ...removed, [target.side]: [...groups.slice(0, slot), group([id]), ...groups.slice(slot)] };
}

function placement(layout: DockLayout): string {
  return JSON.stringify(DOCK_SIDES.map((side) => layout[side].map((g) => g.panels)));
}

/**
 * Whether dropping a panel at a target would move it (tab order or grouping changes).
 * Dropping a tab where it already is only shows it, so no insertion marker is drawn for that.
 *
 * Args:
 *   layout: Dock layout.
 *   id: Dragged panel id.
 *   target: Drop target.
 *
 * Returns:
 *   True when the panel ends up somewhere else.
 */
export function dropMovesPanel(layout: DockLayout, id: PanelId, target: DropTarget): boolean {
  const next = dropPanel(layout, id, target);
  return next !== layout && placement(next) !== placement(layout);
}

/**
 * Finds the insertion slot for a pointer position: the number of items whose center is before it.
 * Works on either axis (dock groups top to bottom, tabs and page tabs left to right).
 *
 * Args:
 *   centers: Centers of the items along the axis, in order (screen px).
 *   y: Pointer position on the same axis (screen px).
 *
 * Returns:
 *   Slot index 0..centers.length.
 */
export function insertionSlot(centers: readonly number[], y: number): number {
  return centers.filter((center) => center < y).length;
}

/**
 * Clamps a dock width to the allowed range, rounded to whole pixels.
 *
 * Args:
 *   px: Requested width.
 *
 * Returns:
 *   Width within DOCK_WIDTH.min..max; the default when px is not finite.
 */
export function clampDockWidth(px: number): number {
  if (!Number.isFinite(px)) return DOCK_WIDTH.default;
  return Math.round(Math.min(Math.max(px, DOCK_WIDTH.min), DOCK_WIDTH.max));
}

/**
 * Sets the width of one dock (size control bar).
 *
 * Args:
 *   layout: Dock layout.
 *   side: Dock side.
 *   px: Requested width in CSS px.
 *
 * Returns:
 *   New layout, or the same reference when the clamped width does not change.
 */
export function setDockWidth(layout: DockLayout, side: DockSide, px: number): DockLayout {
  const width = clampDockWidth(px);
  if (layout.width[side] === width) return layout;
  return { ...layout, width: { ...layout.width, [side]: width } };
}

/**
 * Computes a dock width while its size control bar is dragged.
 * Dragging toward the canvas widens the dock: rightward for the left dock, leftward for the right dock.
 *
 * Args:
 *   startWidth: Dock width when the drag started.
 *   deltaX: Pointer movement since the drag started (positive = rightward).
 *   side: Dock side.
 *   maxGrow: How much wider the dock may get before the canvas hits CANVAS_MIN_WIDTH;
 *     negative values are treated as 0 (the dock can still shrink).
 *
 * Returns:
 *   Clamped width.
 */
export function resizeDockWidth(startWidth: number, deltaX: number, side: DockSide, maxGrow: number): number {
  const grow = side === "left" ? deltaX : -deltaX;
  return clampDockWidth(startWidth + Math.min(grow, Math.max(0, maxGrow)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads the dock widths from untrusted stored data (any layout version).
 *
 * Args:
 *   value: Parsed JSON.
 *
 * Returns:
 *   Clamped widths; the default for anything missing or invalid.
 */
export function parseDockWidths(value: unknown): DockLayout["width"] {
  const width = isRecord(value) && isRecord(value.width) ? value.width : {};
  const parseWidth = (raw: unknown) => clampDockWidth(typeof raw === "number" ? raw : Number.NaN);
  return { left: parseWidth(width.left), right: parseWidth(width.right) };
}

/**
 * Restores a layout from untrusted stored data.
 * Unknown or duplicate panel ids are dropped, empty groups are dropped, an invalid shown tab
 * falls back to the first tab, invalid widths fall back to the default, and anything that is
 * not a layout object yields DEFAULT_DOCK_LAYOUT.
 *
 * Args:
 *   value: Parsed JSON (e.g. from localStorage).
 *
 * Returns:
 *   A valid layout.
 */
export function parseDockLayout(value: unknown): DockLayout {
  if (!isRecord(value)) return DEFAULT_DOCK_LAYOUT;
  const seen = new Set<PanelId>();
  const parseSide = (raw: unknown): DockGroup[] => {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item): DockGroup[] => {
      if (!isRecord(item) || !Array.isArray(item.panels)) return [];
      // 邊過濾邊記錄：同一組裡重複的 id 也只留第一個
      const panels = item.panels.filter((id): id is PanelId => {
        if (!isPanelId(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      if (panels.length === 0) return [];
      const active = panels.find((id) => id === item.active) ?? panels[0];
      return [{ panels, active, collapsed: item.collapsed === true }];
    });
  };
  return { left: parseSide(value.left), right: parseSide(value.right), width: parseDockWidths(value) };
}
