import { getPaletteHex, withAlpha } from "@/lib/editor/palette";
import type { Stroke } from "@/lib/editor/types";
import { mmToPt } from "@/lib/editor/units";
import { clamp, isElementColor } from "@/lib/editor/validation";

/** Look of one kind of canvas guide line. Width is in screen px, so zooming does not change it. */
export interface GuideLineStyle {
  /** `#rrggbb` or `#rrggbbaa`, picked from the palette. */
  readonly color: string;
  readonly dash: Stroke["dash"];
  /** Screen px. */
  readonly width: number;
}

/** Styles of the three kinds of guide lines. */
export interface GuideLineStyles {
  readonly grid: GuideLineStyle;
  /** Lines at 1/4, 1/2 and 3/4 of the content area (the 1/2 lines are drawn stronger). */
  readonly contentGuides: GuideLineStyle;
  readonly margins: GuideLineStyle;
}

/** App preferences: kept on this computer (localStorage), not in the project file or undo history. */
export interface Preferences {
  readonly grid: {
    readonly visible: boolean;
    /** Grid spacing in pt. */
    readonly spacing: number;
    /** Snap moved, resized and created elements to the grid (works while the grid is hidden too). */
    readonly snap: boolean;
  };
  /** Draw the 1/4, 1/2 and 3/4 lines of the content area. */
  readonly showContentGuides: boolean;
  /** Draw the document margins as guides on the canvas. */
  readonly showMargins: boolean;
  /** Draw page numbers on the canvas (export always includes them). */
  readonly showPageNumbers: boolean;
  /** Edit one page at a time, or two facing pages (spreads: page 1 alone on the right, then 2–3 …). */
  readonly pageView: PageView;
  /** Show the mm rulers above and left of the canvas (視圖 → 尺規). */
  readonly showRulers: boolean;
  readonly lineStyles: GuideLineStyles;
  /** Styles saved with「設為預設」; null = never saved, so「恢復預設」uses the factory styles. */
  readonly lineStyleDefaults: GuideLineStyles | null;
}

export type PageView = "single" | "spread";

/** Grid spacing range offered by the preferences dialog (pt). */
export const GRID_SPACING = { min: mmToPt(1), max: mmToPt(100), default: mmToPt(5) } as const;

/** Guide line width range (screen px) and the step of the − / ＋ buttons. */
export const GUIDE_LINE_WIDTH = { min: 0.5, max: 4, step: 0.5 } as const;

// 原廠樣式 = 加入樣式設定之前寫死的外觀（顏色取色票上最接近的那一格）
export const FACTORY_LINE_STYLES: GuideLineStyles = {
  grid: { color: withAlpha(getPaletteHex("slate", 400), 0.45), dash: "dashed", width: 1 },
  // 1/2 線的樣子；1/4、3/4 線畫的時候再淡一點、細一點
  contentGuides: { color: withAlpha(getPaletteHex("indigo", 500), 0.85), dash: "dashed", width: 1 },
  margins: { color: getPaletteHex("pink", 500), dash: "dashed", width: 1 },
};

export const DEFAULT_PREFERENCES: Preferences = {
  grid: { visible: false, spacing: GRID_SPACING.default, snap: false },
  showContentGuides: false,
  showMargins: true,
  showPageNumbers: true,
  pageView: "single",
  showRulers: true,
  lineStyles: FACTORY_LINE_STYLES,
  lineStyleDefaults: null,
};

const DASHES: readonly Stroke["dash"][] = ["solid", "dashed", "dotted"];

const LINE_KINDS = ["grid", "contentGuides", "margins"] as const satisfies readonly (keyof GuideLineStyles)[];

/**
 * Returns the styles「恢復預設」goes back to: the ones saved with「設為預設」, or the factory styles.
 *
 * Args:
 *   preferences: Preferences (or a dialog draft).
 *
 * Returns:
 *   Guide line styles.
 */
export function defaultLineStyles(preferences: Preferences): GuideLineStyles {
  return preferences.lineStyleDefaults ?? FACTORY_LINE_STYLES;
}

/**
 * Compares two sets of guide line styles by value.
 *
 * Args:
 *   a: Styles.
 *   b: Styles, or null (never equal).
 *
 * Returns:
 *   True when every color, dash and width is the same.
 */
export function sameLineStyles(a: GuideLineStyles, b: GuideLineStyles | null): boolean {
  if (b === null) return false;
  return LINE_KINDS.every((kind) => a[kind].color === b[kind].color && a[kind].dash === b[kind].dash && a[kind].width === b[kind].width);
}

/**
 * Clamps a guide line width into range and rounds it to the button step.
 *
 * Args:
 *   width: Width in screen px.
 *
 * Returns:
 *   Width in [GUIDE_LINE_WIDTH.min, GUIDE_LINE_WIDTH.max], a multiple of the step.
 */
export function clampGuideLineWidth(width: number): number {
  const { min, max, step } = GUIDE_LINE_WIDTH;
  return clamp(Math.round(width / step) * step, min, max);
}

function parseLineStyle(value: unknown, fallback: GuideLineStyle): GuideLineStyle {
  if (!isRecord(value)) return fallback;
  const { color, dash, width } = value;
  return {
    color: typeof color === "string" && isElementColor(color) ? color : fallback.color,
    dash: DASHES.find((candidate) => candidate === dash) ?? fallback.dash,
    width: typeof width === "number" && Number.isFinite(width) ? clampGuideLineWidth(width) : fallback.width,
  };
}

function parseLineStyles(value: unknown, fallback: GuideLineStyles): GuideLineStyles {
  const styles = isRecord(value) ? value : {};
  return {
    grid: parseLineStyle(styles.grid, fallback.grid),
    contentGuides: parseLineStyle(styles.contentGuides, fallback.contentGuides),
    margins: parseLineStyle(styles.margins, fallback.margins),
  };
}

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
  const visible = parseBoolean(grid.visible, fallback.grid.visible);
  return {
    grid: { visible, spacing, snap: parseBoolean(grid.snap, fallback.grid.snap) },
    // 之前對齊線跟著格線顯示：舊紀錄沒有這個欄位時照格線，升級後看到的一樣
    showContentGuides: parseBoolean(value.showContentGuides, visible),
    showMargins: parseBoolean(value.showMargins, fallback.showMargins),
    showPageNumbers: parseBoolean(value.showPageNumbers, fallback.showPageNumbers),
    pageView: value.pageView === "spread" || value.pageView === "single" ? value.pageView : fallback.pageView,
    showRulers: parseBoolean(value.showRulers, fallback.showRulers),
    lineStyles: parseLineStyles(value.lineStyles, fallback.lineStyles),
    lineStyleDefaults: isRecord(value.lineStyleDefaults) ? parseLineStyles(value.lineStyleDefaults, FACTORY_LINE_STYLES) : null,
  };
}
