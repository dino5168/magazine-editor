/**
 * 文字樣式（樣式表）的純邏輯。
 *
 * 物件照舊存完整的字型、字級、顏色…，另外記住連到哪個樣式（`styleId`）。覆寫不另外存：
 * 物件某一欄 ≠ 樣式的那一欄 = 那一欄被覆寫。改樣式時只改「和舊樣式相同」的欄位（`restyle`），
 * 所以畫布、量測與匯出都照舊讀物件上的值。計畫：`docs/01-Plans-2026-10/09-樣式系統-實作.md`。
 */
import { DEFAULT_FONT_OPTION } from "./fonts";
import { DEFAULT_LINE_HEIGHT, DEFAULT_TEXT_FILL, PLAIN_TEXT_DECORATION } from "./text-style";
import type { CanvasElement, EditorDocument, Sheet, StyledText, TextShadow, TextStyle, TextStyleDef } from "./types";
import { PAGE_NAME_MAX_LENGTH, isTextStyle, validateName } from "./validation";

export type { TextStyleDef };

/** Longest style name (code points); same as page names. */
export const TEXT_STYLE_NAME_MAX_LENGTH = PAGE_NAME_MAX_LENGTH;

/** Every field a text style sets; the mapped type makes a new `TextStyle` field a compile error here. */
const KEY_SET: { readonly [K in keyof TextStyle]: true } = {
  fontSize: true,
  fontFamily: true,
  fontStyle: true,
  italic: true,
  underline: true,
  strikethrough: true,
  shadow: true,
  lineHeight: true,
  letterSpacing: true,
  align: true,
  fill: true,
};

export const TEXT_STYLE_KEYS = Object.keys(KEY_SET) as readonly (keyof TextStyle)[];

export type TextStyleKey = keyof TextStyle;

/** Names of the style fields, for messages such as 「已覆寫：字級、顏色」. */
export const TEXT_STYLE_KEY_LABELS: { readonly [K in TextStyleKey]: string } = {
  fontSize: "字級",
  fontFamily: "字體",
  fontStyle: "粗體",
  italic: "斜體",
  underline: "底線",
  strikethrough: "刪除線",
  shadow: "陰影",
  lineHeight: "行距",
  letterSpacing: "字距",
  align: "對齊",
  fill: "顏色",
};

/** Ids of the built-in styles; fixed so Rust can add the same styles when upgrading old files. */
export const BUILT_IN_TEXT_STYLE_IDS = {
  heading: "text-style-heading",
  subheading: "text-style-subheading",
  body: "text-style-body",
} as const;

/** Line height of the built-in 內文 style: Chinese body text needs more room than headings. */
const BODY_LINE_HEIGHT = 1.5;

function builtIn(
  id: string,
  name: string,
  fontSize: number,
  fontStyle: TextStyle["fontStyle"],
  align: TextStyle["align"],
  lineHeight: number,
): TextStyleDef {
  return {
    id,
    name,
    fontSize,
    fontFamily: DEFAULT_FONT_OPTION.family,
    fontStyle,
    ...PLAIN_TEXT_DECORATION,
    lineHeight,
    letterSpacing: 0,
    align,
    fill: DEFAULT_TEXT_FILL,
  };
}

/**
 * Styles of a new document: 標題 / 副標題 (centered, line height 1.2) and 內文 (left aligned, 1.5). New text elements
 * (`createTextElement`) take their values from here.
 *
 * Returns:
 *   Three styles with the fixed `BUILT_IN_TEXT_STYLE_IDS`.
 */
export function defaultTextStyles(): readonly TextStyleDef[] {
  return [
    builtIn(BUILT_IN_TEXT_STYLE_IDS.heading, "標題", 32, "bold", "center", DEFAULT_LINE_HEIGHT),
    builtIn(BUILT_IN_TEXT_STYLE_IDS.subheading, "副標題", 20, "normal", "center", DEFAULT_LINE_HEIGHT),
    builtIn(BUILT_IN_TEXT_STYLE_IDS.body, "內文", 11, "normal", "left", BODY_LINE_HEIGHT),
  ];
}

function sameShadow(a: TextShadow | null, b: TextShadow | null): boolean {
  if (a === null || b === null) return a === b;
  return a.color === b.color && a.offsetX === b.offsetX && a.offsetY === b.offsetY;
}

/**
 * Whether two styles have the same value for one field (shadows compared by value).
 *
 * Args:
 *   a: One style.
 *   b: Other style.
 *   key: Field to compare.
 *
 * Returns:
 *   True when equal.
 */
export function sameStyleValue(a: TextStyle, b: TextStyle, key: TextStyleKey): boolean {
  return key === "shadow" ? sameShadow(a.shadow, b.shadow) : a[key] === b[key];
}

/**
 * Fields where a text differs from its style (= overridden).
 *
 * Args:
 *   target: Text element or shape label.
 *   style: The style it is linked to.
 *
 * Returns:
 *   Overridden fields in `TEXT_STYLE_KEYS` order; empty when it matches the style.
 */
export function styleOverrides(target: TextStyle, style: TextStyle): readonly TextStyleKey[] {
  return TEXT_STYLE_KEYS.filter((key) => !sameStyleValue(target, style, key));
}

/**
 * Only the text style fields of a value (e.g. to make a style from an element).
 *
 * Args:
 *   source: Text element, shape label or style.
 *
 * Returns:
 *   A plain `TextStyle`.
 */
export function pickTextStyle(source: TextStyle): TextStyle {
  return {
    fontSize: source.fontSize,
    fontFamily: source.fontFamily,
    fontStyle: source.fontStyle,
    italic: source.italic,
    underline: source.underline,
    strikethrough: source.strikethrough,
    shadow: source.shadow,
    lineHeight: source.lineHeight,
    letterSpacing: source.letterSpacing,
    align: source.align,
    fill: source.fill,
  };
}

/**
 * Sets the fields listed in `keys` from `from`; returns the same object when nothing changes.
 */
function withFields<T extends TextStyle>(target: T, from: TextStyle, keys: readonly TextStyleKey[]): T {
  const changed = keys.filter((key) => !sameStyleValue(target, from, key));
  if (changed.length === 0) return target;
  return { ...target, ...Object.fromEntries(changed.map((key) => [key, from[key]])) };
}

/**
 * Applies a style to a text: every style field takes the style's value (clears all overrides).
 * Does not set `styleId`; the caller links it.
 *
 * Args:
 *   target: Text element or shape label.
 *   style: Style to apply.
 *
 * Returns:
 *   The updated text, or the same object when it already matches.
 */
export function applyTextStyle<T extends TextStyle>(target: T, style: TextStyle): T {
  return withFields(target, style, TEXT_STYLE_KEYS);
}

/**
 * Follows a style change on a linked text: fields equal to the old style take the new value,
 * overridden fields (different from the old style) stay.
 *
 * Args:
 *   target: Text linked to the style.
 *   before: The style before the change.
 *   after: The style after the change.
 *
 * Returns:
 *   The updated text, or the same object when nothing changes.
 */
export function restyle<T extends TextStyle>(target: T, before: TextStyle, after: TextStyle): T {
  const following = TEXT_STYLE_KEYS.filter((key) => sameStyleValue(target, before, key));
  return withFields(target, after, following);
}

/**
 * Name of a new style: `樣式 1`, `樣式 2` … (the first unused number).
 *
 * Args:
 *   styles: Existing styles.
 *
 * Returns:
 *   An unused name.
 */
export function nextTextStyleName(styles: readonly TextStyleDef[]): string {
  const used = new Set(styles.map((style) => style.name));
  for (let n = 1; ; n++) if (!used.has(`樣式 ${n}`)) return `樣式 ${n}`;
}

/**
 * Why a style name cannot be used, for the style dialog and inline rename.
 *
 * Args:
 *   raw: Name as typed.
 *   styles: The style sheet.
 *   exceptId: The style being renamed (its own name is fine).
 *
 * Returns:
 *   A message, or null when the trimmed name is valid and unused.
 */
export function textStyleNameError(raw: string, styles: readonly TextStyleDef[], exceptId: string | null): string | null {
  const result = validateName(raw, TEXT_STYLE_NAME_MAX_LENGTH);
  if (result.error) return result.error.message;
  const taken = styles.some((style) => style.id !== exceptId && style.name === result.data);
  return taken ? `已經有名為「${result.data}」的樣式` : null;
}

/**
 * Name of a copy: 「內文 複本」, then 「內文 複本 2」… (unused, cut to fit the length limit).
 *
 * Args:
 *   name: Name of the style being copied.
 *   styles: The style sheet.
 *
 * Returns:
 *   An unused name.
 */
export function copyTextStyleName(name: string, styles: readonly TextStyleDef[]): string {
  const used = new Set(styles.map((style) => style.name));
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? " 複本" : ` 複本 ${n}`;
    const candidate = Array.from(name).slice(0, TEXT_STYLE_NAME_MAX_LENGTH - Array.from(suffix).length).join("") + suffix;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * Checks a style sheet entry: id 1–64 characters (Rust `require_id`), a trimmed name within
 * `TEXT_STYLE_NAME_MAX_LENGTH`, valid style fields.
 *
 * Args:
 *   value: Candidate style.
 *
 * Returns:
 *   True when it can be stored in the document.
 */
export function isTextStyleDef(value: unknown): value is TextStyleDef {
  if (!isTextStyle(value)) return false;
  const { id, name } = value as unknown as Record<string, unknown>;
  return (
    typeof id === "string" &&
    id.length > 0 &&
    id.length <= 64 &&
    typeof name === "string" &&
    validateName(name, TEXT_STYLE_NAME_MAX_LENGTH).data === name
  );
}

/**
 * Checks a whole style sheet: every entry valid, ids and names unique.
 *
 * Args:
 *   styles: Candidate style sheet.
 *
 * Returns:
 *   True when it can be stored as the document's style sheet.
 */
export function isTextStyleSheet(styles: readonly unknown[]): styles is readonly TextStyleDef[] {
  if (!styles.every(isTextStyleDef)) return false;
  const defs = styles as readonly TextStyleDef[];
  return new Set(defs.map((s) => s.id)).size === defs.length && new Set(defs.map((s) => s.name)).size === defs.length;
}

/**
 * Runs `update` on the styled text of an element: a text element itself, or a shape's label.
 * Returns the same element when there is none or nothing changes.
 */
export function mapElementText(element: CanvasElement, update: (text: StyledText) => StyledText): CanvasElement {
  if (element.type === "text") {
    const next = update(element);
    return next === element ? element : { ...element, ...next };
  }
  if (element.type === "shape" && element.label) {
    const label = update(element.label);
    return label === element.label ? element : { ...element, label: { ...element.label, ...label } };
  }
  return element;
}

function mapSheets<S extends Sheet>(sheets: readonly S[], update: (text: StyledText) => StyledText): readonly S[] {
  let changed = false;
  const next = sheets.map((sheet) => {
    let sheetChanged = false;
    const elements = sheet.elements.map((element) => {
      const mapped = mapElementText(element, update);
      if (mapped !== element) sheetChanged = true;
      return mapped;
    });
    if (!sheetChanged) return sheet;
    changed = true;
    return { ...sheet, elements };
  });
  return changed ? next : sheets;
}

/**
 * Runs `update` on every styled text of the document (text elements and shape labels, on pages and
 * master pages).
 *
 * Args:
 *   document: Document.
 *   update: Returns the same object when a text does not change.
 *
 * Returns:
 *   The new document, or the same one when nothing changes.
 */
export function mapStyledTexts(document: EditorDocument, update: (text: StyledText) => StyledText): EditorDocument {
  const pages = mapSheets(document.pages, update);
  const masters = mapSheets(document.masters, update);
  return pages === document.pages && masters === document.masters ? document : { ...document, pages, masters };
}

/**
 * Follows a style change in every text linked to it (`restyle`: overridden fields stay).
 *
 * Args:
 *   document: Document, still holding the old style in its sheet.
 *   id: Style that changes.
 *   style: New field values.
 *
 * Returns:
 *   The document with the style and its texts updated, or the same one when nothing changes or the
 *   style does not exist.
 */
export function restyleDocument(document: EditorDocument, id: string, style: TextStyle): EditorDocument {
  const before = document.textStyles.find((s) => s.id === id);
  if (!before) return document;
  const after: TextStyleDef = applyTextStyle(before, style);
  if (after === before) return document;
  const linked = mapStyledTexts(document, (text) => (text.styleId === id ? restyle(text, before, after) : text));
  return { ...linked, textStyles: document.textStyles.map((s) => (s.id === id ? after : s)) };
}

/**
 * Removes a style; its texts keep their look and are no longer linked.
 *
 * Args:
 *   document: Document.
 *   id: Style to remove.
 *
 * Returns:
 *   The new document, or the same one when the style does not exist.
 */
export function deleteTextStyle(document: EditorDocument, id: string): EditorDocument {
  if (!document.textStyles.some((s) => s.id === id)) return document;
  const unlinked = mapStyledTexts(document, (text) => (text.styleId === id ? { ...text, styleId: null } : text));
  return { ...unlinked, textStyles: document.textStyles.filter((s) => s.id !== id) };
}

/**
 * How many texts (text elements and shape labels, pages and master pages) are linked to each style.
 *
 * Args:
 *   document: Document.
 *
 * Returns:
 *   Count per style id; styles nobody uses are missing.
 */
export function textStyleUsage(document: EditorDocument): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  mapStyledTexts(document, (text) => {
    if (text.styleId !== null) counts.set(text.styleId, (counts.get(text.styleId) ?? 0) + 1);
    return text;
  });
  return counts;
}

/**
 * Links a text to a style and gives it the style's values (clears overrides); `null` only unlinks
 * and keeps the look.
 *
 * Args:
 *   text: Text element or shape label.
 *   style: Style to apply, or null to unlink.
 *
 * Returns:
 *   The updated text, or the same object when nothing changes.
 */
export function linkTextStyle<T extends StyledText>(text: T, style: TextStyleDef | null): T {
  if (style === null) return text.styleId === null ? text : { ...text, styleId: null };
  const applied = applyTextStyle(text, style);
  return applied.styleId === style.id ? applied : { ...applied, styleId: style.id };
}

/**
 * The styled text of an element: a text element itself or a shape's label.
 *
 * Args:
 *   element: Any element.
 *
 * Returns:
 *   The text, or null for images and shapes without a label.
 */
export function styledTextOf(element: CanvasElement): StyledText | null {
  if (element.type === "text") return element;
  if (element.type === "shape") return element.label;
  return null;
}
