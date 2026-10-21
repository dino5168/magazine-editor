/**
 * 「下載免費字型」的精選清單：和 Rust 讀同一份 `src-tauri/fonts-catalog.json`（Rust 下載、驗證、快取；
 * 這裡只做畫面需要的整理）。計畫：`docs/05-Plans-字型/02-字型管理問題-實作.md`。
 */
import catalogJson from "../../../src-tauri/fonts-catalog.json";
import { guessFontGeneric } from "./font-draft";
import { usesProjectFont } from "./fonts";
import type { EditorDocument, FontFile, ProjectFont } from "./types";

/** One file of a catalog font (`CatalogFile` in Rust `project/font_catalog.rs`). */
export interface CatalogFile {
  readonly url: string;
  readonly archivePath?: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly fileSha256: string;
  readonly fileBytes: number;
}

/** One font of the catalog (`CatalogFont` in Rust). */
export interface CatalogFont {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly license: string;
  readonly homepage: string;
  readonly version: string;
  readonly regular: CatalogFile;
  readonly bold: CatalogFile | null;
}

export const FONT_CATALOG: readonly CatalogFont[] = (catalogJson as { readonly fonts: readonly CatalogFont[] }).fonts;

/** Same as Rust `HASH_HEX_LEN`: a stored asset is named by the first 32 hex digits of its SHA-256. */
const STORED_HASH_LENGTH = 32;

/** The content hash in a stored file's name (`assets/fonts/<hash>.<ext>`), or "" for another name. */
function storedHash(file: FontFile): string {
  const hash = file.src.split("/").pop()?.split(".")[0] ?? "";
  return hash.length === STORED_HASH_LENGTH ? hash : "";
}

/** The font's files: regular, then bold if any. */
function filesOf(font: CatalogFont): CatalogFile[] {
  return font.bold ? [font.regular, font.bold] : [font.regular];
}

/**
 * The catalog grouped by category, in catalog order.
 *
 * Returns:
 *   One entry per category with its fonts.
 */
export function catalogCategories(catalog: readonly CatalogFont[] = FONT_CATALOG): { readonly category: string; readonly fonts: CatalogFont[] }[] {
  const groups: { category: string; fonts: CatalogFont[] }[] = [];
  for (const font of catalog) {
    const group = groups.find((entry) => entry.category === font.category);
    if (group) group.fonts.push(font);
    else groups.push({ category: font.category, fonts: [font] });
  }
  return groups;
}

/**
 * How much adding a font downloads.
 *
 * Args:
 *   font: Catalog font.
 *   cached: Whether its files are in the local cache (`font_catalog_cached`).
 *
 * Returns:
 *   Bytes to download (a zip shared by regular and bold counts once); 0 when cached.
 */
export function catalogDownloadBytes(font: CatalogFont, cached: boolean): number {
  if (cached) return 0;
  const urls = new Map(filesOf(font).map((file) => [file.url, file.bytes]));
  return [...urls.values()].reduce((sum, bytes) => sum + bytes, 0);
}

/**
 * The catalog font a stored project font file came from: stored files are named by their content
 * hash, and catalog files are stored unchanged, so the name tells.
 *
 * Args:
 *   file: A project font's regular or bold file.
 *   catalog: The catalog.
 *
 * Returns:
 *   The catalog font, or null for a file from elsewhere (system font, the user's own file).
 */
export function catalogFontOfFile(file: FontFile, catalog: readonly CatalogFont[] = FONT_CATALOG): CatalogFont | null {
  const hash = storedHash(file);
  if (hash === "") return null;
  return catalog.find((font) => filesOf(font).some((entry) => entry.fileSha256.startsWith(hash))) ?? null;
}

/**
 * Catalog fonts already in a font list (their regular file is one of its regular files).
 *
 * Args:
 *   fonts: Project fonts (the dialog's draft).
 *
 * Returns:
 *   Ids of the catalog fonts in the list.
 */
export function catalogIdsInUse(fonts: readonly ProjectFont[], catalog: readonly CatalogFont[] = FONT_CATALOG): Set<string> {
  const hashes = new Set(fonts.map((font) => storedHash(font.regular)).filter((hash) => hash !== ""));
  return new Set(catalog.filter((font) => hashes.has(font.regular.fileSha256.slice(0, STORED_HASH_LENGTH))).map((font) => font.id));
}

/**
 * Name and missing-character fallback for a catalog font added to the project.
 *
 * Returns:
 *   The catalog name (not the file's, e.g.「源樣黑體月」); 明體 fall back to the serif font.
 */
export function catalogFontNaming(font: CatalogFont): { readonly name: string; readonly generic: ProjectFont["generic"] } {
  return { name: font.name, generic: font.category === "明體" ? "serif" : guessFontGeneric(font.name) };
}

/**
 * Megabytes for the list, e.g. 「4.9 MB」.
 */
export function formatMegabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * Project fonts whose licence the user should check before publishing a flip book: the book
 * carries the whole font file, which anyone can then download. Fonts from the download catalog
 * (SIL OFL) are fine; every other file (system fonts, the user's own files) is reported.
 *
 * Args:
 *   document: Document being exported. Counted: texts and shape labels on pages and master pages,
 *     and page numbers (text styles that no text uses are not exported, so they do not count).
 *
 * Returns:
 *   The fonts to mention, in the document's font order.
 */
export function fontsToCheckBeforePublishing(document: EditorDocument, catalog: readonly CatalogFont[] = FONT_CATALOG): ProjectFont[] {
  const families: string[] = document.pageNumberRules.map((rule) => rule.style.fontFamily);
  for (const sheet of [...document.pages, ...document.masters]) {
    for (const element of sheet.elements) {
      if (element.type === "text") families.push(element.fontFamily);
      else if (element.type === "shape" && element.label) families.push(element.label.fontFamily);
    }
  }
  return document.fonts.filter(
    (font) =>
      families.some((family) => usesProjectFont(family, font.id)) &&
      [font.regular, ...(font.bold ? [font.bold] : [])].some((file) => catalogFontOfFile(file, catalog) === null),
  );
}
