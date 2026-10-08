import type { AssetInfo } from "@/lib/editor/types";
import { descendants } from "./library-tree";
import type { Library, LibraryItem } from "./types";

/** What the manager's center column shows. */
export type LibraryView =
  | { readonly type: "all" }
  | { readonly type: "unsorted" }
  | { readonly type: "trash" }
  | { readonly type: "folder"; readonly id: string };

export const ALL_VIEW: LibraryView = { type: "all" };

/** Item counts for the folder tree; folder counts include subfolders. Trashed items only count in `trash`. */
export interface LibraryCounts {
  readonly all: number;
  readonly unsorted: number;
  readonly trash: number;
  readonly folders: ReadonlyMap<string, number>;
}

/**
 * Counts items for the left column in one pass over the items.
 *
 * Args:
 *   library: The library.
 *
 * Returns:
 *   Counts per system entry and per folder (including subfolders).
 */
export function libraryCounts(library: Library): LibraryCounts {
  const parentOf = new Map(library.folders.map((folder) => [folder.id, folder.parentId]));
  const folders = new Map<string, number>(library.folders.map((folder) => [folder.id, 0]));
  let all = 0;
  let unsorted = 0;
  let trash = 0;
  for (const item of library.items) {
    if (item.trashed) {
      trash += 1;
      continue;
    }
    all += 1;
    if (item.folderId === null) unsorted += 1;
    // 往上把每一層都加一；步數上限擋住循環資料
    let id: string | null | undefined = item.folderId;
    for (let steps = 0; id && steps <= library.folders.length; steps++) {
      folders.set(id, (folders.get(id) ?? 0) + 1);
      id = parentOf.get(id);
    }
  }
  return { all, unsorted, trash, folders };
}

/**
 * Items shown for a view, newest first (later in the array = newer when the time is equal).
 *
 * Args:
 *   library: The library.
 *   view: Selected entry of the left column.
 *   query: Name filter (case-insensitive substring); empty = no filter.
 *
 * Returns:
 *   Items to show.
 */
export function visibleItems(library: Library, view: LibraryView, query = ""): LibraryItem[] {
  let matches: (item: LibraryItem) => boolean;
  switch (view.type) {
    case "all":
      matches = (item) => !item.trashed;
      break;
    case "unsorted":
      matches = (item) => !item.trashed && item.folderId === null;
      break;
    case "trash":
      matches = (item) => item.trashed !== null;
      break;
    case "folder": {
      const ids = new Set(descendants(library.folders, view.id));
      matches = (item) => !item.trashed && item.folderId !== null && ids.has(item.folderId);
      break;
    }
  }
  const needle = query.trim().toLowerCase();
  return library.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => matches(item) && (needle === "" || item.name.toLowerCase().includes(needle)))
    .sort((a, b) => b.item.importedAt.localeCompare(a.item.importedAt) || b.index - a.index)
    .map(({ item }) => item);
}

/**
 * The folder new imports go to while a view is shown: the folder itself, otherwise 未分類.
 *
 * Args:
 *   view: Selected entry of the left column.
 *
 * Returns:
 *   Folder id, or null for 未分類.
 */
export function importFolderOf(view: LibraryView): string | null {
  return view.type === "folder" ? view.id : null;
}

/**
 * The image list written to `project.magproj` (`assets`) so an older app version still sees the
 * project's images. Includes the trash: an older app deletes image files missing from this list
 * when it opens the project.
 *
 * Args:
 *   library: The library.
 *
 * Returns:
 *   One entry per image item, in library order.
 */
export function projectAssets(library: Library): AssetInfo[] {
  return library.items
    .filter((item) => item.kind === "image")
    .map(({ src, name, width, height }) => ({ src, name, width, height }));
}

/**
 * How many trashed items in `ids` cannot go back to their folder (it was deleted) and will be
 * restored to 未分類 instead.
 *
 * Args:
 *   library: The library.
 *   ids: Items about to be restored.
 *
 * Returns:
 *   Count of items whose original folder no longer exists.
 */
export function restoredToUnsorted(library: Library, ids: readonly string[]): number {
  const folderIds = new Set(library.folders.map((folder) => folder.id));
  return library.items.filter(
    (item) => ids.includes(item.id) && item.trashed?.fromFolderId != null && !folderIds.has(item.trashed.fromFolderId),
  ).length;
}

/** What importing a file whose content is already stored means for the library. */
export type ImportOutcome = "new" | "duplicate" | "restore";

/**
 * Tells the import UI what `item/add` will do with a file (identical content gets the same `src`).
 *
 * Args:
 *   library: The library.
 *   src: Path returned by `library_import`.
 *
 * Returns:
 *   `new`, `duplicate` (already in the library, nothing added) or `restore` (in the trash; it is
 *   restored into the import folder).
 */
export function importOutcome(library: Library, src: string): ImportOutcome {
  const existing = library.items.find((item) => item.src === src);
  if (!existing) return "new";
  return existing.trashed ? "restore" : "duplicate";
}
