import { mmToPt } from "@/lib/editor/units";
import { clamp } from "@/lib/editor/validation";

/** App preferences: kept on this computer (localStorage), not in the project file or undo history. */
export interface Preferences {
  readonly grid: {
    readonly visible: boolean;
    /** Grid spacing in pt. */
    readonly spacing: number;
    /** Snap moved, resized and created elements to the grid (works while the grid is hidden too). */
    readonly snap: boolean;
  };
  /** Draw the document margins as guides on the canvas. */
  readonly showMargins: boolean;
  /** Draw page numbers on the canvas (export always includes them). */
  readonly showPageNumbers: boolean;
  /** Edit one page at a time, or two facing pages (spreads: page 1 alone on the right, then 2–3 …). */
  readonly pageView: PageView;
}

export type PageView = "single" | "spread";

/** Grid spacing range offered by the preferences dialog (pt). */
export const GRID_SPACING = { min: mmToPt(1), max: mmToPt(100), default: mmToPt(5) } as const;

export const DEFAULT_PREFERENCES: Preferences = {
  grid: { visible: false, spacing: GRID_SPACING.default, snap: false },
  showMargins: true,
  showPageNumbers: true,
  pageView: "single",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Parses stored preferences. Each field is checked on its own: a broken field falls back to its
 * default without discarding the others; an out-of-range grid spacing is clamped.
 *
 * Args:
 *   value: Untrusted value (e.g. parsed from localStorage).
 *
 * Returns:
 *   Valid preferences.
 */
export function parsePreferences(value: unknown): Preferences {
  if (!isRecord(value)) return DEFAULT_PREFERENCES;
  const grid = isRecord(value.grid) ? value.grid : {};
  const fallback = DEFAULT_PREFERENCES;
  const spacing =
    typeof grid.spacing === "number" && Number.isFinite(grid.spacing)
      ? clamp(grid.spacing, GRID_SPACING.min, GRID_SPACING.max)
      : fallback.grid.spacing;
  return {
    grid: {
      visible: parseBoolean(grid.visible, fallback.grid.visible),
      spacing,
      snap: parseBoolean(grid.snap, fallback.grid.snap),
    },
    showMargins: parseBoolean(value.showMargins, fallback.showMargins),
    showPageNumbers: parseBoolean(value.showPageNumbers, fallback.showPageNumbers),
    pageView: value.pageView === "spread" || value.pageView === "single" ? value.pageView : fallback.pageView,
  };
}
