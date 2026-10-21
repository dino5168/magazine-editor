/**
 * 「字型」對話框的草稿（純邏輯，同色票的 `swatch-draft.ts`）：匯入、改名、改後備種類、換粗體檔、
 * 刪除都先改草稿，「確定」時一次交給 `font/applyEdits`。刪除時用到它的地方換成另一套字型；換過去的
 * 那套之後也被刪除時，跟著改到它的替代（不會指向已刪除的字型）。
 */
import { usesProjectFont } from "./fonts";
import { defaultFontName, fontNameError, type FontDeletion, type ProjectFontChange } from "./project-fonts";
import { pairByWeight } from "./system-fonts";
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

/** What the「匯入字型檔」picker and the drop target accept (`.ttc` = font collection). */
export const FONT_FILE_ACCEPT = ".ttf,.otf,.ttc";

/**
 * Whether a dropped / picked file name looks like a font file the dialog takes.
 *
 * Args:
 *   name: File name.
 *
 * Returns:
 *   True for `.ttf`, `.otf` and `.ttc` (any case).
 */
export function isFontFileName(name: string): boolean {
  return /\.(ttf|otf|ttc)$/i.test(name);
}

/**
 * Whether the bytes are a font collection (`ttcf` header), whose face must be chosen first.
 *
 * Args:
 *   bytes: File content.
 *
 * Returns:
 *   True for a TTC / OTC.
 */
export function isFontCollection(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x74 && bytes[1] === 0x74 && bytes[2] === 0x63 && bytes[3] === 0x66;
}

/** A regular file and its bold, to become one project font. */
export interface FontFilePair {
  readonly regular: FontFile;
  readonly bold: FontFile | null;
}

const ITALIC_STYLE = /italic|oblique|斜/i;

/**
 * Turns the files imported in one go into project fonts: files of the same family become one font
 * with regular and bold (the system-font rule, `pairByWeight`); every other file is a font of its own.
 *
 * Args:
 *   files: Stored files, in the order the user gave them (the same file twice counts once).
 *
 * Returns:
 *   Fonts to add, in the order their first file appeared.
 */
export function pairImportedFonts(files: readonly FontFile[]): FontFilePair[] {
  const unique = files.filter((file, index) => files.findIndex((other) => other.src === file.src) === index);
  const groups = new Map<string, FontFile[]>();
  for (const file of unique) {
    // 斜體不配對，自己一套
    const key = ITALIC_STYLE.test(file.fileStyle) ? `\u0000${file.src}` : file.fileFamily.normalize("NFKC").trim().toLowerCase();
    const group = groups.get(key);
    if (group) group.push(file);
    else groups.set(key, [file]);
  }
  const pairs: { readonly first: number; readonly pair: FontFilePair }[] = [];
  for (const group of groups.values()) {
    const { regular, bold } = pairByWeight(group);
    if (regular) pairs.push({ first: Math.min(unique.indexOf(regular), bold ? unique.indexOf(bold) : Infinity), pair: { regular, bold } });
    for (const file of group) {
      if (file !== regular && file !== bold) pairs.push({ first: unique.indexOf(file), pair: { regular: file, bold: null } });
    }
  }
  return pairs.sort((a, b) => a.first - b.first).map(({ pair }) => pair);
}

// 名稱看起來是明體 / 宋體 / 楷體 / 仿宋：缺字用明體類比較接近（使用者可以再改）
const SERIF_NAME = /明|宋|楷|仿|serif|song|ming|kai|fangsong/i;

/**
 * Guesses which built-in Chinese font should fill in missing characters, from a family name.
 *
 * Args:
 *   family: Family name inside the file.
 *
 * Returns:
 *   `serif` for 明體 / 宋體 / 楷體-like names, `sans-serif` otherwise.
 */
export function guessFontGeneric(family: string): ProjectFont["generic"] {
  return SERIF_NAME.test(family) && !/sans/i.test(family) ? "serif" : "sans-serif";
}

/**
 * Adds an imported font at the end, named after the family in its file.
 *
 * Args:
 *   draft: Draft.
 *   id: New id (from the caller, so this stays pure; letters, digits, `-` and `_` only).
 *   regular: The imported file (`font_import`).
 *   bold: Its bold file, when added together (from the system font list).
 *   naming: Name and fallback to use instead of the file's (fonts from the download catalog).
 *
 * Returns:
 *   The new draft.
 */
export function addDraftFont(
  draft: FontDraft,
  id: string,
  regular: FontFile,
  bold: FontFile | null = null,
  naming?: { readonly name: string; readonly generic: ProjectFont["generic"] },
): FontDraft {
  const trimmed = draft.fonts.map((font) => ({ ...font, name: font.name.trim() }));
  // 斜體檔自己一套時，名稱帶上樣式（「Arial Italic」，不是「Arial 2」）
  const fileName = ITALIC_STYLE.test(regular.fileStyle) ? `${regular.fileFamily} ${regular.fileStyle}` : regular.fileFamily;
  const font: ProjectFont = {
    id,
    name: defaultFontName(naming?.name ?? fileName, trimmed),
    generic: naming?.generic ?? guessFontGeneric(regular.fileFamily),
    regular,
    bold,
  };
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
