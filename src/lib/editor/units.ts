import type { Size } from "./types";

const PT_PER_INCH = 72;
const MM_PER_INCH = 25.4;

/** Tolerance when matching a page size against presets (pt). */
const PRESET_TOLERANCE_PT = 0.5;

export interface PageSizePreset {
  readonly label: string;
  readonly widthMm: number;
  readonly heightMm: number;
}

export const PAGE_SIZE_PRESETS = {
  a4: { label: "A4", widthMm: 210, heightMm: 297 },
  b5: { label: "B5", widthMm: 182, heightMm: 257 },
  letter: { label: "Letter", widthMm: 215.9, heightMm: 279.4 },
} as const satisfies Record<string, PageSizePreset>;

/**
 * Converts millimetres to points.
 *
 * Args:
 *   mm: Length in millimetres.
 *
 * Returns:
 *   Length in points (1/72 inch).
 */
export function mmToPt(mm: number): number {
  return (mm * PT_PER_INCH) / MM_PER_INCH;
}

/**
 * Converts points to millimetres.
 *
 * Args:
 *   pt: Length in points.
 *
 * Returns:
 *   Length in millimetres.
 */
export function ptToMm(pt: number): number {
  return (pt * MM_PER_INCH) / PT_PER_INCH;
}

/**
 * Returns the page size of a preset in points.
 *
 * Args:
 *   preset: Page size preset in millimetres.
 *
 * Returns:
 *   Width and height in points.
 */
export function presetToPt(preset: PageSizePreset): Size {
  return { width: mmToPt(preset.widthMm), height: mmToPt(preset.heightMm) };
}

/**
 * Finds the preset matching a page size.
 *
 * Args:
 *   size: Page size in points.
 *
 * Returns:
 *   The matching preset, or null when the size is custom.
 */
export function findPageSizePreset(size: Size): PageSizePreset | null {
  const presets: readonly PageSizePreset[] = Object.values(PAGE_SIZE_PRESETS);
  return (
    presets.find((preset) => {
      const pt = presetToPt(preset);
      return (
        Math.abs(pt.width - size.width) <= PRESET_TOLERANCE_PT &&
        Math.abs(pt.height - size.height) <= PRESET_TOLERANCE_PT
      );
    }) ?? null
  );
}

/**
 * Formats a page size for display, e.g. "A4 · 210 × 297 mm".
 *
 * Args:
 *   size: Page size in points.
 *
 * Returns:
 *   Human-readable size label.
 */
export function formatPageSize(size: Size): string {
  const mm = `${Math.round(ptToMm(size.width) * 10) / 10} × ${Math.round(ptToMm(size.height) * 10) / 10} mm`;
  const preset = findPageSizePreset(size);
  return preset ? `${preset.label} · ${mm}` : mm;
}
