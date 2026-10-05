import type { Size } from "./types";

const PT_PER_INCH = 72;
const MM_PER_INCH = 25.4;

/** Tolerance when matching a page size against presets (pt). */
const PRESET_TOLERANCE_PT = 0.5;

/** Paper families, in the order the page setup menu lists them. */
export const PAGE_SIZE_GROUPS = [
  { id: "iso", label: "ISO A" },
  { id: "jis", label: "JIS B" },
  { id: "taiwan", label: "台灣書刊開本" },
  { id: "us", label: "美規" },
  { id: "ebook", label: "電子書（螢幕比例）" },
] as const;

export type PageSizeGroupId = (typeof PAGE_SIZE_GROUPS)[number]["id"];

/** A paper size, portrait (width ≤ height); the page setup turns it landscape when asked. */
export interface PageSizePreset {
  readonly label: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly group: PageSizeGroupId;
}

// 紙張選項只在前端（Rust 只檢查寬高範圍），新增不必改檔案格式。id 一旦用了就不要改：「範本」面板以 id 引用。
// 兩個尺寸不可以相同（presetIdOf 會認錯），測試會檢查。
export const PAGE_SIZE_PRESETS = {
  a3: { label: "A3", widthMm: 297, heightMm: 420, group: "iso" },
  a4: { label: "A4", widthMm: 210, heightMm: 297, group: "iso" },
  a5: { label: "A5", widthMm: 148, heightMm: 210, group: "iso" },
  a6: { label: "A6", widthMm: 105, heightMm: 148, group: "iso" },
  b4: { label: "B4（JIS）", widthMm: 257, heightMm: 364, group: "jis" },
  b5: { label: "B5（JIS）", widthMm: 182, heightMm: 257, group: "jis" },
  b6: { label: "B6（JIS）", widthMm: 128, heightMm: 182, group: "jis" },
  // 25 開（148 × 210）和 A5 同尺寸，不另列
  k16: { label: "16 開", widthMm: 190, heightMm: 260, group: "taiwan" },
  k32: { label: "32 開", widthMm: 130, heightMm: 190, group: "taiwan" },
  letter: { label: "Letter", widthMm: 215.9, heightMm: 279.4, group: "us" },
  legal: { label: "Legal", widthMm: 215.9, heightMm: 355.6, group: "us" },
  tabloid: { label: "Tabloid", widthMm: 279.4, heightMm: 431.8, group: "us" },
  ebook3x4: { label: "電子書 3:4", widthMm: 150, heightMm: 200, group: "ebook" },
  ebook9x16: { label: "電子書 9:16", widthMm: 112.5, heightMm: 200, group: "ebook" },
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
