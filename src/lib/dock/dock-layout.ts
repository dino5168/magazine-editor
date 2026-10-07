import { getPanelDefaultSide, isPanelId, type PanelId } from "./panels";

export type DockSide = "left" | "right";

export const DOCK_SIDES: readonly DockSide[] = ["left", "right"];

export interface DockedPanel {
  readonly id: PanelId;
  /** Only the title bar is shown when collapsed. */
  readonly collapsed: boolean;
}

/**
 * Tool panel arrangement: panels docked on each side (top to bottom) and each dock's width.
 * App preference, not document content: it is neither in the undo history nor in the project file.
 */
export interface DockLayout {
  readonly left: readonly DockedPanel[];
  readonly right: readonly DockedPanel[];
  /** Dock widths in CSS px (screen space, independent of zoom). */
  readonly width: { readonly left: number; readonly right: number };
}

export interface PanelLocation {
  readonly side: DockSide;
  readonly index: number;
}

/** Where a dragged panel would be dropped. */
export interface DropTarget {
  readonly side: DockSide;
  /** Insertion slot among the side's panels as currently shown (0 = top, length = bottom). */
  readonly slot: number;
}

/** Dock width limits in CSS px. */
export const DOCK_WIDTH = { min: 200, max: 560, default: 320 } as const;

/** Width change per arrow key press on a size control bar, in CSS px. */
export const DOCK_WIDTH_STEP = 16;

/**
 * The canvas column never gets narrower than this when a dock is widened, in CSS px.
 * Wide enough for the system control bar (document name, undo/redo, zoom, export).
 */
export const CANVAS_MIN_WIDTH = 480;

// 左側開範本與頁面（同 Affinity 的 Pages 面板位置）；屬性與圖層常用，預設放右側（屬性在上）
export const DEFAULT_DOCK_LAYOUT: DockLayout = {
  left: [
    { id: "templates", collapsed: false },
    { id: "pages", collapsed: false },
  ],
  right: [
    { id: "properties", collapsed: false },
    { id: "layers", collapsed: false },
  ],
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
 *   Side and index, or null when the panel is closed.
 */
export function findPanel(layout: DockLayout, id: PanelId): PanelLocation | null {
  for (const side of DOCK_SIDES) {
    const index = layout[side].findIndex((panel) => panel.id === id);
    if (index >= 0) return { side, index };
  }
  return null;
}

/**
 * Checks whether a panel is open (docked on either side).
 *
 * Args:
 *   layout: Dock layout.
 *   id: Panel id.
 *
 * Returns:
 *   True when the panel is visible.
 */
export function isPanelVisible(layout: DockLayout, id: PanelId): boolean {
  return findPanel(layout, id) !== null;
}

/**
 * Closes a panel.
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
  return { ...layout, [location.side]: layout[location.side].filter((panel) => panel.id !== id) };
}

/**
 * Opens a panel at the bottom of its default side, or closes it when it is open (menu checkbox).
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
  return { ...layout, [side]: [...layout[side], { id, collapsed: false }] };
}

/**
 * Moves a panel to a side and position (drag and drop). A closed panel is opened there.
 *
 * Args:
 *   layout: Dock layout.
 *   id: Panel id.
 *   side: Target side.
 *   index: Target index in the target side after the panel is removed from its old place;
 *     clamped to the valid range.
 *
 * Returns:
 *   New layout, or the same reference when the position does not change.
 */
export function movePanel(layout: DockLayout, id: PanelId, side: DockSide, index: number): DockLayout {
  const location = findPanel(layout, id);
  const panel = location ? layout[location.side][location.index] : { id, collapsed: false };
  const removed = closePanel(layout, id);
  const target = removed[side];
  const clamped = Math.min(Math.max(0, Math.trunc(index)), target.length);
  if (location && location.side === side && location.index === clamped) return layout;
  return { ...removed, [side]: [...target.slice(0, clamped), panel, ...target.slice(clamped)] };
}

/**
 * Drops a dragged panel at an insertion slot.
 * Unlike movePanel, the slot counts the dragged panel itself when it is on the same side,
 * which is what the user sees while dragging.
 *
 * Args:
 *   layout: Dock layout.
 *   id: Dragged panel id.
 *   target: Drop side and slot.
 *
 * Returns:
 *   New layout, or the same reference when the drop does not change anything.
 */
export function dropPanel(layout: DockLayout, id: PanelId, target: DropTarget): DockLayout {
  const location = findPanel(layout, id);
  const index =
    location && location.side === target.side && location.index < target.slot ? target.slot - 1 : target.slot;
  return movePanel(layout, id, target.side, index);
}

/**
 * Finds the insertion slot for a pointer position: the number of items whose center is before it.
 * Works on either axis (dock panels top to bottom, page tabs left to right).
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
 * Collapses or expands a docked panel.
 *
 * Args:
 *   layout: Dock layout.
 *   id: Panel id.
 *
 * Returns:
 *   New layout, or the same reference when the panel is closed.
 */
export function toggleCollapsed(layout: DockLayout, id: PanelId): DockLayout {
  const location = findPanel(layout, id);
  if (!location) return layout;
  return {
    ...layout,
    [location.side]: layout[location.side].map((panel) =>
      panel.id === id ? { ...panel, collapsed: !panel.collapsed } : panel,
    ),
  };
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
 * Restores a layout from untrusted stored data.
 * Unknown or duplicate panel ids are dropped, invalid widths fall back to the default,
 * and anything that is not a layout object yields DEFAULT_DOCK_LAYOUT.
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
  const parseSide = (raw: unknown): DockedPanel[] => {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item): DockedPanel[] => {
      if (!isRecord(item) || !isPanelId(item.id) || seen.has(item.id)) return [];
      seen.add(item.id);
      return [{ id: item.id, collapsed: item.collapsed === true }];
    });
  };
  const width = isRecord(value.width) ? value.width : {};
  const parseWidth = (raw: unknown) => clampDockWidth(typeof raw === "number" ? raw : Number.NaN);
  return {
    left: parseSide(value.left),
    right: parseSide(value.right),
    width: { left: parseWidth(width.left), right: parseWidth(width.right) },
  };
}
