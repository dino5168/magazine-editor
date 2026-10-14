/**
 * 專案字型（`EditorDocument.fonts`）的純邏輯：名稱、使用處、改名 / 改後備 / 換粗體檔、刪除時替換。
 *
 * 文字、圖形內文字、文字樣式、頁碼都把字型存成 CSS `fontFamily` 字串；專案字型的字串是
 * `"project-font-<id>", <後備>`（`projectFontOption`），只看第一個家族名稱認字型（`findFontOption`）。
 * 計畫：`docs/05-Plans-字型/01-專案字型-實作.md`。
 */
import { FONT_OPTIONS, findFontOption, projectFontOption, usesProjectFont } from "./fonts";
import { mapStyledTexts } from "./style-sheet";
import type { EditorDocument, FontFile, ProjectFont } from "./types";
import { FONT_NAME_MAX_LENGTH, isProjectFontList, validateName } from "./validation";

/** What `font/update` may change; the id and the regular file stay. */
export interface ProjectFontChange {
  readonly name?: string;
  readonly generic?: ProjectFont["generic"];
  readonly bold?: FontFile | null;
}

/**
 * Why a project font name cannot be used. Built-in font names are taken too: the font menu lists
 * both, and two「明體」would be indistinguishable.
 *
 * Args:
 *   raw: Name as typed.
 *   fonts: The project fonts.
 *   exceptId: The font being renamed (its own name is fine).
 *
 * Returns:
 *   A message, or null when the trimmed name is valid and unused.
 */
export function fontNameError(raw: string, fonts: readonly ProjectFont[], exceptId: string | null): string | null {
  const result = validateName(raw, FONT_NAME_MAX_LENGTH);
  if (result.error) return result.error.message;
  const name = result.data;
  if (FONT_OPTIONS.some((option) => option.label === name)) return `「${name}」是內建字型的名稱`;
  return fonts.some((font) => font.id !== exceptId && font.name === name) ? `已經有名為「${name}」的字型` : null;
}

/**
 * Name of a newly imported font: the family name inside the file (or「字型」), made unique with
 * ` 2`, ` 3` … and cut to the length limit.
 *
 * Args:
 *   fileFamily: `FontFile.fileFamily` of the regular file.
 *   fonts: Existing project fonts.
 *
 * Returns:
 *   A name `fontNameError` accepts.
 */
export function defaultFontName(fileFamily: string, fonts: readonly ProjectFont[]): string {
  const base = Array.from(fileFamily.trim() || "字型").slice(0, FONT_NAME_MAX_LENGTH - 4).join("").trim();
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base} ${n}`;
    if (fontNameError(name, fonts, null) === null) return name;
  }
}

/**
 * Runs `update` on every `fontFamily` of the document: text elements and shape labels (pages and
 * master pages), text styles and page number rules.
 *
 * Args:
 *   document: Document.
 *   update: Returns the same string when a family does not change.
 *
 * Returns:
 *   The new document, or the same one when nothing changes.
 */
export function mapFontFamilies(document: EditorDocument, update: (family: string) => string): EditorDocument {
  const texts = mapStyledTexts(document, (text) => {
    const fontFamily = update(text.fontFamily);
    return fontFamily === text.fontFamily ? text : { ...text, fontFamily };
  });
  let stylesChanged = false;
  const textStyles = document.textStyles.map((style) => {
    const fontFamily = update(style.fontFamily);
    if (fontFamily === style.fontFamily) return style;
    stylesChanged = true;
    return { ...style, fontFamily };
  });
  let rulesChanged = false;
  const pageNumberRules = document.pageNumberRules.map((rule) => {
    const fontFamily = update(rule.style.fontFamily);
    if (fontFamily === rule.style.fontFamily) return rule;
    rulesChanged = true;
    return { ...rule, style: { ...rule.style, fontFamily } };
  });
  if (texts === document && !stylesChanged && !rulesChanged) return document;
  return {
    ...texts,
    textStyles: stylesChanged ? textStyles : document.textStyles,
    pageNumberRules: rulesChanged ? pageNumberRules : document.pageNumberRules,
  };
}

/**
 * How many places use a project font: texts (elements and shape labels), text styles, page number
 * rules.
 *
 * Args:
 *   document: Document.
 *   id: `ProjectFont.id`.
 *
 * Returns:
 *   The number of uses (0 = safe to delete without replacing).
 */
export function fontUsage(document: EditorDocument, id: string): number {
  let count = 0;
  mapFontFamilies(document, (family) => {
    if (usesProjectFont(family, id)) count++;
    return family;
  });
  return count;
}

/**
 * Adds a project font (`font/add`).
 *
 * Returns:
 *   The new document, or null when the font is invalid or its id / name is taken.
 */
export function addProjectFont(document: EditorDocument, font: ProjectFont): EditorDocument | null {
  if (fontNameError(font.name, document.fonts, null) !== null || font.name !== font.name.trim()) return null;
  const fonts = [...document.fonts, font];
  return isProjectFontList(fonts) ? { ...document, fonts } : null;
}

/**
 * Renames a project font, changes its fallback kind or its bold file (`font/update`). A new fallback
 * rewrites every use, so texts keep matching the menu's family string.
 *
 * Args:
 *   document: Document.
 *   id: The font.
 *   change: Fields to change (`name` is trimmed).
 *
 * Returns:
 *   The new document (the same one when nothing changes), or null when the font does not exist or
 *   the change is invalid.
 */
export function updateProjectFont(document: EditorDocument, id: string, change: ProjectFontChange): EditorDocument | null {
  const before = document.fonts.find((font) => font.id === id);
  if (!before) return null;
  const name = change.name?.trim() ?? before.name;
  if (name !== before.name && fontNameError(name, document.fonts, id) !== null) return null;
  const after: ProjectFont = { ...before, name, generic: change.generic ?? before.generic, bold: change.bold === undefined ? before.bold : change.bold };
  if (after.name === before.name && after.generic === before.generic && after.bold === before.bold) return document;
  const fonts = document.fonts.map((font) => (font.id === id ? after : font));
  if (!isProjectFontList(fonts)) return null;
  const withFonts = { ...document, fonts };
  if (after.generic === before.generic) return withFonts;
  const stack = projectFontOption(after).family;
  return mapFontFamilies(withFonts, (family) => (usesProjectFont(family, id) ? stack : family));
}

/** A project font removed in the font dialog and the family its uses switch to. */
export interface FontDeletion {
  readonly id: string;
  /** CSS family of a built-in option or of a font in the new list. */
  readonly replaceWith: string;
}

/**
 * The font dialog's「確定」(`font/applyEdits`): the whole new list (renamed, new fallback, new bold
 * file, imported fonts) plus the deleted fonts, in one step. Uses of deleted fonts switch to their
 * replacement; every use of a remaining font is rewritten to its current family string (so a new
 * fallback kind reaches the texts).
 *
 * Args:
 *   document: Document.
 *   fonts: The new list (trimmed names).
 *   deletions: Fonts of the document no longer in the list, with their replacements.
 *
 * Returns:
 *   The new document (the same one when nothing changes), or null when the list is invalid, a font
 *   of the document is missing without a deletion entry, or a replacement is not a menu font.
 */
export function applyFontEdits(
  document: EditorDocument,
  fonts: readonly ProjectFont[],
  deletions: readonly FontDeletion[],
): EditorDocument | null {
  if (!isProjectFontList(fonts) || fonts.some((font) => fontNameError(font.name, fonts, font.id) !== null || font.name !== font.name.trim())) {
    return null;
  }
  const kept = new Set(fonts.map((font) => font.id));
  const deleted = new Map(deletions.map((deletion) => [deletion.id, deletion.replaceWith]));
  for (const font of document.fonts) {
    if (kept.has(font.id) === deleted.has(font.id)) return null;
  }
  const replacements = new Map<string, string>();
  for (const [id, replaceWith] of deleted) {
    const replacement = findFontOption(replaceWith, fonts);
    if (!replacement) return null;
    replacements.set(id, replacement.family);
  }
  const stacks = new Map(fonts.map((font) => [font.id, projectFontOption(font).family]));
  const updated = mapFontFamilies(document, (family) => {
    for (const [id, replacement] of replacements) if (usesProjectFont(family, id)) family = replacement;
    for (const [id, stack] of stacks) if (usesProjectFont(family, id)) return stack;
    return family;
  });
  const sameFonts = fonts.length === document.fonts.length && fonts.every((font, index) => font === document.fonts[index]);
  if (updated === document && sameFonts) return document;
  return { ...updated, fonts };
}

/**
 * Deletes a project font; every use switches to `replaceWith` in the same step.
 *
 * Args:
 *   document: Document.
 *   id: The font to delete.
 *   replaceWith: CSS family of a built-in font option or of another project font.
 *
 * Returns:
 *   The new document, or null when the font does not exist or the replacement is not a font of the
 *   menu (unknown, or the deleted font itself).
 */
export function deleteProjectFont(document: EditorDocument, id: string, replaceWith: string): EditorDocument | null {
  if (!document.fonts.some((font) => font.id === id)) return null;
  const fonts = document.fonts.filter((font) => font.id !== id);
  const replacement = findFontOption(replaceWith, fonts);
  if (!replacement) return null;
  const replaced = mapFontFamilies(document, (family) => (usesProjectFont(family, id) ? replacement.family : family));
  return { ...replaced, fonts };
}
