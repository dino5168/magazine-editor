/**
 * 「字型」對話框的草稿（純邏輯，同色票的 `swatch-draft.ts`）：匯入、改名、改後備種類、換粗體檔、
 * 刪除都先改草稿，「確定」時一次交給 `font/applyEdits`。刪除時用到它的地方換成另一套字型；換過去的
 * 那套之後也被刪除時，跟著改到它的替代（不會指向已刪除的字型）。
 */
import { usesProjectFont } from "./fonts";
import { defaultFontName, fontNameError, type FontDeletion, type ProjectFontChange } from "./project-fonts";
import type { EditorDocument, FontFile, ProjectFont } from "./types";

export interface FontDraft {
  /** The list being edited, in menu order (names as typed, possibly invalid). */
  readonly fonts: readonly ProjectFont[];
  /** Fonts of the document removed in the dialog (new ones removed again are simply dropped). */
  readonly deletions: readonly FontDeletion[];
}

/**
 * Starts a draft from the document's fonts.
 *
 * Args:
 *   document: Document.
 *
 * Returns:
 *   Draft with nothing changed yet.
 */
export function startFontDraft(document: EditorDocument): FontDraft {
  return { fonts: document.fonts, deletions: [] };
}

/**
 * Adds an imported font at the end, named after the family in its file.
 *
 * Args:
 *   draft: Draft.
 *   id: New id (from the caller, so this stays pure; letters, digits, `-` and `_` only).
 *   regular: The imported file (`font_import`).
 *
 * Returns:
 *   The new draft.
 */
export function addDraftFont(draft: FontDraft, id: string, regular: FontFile): FontDraft {
  const trimmed = draft.fonts.map((font) => ({ ...font, name: font.name.trim() }));
  const font: ProjectFont = { id, name: defaultFontName(regular.fileFamily, trimmed), generic: "sans-serif", regular, bold: null };
  return { ...draft, fonts: [...draft.fonts, font] };
}

/**
 * Changes the name (as typed), fallback kind or bold file of one font in the draft.
 *
 * Args:
 *   draft: Draft.
 *   id: Font.
 *   change: Fields to change.
 *
 * Returns:
 *   The new draft.
 */
export function editDraftFont(draft: FontDraft, id: string, change: ProjectFontChange): FontDraft {
  return { ...draft, fonts: draft.fonts.map((font) => (font.id === id ? { ...font, ...change } : font)) };
}

/**
 * Removes a font from the draft. Its uses (and the uses already moved to it) switch to
 * `replaceWith`.
 *
 * Args:
 *   draft: Draft.
 *   id: Font to remove.
 *   replaceWith: CSS family of a built-in option or of another font of the draft.
 *   documentIds: Ids of the document's fonts (only those need a deletion entry).
 *
 * Returns:
 *   The new draft (the same one when the font is not in the draft or the replacement is itself).
 */
export function removeDraftFont(draft: FontDraft, id: string, replaceWith: string, documentIds: ReadonlySet<string>): FontDraft {
  if (!draft.fonts.some((font) => font.id === id) || usesProjectFont(replaceWith, id)) return draft;
  const deletions = draft.deletions.map((deletion) =>
    usesProjectFont(deletion.replaceWith, id) ? { ...deletion, replaceWith } : deletion,
  );
  return {
    fonts: draft.fonts.filter((font) => font.id !== id),
    deletions: documentIds.has(id) ? [...deletions, { id, replaceWith }] : deletions,
  };
}

/**
 * How many places will use each font of the draft after「確定」: its own uses plus the uses of
 * deleted fonts moved to it.
 *
 * Args:
 *   draft: Draft.
 *   usage: Uses per font id in the document (`fontUsage`).
 *
 * Returns:
 *   Count per font id of the draft (0 included).
 */
export function draftFontUsage(draft: FontDraft, usage: ReadonlyMap<string, number>): ReadonlyMap<string, number> {
  const counts = new Map(draft.fonts.map((font) => [font.id, usage.get(font.id) ?? 0]));
  for (const deletion of draft.deletions) {
    const target = draft.fonts.find((font) => usesProjectFont(deletion.replaceWith, font.id));
    if (target) counts.set(target.id, (counts.get(target.id) ?? 0) + (usage.get(deletion.id) ?? 0));
  }
  return counts;
}

/**
 * Name problems of the draft, for the messages next to the fields and the disabled「確定」.
 *
 * Args:
 *   draft: Draft.
 *
 * Returns:
 *   Message per font id that has one.
 */
export function draftFontNameErrors(draft: FontDraft): ReadonlyMap<string, string> {
  const trimmed = draft.fonts.map((font) => ({ ...font, name: font.name.trim() }));
  const errors = new Map<string, string>();
  for (const font of draft.fonts) {
    const error = fontNameError(font.name, trimmed, font.id);
    if (error) errors.set(font.id, error);
  }
  return errors;
}

/**
 * What「確定」sends (`font/applyEdits`): trimmed names, the deletions.
 *
 * Args:
 *   draft: Draft without name errors.
 *
 * Returns:
 *   Fonts and deletions.
 */
export function finishFontDraft(draft: FontDraft): FontDraft {
  return { fonts: draft.fonts.map((font) => (font.name === font.name.trim() ? font : { ...font, name: font.name.trim() })), deletions: draft.deletions };
}
