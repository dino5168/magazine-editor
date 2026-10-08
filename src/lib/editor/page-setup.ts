import type { Margins, Size } from "./types";
import { PAGE_SIZE_PRESETS, findPageSizePreset, presetToPt, type PageSizeGroupId } from "./units";
import { isMargins, isPageSize } from "./validation";

export type PageSizePresetId = keyof typeof PAGE_SIZE_PRESETS;
export type Orientation = "portrait" | "landscape";

/** Paper size and margins of a document (the page setup and 新增文件 dialogs edit one). */
export interface PageSetup {
  readonly size: Size;
  readonly margins: Margins;
}

export const PAGE_SIZE_PRESET_IDS = Object.keys(PAGE_SIZE_PRESETS) as readonly PageSizePresetId[];

/**
 * Lists the presets of one paper family, in declaration order (the page setup menu's sections).
 *
 * Args:
 *   group: Paper family.
 *
 * Returns:
 *   Preset ids.
 */
export function presetIdsInGroup(group: PageSizeGroupId): readonly PageSizePresetId[] {
  return PAGE_SIZE_PRESET_IDS.filter((id) => PAGE_SIZE_PRESETS[id].group === group);
}

/** Problems the page setup dialog shows; an empty object means the setup can be applied. */
export interface PageSetupErrors {
  readonly size?: string;
  readonly margins?: string;
  readonly horizontal?: string;
  readonly vertical?: string;
}

/**
 * Returns the orientation of a page size (a square page counts as portrait).
 *
 * Args:
 *   size: Page size.
 *
 * Returns:
 *   "landscape" when wider than tall, otherwise "portrait".
 */
export function orientationOf(size: Size): Orientation {
  return size.width > size.height ? "landscape" : "portrait";
}

/**
 * Turns a page size to the given orientation by swapping width and height when needed.
 *
 * Args:
 *   size: Page size.
 *   orientation: Wanted orientation.
 *
 * Returns:
 *   The same size object when it already has that orientation, otherwise the swapped size.
 */
export function withOrientation(size: Size, orientation: Orientation): Size {
  return orientationOf(size) === orientation ? size : { width: size.height, height: size.width };
}

/**
 * Finds the preset a page size matches, in either orientation.
 *
 * Args:
 *   size: Page size in pt.
 *
 * Returns:
 *   Preset id, or null for a custom size.
 */
export function presetIdOf(size: Size): PageSizePresetId | null {
  const preset = findPageSizePreset(withOrientation(size, "portrait"));
  return PAGE_SIZE_PRESET_IDS.find((id) => PAGE_SIZE_PRESETS[id] === preset) ?? null;
}

/**
 * Returns the size of a preset in the given orientation.
 *
 * Args:
 *   id: Preset id.
 *   orientation: Wanted orientation.
 *
 * Returns:
 *   Page size in pt.
 */
export function presetSize(id: PageSizePresetId, orientation: Orientation): Size {
  return withOrientation(presetToPt(PAGE_SIZE_PRESETS[id]), orientation);
}

/**
 * Checks a page setup before it is applied: size range, margin range, and that the margins
 * leave some room on the page. The reducer only checks the ranges; the fit is a dialog rule.
 *
 * Args:
 *   size: Page size in pt.
 *   margins: Margins in pt.
 *
 * Returns:
 *   Messages for the dialog; empty when valid.
 */
export function validatePageSetup(size: Size, margins: Margins): PageSetupErrors {
  if (!isPageSize(size)) return { size: "寬、高必須在 10–2000 mm 之間" };
  if (!isMargins(margins)) return { margins: "邊界必須在 0–2000 mm 之間" };
  return {
    ...(margins.left + margins.right >= size.width && { horizontal: "左、右邊界合計必須小於頁寬" }),
    ...(margins.top + margins.bottom >= size.height && { vertical: "上、下邊界合計必須小於頁高" }),
  };
}

/**
 * Checks whether a validation result has no errors.
 *
 * Args:
 *   errors: Result of `validatePageSetup`.
 *
 * Returns:
 *   True when the setup can be applied.
 */
export function isPageSetupValid(errors: PageSetupErrors): boolean {
  return Object.keys(errors).length === 0;
}
