import { folderChainLength } from "./library-tree";
import {
  FOLDER_NAME_MAX_CHARS,
  ITEM_NAME_MAX_CHARS,
  LIBRARY_DEPTH_MAX,
  TEXT_EXCERPT_MAX_CHARS,
  type Library,
  type LibraryFolder,
  type LibraryItem,
  type LibraryItemKind,
} from "./types";

/** Asset directory of each item kind; same as `LibraryItem::asset_dir` in Rust. */
export const ASSET_DIR_OF_KIND: { readonly [K in LibraryItemKind]: string } = {
  image: "assets/images",
  text: "assets/texts",
  audio: "assets/audio",
};

/** Longest id; same as Rust `format::require_id` (64 bytes; ids are UUIDs, so bytes = characters). */
const ID_MAX_LENGTH = 64;

/** Character count as Rust's `chars().count()` (code points, not UTF-16 units). */
const charCount = (text: string): number => [...text].length;

function nameError(name: string, max: number): string | null {
  if (name.trim() === "") return "名稱不可空白";
  if (/[\r\n]/.test(name)) return "名稱不可換行";
  if (charCount(name.trim()) > max) return `名稱最多 ${max} 個字`;
  return null;
}

/**
 * Checks a folder name typed by the user (it is stored trimmed).
 *
 * Args:
 *   folders: Existing folders.
 *   parentId: Folder the named folder is (or will be) in; `null` = top level.
 *   name: Name as typed.
 *   exceptId: The folder being renamed or moved, so it does not clash with itself.
 *
 * Returns:
 *   A message in Traditional Chinese, or null when the name can be used.
 */
export function folderNameError(
  folders: readonly LibraryFolder[],
  parentId: string | null,
  name: string,
  exceptId: string | null = null,
): string | null {
  const error = nameError(name, FOLDER_NAME_MAX_CHARS);
  if (error) return error;
  const trimmed = name.trim();
  const clash = folders.some((f) => f.id !== exceptId && f.parentId === parentId && f.name === trimmed);
  return clash ? `同一層已經有「${trimmed}」` : null;
}

/**
 * Checks an item name typed by the user (it is stored trimmed).
 *
 * Args:
 *   name: Name as typed.
 *
 * Returns:
 *   A message in Traditional Chinese, or null when the name can be used.
 */
export function itemNameError(name: string): string | null {
  return nameError(name, ITEM_NAME_MAX_CHARS);
}

/** `<dir>/<file>` with a plain file name; same rules as Rust `format::validate_asset_path_in`. */
export function isAssetPathIn(src: string, dir: string): boolean {
  if (!src.startsWith(`${dir}/`)) return false;
  const file = src.slice(dir.length + 1);
  return file !== "" && file !== "." && file !== ".." && !/[/\\:\0]/.test(file) && !file.startsWith(".");
}

const isStoredName = (name: string, max: number): boolean =>
  name !== "" && name.trim() === name && !/[\r\n]/.test(name) && charCount(name) <= max;

const isId = (id: string): boolean => id !== "" && id.length <= ID_MAX_LENGTH;

function itemProblem(item: LibraryItem, folderIds: ReadonlySet<string>): string | null {
  if (!isId(item.id)) return `invalid item id ${JSON.stringify(item.id)}`;
  if (!isStoredName(item.name, ITEM_NAME_MAX_CHARS)) return `invalid item name ${JSON.stringify(item.name)}`;
  if (!isAssetPathIn(item.src, ASSET_DIR_OF_KIND[item.kind])) return `invalid item src ${JSON.stringify(item.src)}`;
  if (item.folderId !== null && item.trashed !== null) return "trashed item is still in a folder";
  if (item.folderId !== null && !folderIds.has(item.folderId)) return `item folder ${item.folderId} does not exist`;
  switch (item.kind) {
    case "image": {
      const positive = (value: number) => Number.isFinite(value) && value > 0;
      return positive(item.width) && positive(item.height) ? null : "image item size must be positive";
    }
    case "text":
      return charCount(item.excerpt) <= TEXT_EXCERPT_MAX_CHARS ? null : "text excerpt is too long";
    case "audio":
      return null;
  }
}

/**
 * Checks a whole library with the same rules as Rust `library::validate_library`. Rust validates
 * every read and write; this is the frontend's invariant check (tests assert reducer results with it).
 *
 * Args:
 *   library: Library to check.
 *
 * Returns:
 *   Description of the first problem (English, for developers), or null when valid.
 */
export function libraryProblem(library: Library): string | null {
  if (library.libraryVersion !== 1) return `unsupported library version ${String(library.libraryVersion)}`;
  const { folders } = library;
  const folderIds = new Set(folders.map((folder) => folder.id));
  if (folderIds.size !== folders.length) return "duplicate folder id";
  const siblingNames = new Set<string>();
  for (const folder of folders) {
    if (!isId(folder.id)) return `invalid folder id ${JSON.stringify(folder.id)}`;
    if (!isStoredName(folder.name, FOLDER_NAME_MAX_CHARS)) return `invalid folder name ${JSON.stringify(folder.name)}`;
    const key = `${folder.parentId ?? ""}\u0000${folder.name}`;
    if (siblingNames.has(key)) return `duplicate folder name ${folder.name}`;
    siblingNames.add(key);
    if (folder.parentId !== null && !folderIds.has(folder.parentId)) return `folder parent ${folder.parentId} does not exist`;
    const depth = folderChainLength(folders, folder.id);
    if (depth === null) return "folder parents form a cycle";
    if (depth > LIBRARY_DEPTH_MAX) return `folder ${folder.name} is nested too deeply`;
  }
  const itemIds = new Set<string>();
  const sources = new Set<string>();
  for (const item of library.items) {
    const problem = itemProblem(item, folderIds);
    if (problem) return problem;
    if (itemIds.has(item.id)) return `duplicate item id ${item.id}`;
    if (sources.has(item.src)) return `duplicate item src ${item.src}`;
    itemIds.add(item.id);
    sources.add(item.src);
  }
  return null;
}
