/**
 * 文件色票的純邏輯。
 *
 * 色票是具名、不透明的 `#rrggbb`。用到顏色的地方照舊存完整的顏色（含自己的透明度），另外記住連到
 * 哪個色票（`fillSwatchId` / `swatchId` / `backgroundSwatchId`）。改色票、刪除色票時由這裡改寫所有
 * 連到它的地方，所以畫布、量測與匯出都只讀顏色欄位。計畫：`docs/01-Plans-2026-10/17-文件色票-實作.md`。
 */
import type {
  CanvasElement,
  EditorDocument,
  PageNumberRule,
  Sheet,
  Stroke,
  Swatch,
  TextShadow,
  TextStyle,
} from "./types";
import { SWATCH_NAME_MAX_LENGTH, isSwatchList, validateName } from "./validation";

export type { Swatch };

/** Ids of the swatches of a new document; fixed so the built-in text styles can link to 文字. */
export const BUILT_IN_SWATCH_IDS = {
  text: "swatch-text",
  black: "swatch-black",
  white: "swatch-white",
} as const;

/**
 * Swatches of a new document: 文字 (the color of new text, `DEFAULT_TEXT_FILL`), 黑, 白.
 *
 * Returns:
 *   Three swatches with the fixed `BUILT_IN_SWATCH_IDS`.
 */
export function defaultSwatches(): readonly Swatch[] {
  return [
    { id: BUILT_IN_SWATCH_IDS.text, name: "文字", color: "#171717" },
    { id: BUILT_IN_SWATCH_IDS.black, name: "黑", color: "#000000" },
    { id: BUILT_IN_SWATCH_IDS.white, name: "白", color: "#ffffff" },
  ];
}

/**
 * Name of a new swatch: `色票 1`, `色票 2` … (the first unused number).
 *
 * Args:
 *   swatches: Existing swatches.
 *
 * Returns:
 *   An unused name.
 */
export function nextSwatchName(swatches: readonly Swatch[]): string {
  const used = new Set(swatches.map((swatch) => swatch.name));
  for (let n = 1; ; n++) if (!used.has(`色票 ${n}`)) return `色票 ${n}`;
}

/**
 * Why a swatch name cannot be used, for the swatch dialog.
 *
 * Args:
 *   raw: Name as typed.
 *   swatches: The swatches.
 *   exceptId: The swatch being renamed (its own name is fine).
 *
 * Returns:
 *   A message, or null when the trimmed name is valid and unused.
 */
export function swatchNameError(raw: string, swatches: readonly Swatch[], exceptId: string | null): string | null {
  const result = validateName(raw, SWATCH_NAME_MAX_LENGTH);
  if (result.error) return result.error.message;
  const taken = swatches.some((swatch) => swatch.id !== exceptId && swatch.name === result.data);
  return taken ? `已經有名為「${result.data}」的色票` : null;
}

/**
 * Reads a color typed in the swatch dialog: `#` optional, any case, 3 or 6 hex digits.
 *
 * Args:
 *   raw: Text as typed.
 *
 * Returns:
 *   Lowercase `#rrggbb`, or null when it is not a color.
 */
export function parseSwatchHex(raw: string): string | null {
  const digits = raw.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{6}$/.test(digits)) return `#${digits}`;
  if (/^[0-9a-f]{3}$/.test(digits)) return `#${Array.from(digits, (d) => d + d).join("")}`;
  return null;
}

/** One color field of the document and the swatch it follows. */
export interface ColorSlot {
  /** `#rrggbb` or `#rrggbbaa` (page backgrounds are always `#rrggbb`). */
  readonly color: string;
  readonly swatchId: string | null;
}

/** Returns the new value of a color field; the same values mean "unchanged". */
export type ColorSlotUpdate = (slot: ColorSlot) => ColorSlot;

function mapSlot<T>(target: T, color: string, swatchId: string | null, update: ColorSlotUpdate, write: (next: ColorSlot) => T): T {
  const next = update({ color, swatchId });
  return next.color === color && next.swatchId === swatchId ? target : write(next);
}

function mapStroke(stroke: Stroke | null, update: ColorSlotUpdate): Stroke | null {
  return stroke && mapSlot(stroke, stroke.color, stroke.swatchId, update, (next) => ({ ...stroke, ...next }));
}

function mapShadow(shadow: TextShadow | null, update: ColorSlotUpdate): TextShadow | null {
  return shadow && mapSlot(shadow, shadow.color, shadow.swatchId, update, (next) => ({ ...shadow, ...next }));
}

/** Text color and shadow of anything with a text style (texts, labels, text styles, page numbers). */
function mapTextColors<T extends Pick<TextStyle, "fill" | "fillSwatchId" | "shadow">>(target: T, update: ColorSlotUpdate): T {
  const filled = mapSlot(target, target.fill, target.fillSwatchId, update, (next) => ({
    ...target,
    fill: next.color,
    fillSwatchId: next.swatchId,
  }));
  const shadow = mapShadow(target.shadow, update);
  return shadow === target.shadow ? filled : { ...filled, shadow };
}

function mapElementColors(element: CanvasElement, update: ColorSlotUpdate): CanvasElement {
  switch (element.type) {
    case "text":
      return mapTextColors(element, update);
    case "shape": {
      const filled = mapSlot(element, element.fill, element.fillSwatchId, update, (next) => ({
        ...element,
        fill: next.color,
        fillSwatchId: next.swatchId,
      }));
      const stroke = mapStroke(element.stroke, update);
      const label = element.label && mapTextColors(element.label, update);
      return stroke === element.stroke && label === element.label ? filled : { ...filled, stroke, label };
    }
    case "image":
      return element;
    case "line": {
      // 線一定有線條，mapStroke 收非 null 就回傳非 null
      const stroke = mapStroke(element.stroke, update)!;
      return stroke === element.stroke ? element : { ...element, stroke };
    }
  }
}

/** Maps `items`, keeping the same array when no item changes. */
function mapList<T>(items: readonly T[], map: (item: T) => T): readonly T[] {
  let changed = false;
  const next = items.map((item) => {
    const mapped = map(item);
    if (mapped !== item) changed = true;
    return mapped;
  });
  return changed ? next : items;
}

function mapSheetColors<S extends Sheet>(sheet: S, update: ColorSlotUpdate): S {
  const background = mapSlot(sheet, sheet.background, sheet.backgroundSwatchId, update, (next) => ({
    ...sheet,
    background: next.color,
    backgroundSwatchId: next.swatchId,
  }));
  const elements = mapList(sheet.elements, (element) => mapElementColors(element, update));
  return elements === sheet.elements ? background : { ...background, elements };
}

function mapRuleColors(rule: PageNumberRule, update: ColorSlotUpdate): PageNumberRule {
  const colored = mapTextColors(rule.style, update);
  const stroke = mapStroke(rule.style.stroke, update);
  if (colored === rule.style && stroke === rule.style.stroke) return rule;
  return { ...rule, style: { ...colored, stroke } };
}

/**
 * Runs `update` once on every color field of the document: elements on pages and master pages
 * (text color and shadow, shape fill, stroke, label color and shadow), page and master
 * backgrounds, text styles (color, shadow) and page number rules (color, shadow, border).
 * Every function below is built on this one, so a new color field only needs adding here.
 *
 * Args:
 *   document: Document.
 *   update: New value of a field; returning the same color and link leaves it untouched.
 *
 * Returns:
 *   The new document, or the same one when nothing changes (unchanged parts keep their references).
 */
export function mapColorSlots(document: EditorDocument, update: ColorSlotUpdate): EditorDocument {
  const pages = mapList(document.pages, (page) => mapSheetColors(page, update));
  const masters = mapList(document.masters, (master) => mapSheetColors(master, update));
  const textStyles = mapList(document.textStyles, (style) => mapTextColors(style, update));
  const pageNumberRules = mapList(document.pageNumberRules, (rule) => mapRuleColors(rule, update));
  if (
    pages === document.pages &&
    masters === document.masters &&
    textStyles === document.textStyles &&
    pageNumberRules === document.pageNumberRules
  ) {
    return document;
  }
  return { ...document, pages, masters, textStyles, pageNumberRules };
}

/**
 * How many color fields link to each swatch (a text with a linked color and a linked shadow
 * counts twice; text styles and page number rules count too).
 *
 * Args:
 *   document: Document.
 *
 * Returns:
 *   Count per swatch id; swatches nobody uses are missing.
 */
export function swatchUsage(document: EditorDocument): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  mapColorSlots(document, (slot) => {
    if (slot.swatchId !== null) counts.set(slot.swatchId, (counts.get(slot.swatchId) ?? 0) + 1);
    return slot;
  });
  return counts;
}

/**
 * A color linked to `swatch`: the swatch's RGB with the use's own alpha (`#rrggbbaa` stays
 * `#rrggbbaa`, the alpha digits unchanged).
 *
 * Args:
 *   color: Current color of the field.
 *   swatch: Swatch it follows.
 *
 * Returns:
 *   The field's new color.
 */
export function swatchColor(color: string, swatch: Swatch): string {
  return swatch.color + color.slice(7);
}

// 連結欄位 → 同一個物件裡它旁邊的顏色欄位
const LINK_FIELDS = [
  ["fillSwatchId", "fill"],
  ["swatchId", "color"],
  ["backgroundSwatchId", "background"],
] as const;

/**
 * Whether every swatch link inside a value (an element, a patch, a page, a text style, page number
 * rules…) names a swatch of the document, and the color next to it (when the same object carries
 * one) has that swatch's RGB. Links that are null or absent are fine. The reducer checks what it is
 * given with this, so linked colors always match their swatch.
 *
 * Args:
 *   document: Document whose swatches the links must name.
 *   value: Anything that may contain color fields, searched at every depth.
 *
 * Returns:
 *   True when every link is valid.
 */
export function hasValidSwatchLinks(document: EditorDocument, value: unknown): boolean {
  if (Array.isArray(value)) return value.every((item) => hasValidSwatchLinks(document, item));
  if (typeof value !== "object" || value === null) return true;
  const record = value as Record<string, unknown>;
  for (const [linkKey, colorKey] of LINK_FIELDS) {
    const id = record[linkKey];
    if (typeof id !== "string") continue;
    const swatch = document.swatches.find((candidate) => candidate.id === id);
    if (!swatch) return false;
    const color = record[colorKey];
    if (typeof color === "string" && color.slice(0, 7).toLowerCase() !== swatch.color) return false;
  }
  return Object.values(record).every((child) => hasValidSwatchLinks(document, child));
}

/** A swatch removed in the swatch dialog, and what its uses link to instead (null = unlink). */
export interface SwatchDeletion {
  readonly id: string;
  readonly replaceWith: string | null;
}

/**
 * Applies the swatch dialog: the new list (added, renamed, recolored, reordered swatches) plus the
 * removed ones. Uses of a recolored swatch take its new RGB; uses of a removed swatch move to its
 * replacement (its RGB, their own alpha) or keep their color and are unlinked.
 *
 * Args:
 *   document: Document.
 *   swatches: The new swatch list, in display order.
 *   deletions: Every swatch of the document missing from `swatches`, each exactly once.
 *
 * Returns:
 *   The new document (the same one when nothing changes), or null when the edit is invalid: a bad
 *   list, a deletion that is still listed or unknown, a replacement that is not in the new list,
 *   or an existing swatch neither kept nor deleted.
 */
export function applySwatchEdits(
  document: EditorDocument,
  swatches: readonly Swatch[],
  deletions: readonly SwatchDeletion[],
): EditorDocument | null {
  if (!isSwatchList(swatches)) return null;
  const next = new Map(swatches.map((swatch) => [swatch.id, swatch]));
  const removed = new Map(deletions.map((deletion) => [deletion.id, deletion.replaceWith]));
  const valid =
    removed.size === deletions.length &&
    deletions.every(
      (d) => !next.has(d.id) && document.swatches.some((s) => s.id === d.id) && (d.replaceWith === null || next.has(d.replaceWith)),
    ) &&
    document.swatches.every((swatch) => next.has(swatch.id) || removed.has(swatch.id));
  if (!valid) return null;

  const relinked = mapColorSlots(document, (slot) => {
    if (slot.swatchId === null) return slot;
    const kept = next.get(slot.swatchId);
    if (kept) return { color: swatchColor(slot.color, kept), swatchId: kept.id };
    const replaceWith = removed.get(slot.swatchId);
    if (replaceWith === undefined) return slot; // 連到不存在的色票：驗證不會讓它發生，保持原樣
    if (replaceWith === null) return { color: slot.color, swatchId: null };
    return { color: swatchColor(slot.color, next.get(replaceWith)!), swatchId: replaceWith };
  });
  const sameList =
    swatches.length === document.swatches.length &&
    swatches.every((swatch, i) => {
      const old = document.swatches[i];
      return swatch.id === old.id && swatch.name === old.name && swatch.color === old.color;
    });
  if (sameList) return relinked;
  return { ...relinked, swatches };
}

/**
 * Changes one swatch's name and / or color; every use of it follows the new color.
 *
 * Args:
 *   document: Document.
 *   id: Swatch to change.
 *   change: New name and / or color.
 *
 * Returns:
 *   The new document (the same one when nothing changes), or null when the swatch does not exist
 *   or the result is invalid (name taken, bad color).
 */
export function updateSwatch(
  document: EditorDocument,
  id: string,
  change: { readonly name?: string; readonly color?: string },
): EditorDocument | null {
  if (!document.swatches.some((swatch) => swatch.id === id)) return null;
  const swatches = document.swatches.map((swatch) => (swatch.id === id ? { ...swatch, ...change } : swatch));
  return applySwatchEdits(document, swatches, []);
}

/**
 * Removes one swatch; its uses move to `replaceWith` or keep their color and are unlinked.
 *
 * Args:
 *   document: Document.
 *   id: Swatch to remove.
 *   replaceWith: Another swatch, or null to unlink.
 *
 * Returns:
 *   The new document, or null when either swatch does not exist (or both are the same).
 */
export function deleteSwatch(document: EditorDocument, id: string, replaceWith: string | null): EditorDocument | null {
  const swatches = document.swatches.filter((swatch) => swatch.id !== id);
  if (swatches.length === document.swatches.length) return null;
  return applySwatchEdits(document, swatches, [{ id, replaceWith }]);
}
