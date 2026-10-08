import { descendants, dropParent, folderChainLength, folderMoveError, folderPath, type FolderDropZone } from "./library-tree";
import { folderNameError, itemNameError } from "./library-validation";
import { LIBRARY_DEPTH_MAX, type Library, type LibraryFolder, type LibraryItem, type Trashed } from "./types";

/**
 * Changes to the asset library. New ids and timestamps come from the caller, so the reducer stays
 * pure. Invalid actions are no-ops: the reducer returns the same state (the UI checks first with
 * `folderNameError` / `itemNameError` / `folderMoveError` and shows the message).
 */
export type LibraryAction =
  | { readonly type: "library/load"; readonly library: Library }
  /** Same `src` already in the library: no-op, or restore into `item.folderId` when it is in the trash. */
  | { readonly type: "item/add"; readonly item: LibraryItem }
  | { readonly type: "item/move"; readonly ids: readonly string[]; readonly folderId: string | null }
  | { readonly type: "item/rename"; readonly id: string; readonly name: string }
  | { readonly type: "item/trash"; readonly ids: readonly string[]; readonly at: string }
  /** `folderId` omitted = back to where it came from (未分類 when that folder is gone). */
  | { readonly type: "item/restore"; readonly ids: readonly string[]; readonly folderId?: string | null }
  /** Only items in the trash; their files are removed by the next open's cleanup. */
  | { readonly type: "item/purge"; readonly ids: readonly string[] }
  | { readonly type: "trash/empty" }
  | { readonly type: "folder/add"; readonly folder: LibraryFolder }
  | { readonly type: "folder/rename"; readonly id: string; readonly name: string }
  | {
      readonly type: "folder/move";
      readonly id: string;
      /** Folder row it is dropped on; `null` with `zone: "root"`. */
      readonly targetId: string | null;
      readonly zone: FolderDropZone;
    }
  /** Deletes the folder and its subfolders; their items go to the trash. */
  | { readonly type: "folder/delete"; readonly id: string; readonly at: string };

type ActionOf<T extends LibraryAction["type"]> = Extract<LibraryAction, { type: T }>;
type ActionHandler<T extends LibraryAction["type"]> = (state: Library, action: ActionOf<T>) => Library;

const folderExists = (library: Library, id: string | null): boolean =>
  id === null || library.folders.some((folder) => folder.id === id);

/** Applies `update` to every item; returns the same library when nothing changed. */
function mapItems(library: Library, update: (item: LibraryItem) => LibraryItem): Library {
  let changed = false;
  const items = library.items.map((item) => {
    const next = update(item);
    if (next !== item) changed = true;
    return next;
  });
  return changed ? { ...library, items } : library;
}

function trashedFrom(library: Library, folderId: string | null, at: string): Trashed {
  const path = folderId === null ? [] : folderPath(library.folders, folderId);
  return { at, fromFolderId: folderId, fromName: path.length ? path.join(" / ") : null };
}

function restoreInto(item: LibraryItem, folderId: string | null): LibraryItem {
  return { ...item, folderId, trashed: null };
}

const HANDLERS: { readonly [T in LibraryAction["type"]]: ActionHandler<T> } = {
  "library/load": (state, action) => (action.library === state ? state : action.library),

  "item/add": (state, { item }) => {
    if (!folderExists(state, item.folderId) || item.trashed) return state;
    const existing = state.items.find((candidate) => candidate.src === item.src);
    if (existing) {
      // 同一個檔案只留一筆；在垃圾桶就還原到這次匯入的資料夾
      return existing.trashed
        ? mapItems(state, (candidate) => (candidate === existing ? restoreInto(candidate, item.folderId) : candidate))
        : state;
    }
    if (state.items.some((candidate) => candidate.id === item.id) || itemNameError(item.name)) return state;
    return { ...state, items: [...state.items, { ...item, name: item.name.trim() }] };
  },

  "item/move": (state, { ids, folderId }) => {
    if (!folderExists(state, folderId)) return state;
    return mapItems(state, (item) =>
      ids.includes(item.id) && !item.trashed && item.folderId !== folderId ? { ...item, folderId } : item,
    );
  },

  "item/rename": (state, { id, name }) => {
    if (itemNameError(name)) return state;
    const trimmed = name.trim();
    return mapItems(state, (item) => (item.id === id && item.name !== trimmed ? { ...item, name: trimmed } : item));
  },

  "item/trash": (state, { ids, at }) =>
    mapItems(state, (item) =>
      ids.includes(item.id) && !item.trashed
        ? { ...item, folderId: null, trashed: trashedFrom(state, item.folderId, at) }
        : item,
    ),

  "item/restore": (state, { ids, folderId }) => {
    if (folderId !== undefined && !folderExists(state, folderId)) return state;
    return mapItems(state, (item) => {
      if (!ids.includes(item.id) || !item.trashed) return item;
      const from = item.trashed.fromFolderId;
      const target = folderId !== undefined ? folderId : folderExists(state, from) ? from : null;
      return restoreInto(item, target);
    });
  },

  "item/purge": (state, { ids }) => {
    const items = state.items.filter((item) => !(item.trashed && ids.includes(item.id)));
    return items.length === state.items.length ? state : { ...state, items };
  },

  "trash/empty": (state) => {
    const items = state.items.filter((item) => !item.trashed);
    return items.length === state.items.length ? state : { ...state, items };
  },

  "folder/add": (state, { folder }) => {
    if (state.folders.some((existing) => existing.id === folder.id)) return state;
    if (!folderExists(state, folder.parentId) || folder.name !== folder.name.trim()) return state;
    if (folderNameError(state.folders, folder.parentId, folder.name)) return state;
    const parentLength = folder.parentId === null ? 0 : (folderChainLength(state.folders, folder.parentId) ?? LIBRARY_DEPTH_MAX);
    if (parentLength + 1 > LIBRARY_DEPTH_MAX) return state;
    return { ...state, folders: [...state.folders, folder] };
  },

  "folder/rename": (state, { id, name }) => {
    const folder = state.folders.find((candidate) => candidate.id === id);
    if (!folder || folderNameError(state.folders, folder.parentId, name, id)) return state;
    const trimmed = name.trim();
    if (trimmed === folder.name) return state;
    return { ...state, folders: state.folders.map((f) => (f.id === id ? { ...f, name: trimmed } : f)) };
  },

  "folder/move": (state, { id, targetId, zone }) => {
    if (folderMoveError(state.folders, id, targetId, zone)) return state;
    if (targetId === id) return state;
    const folder = state.folders.find((candidate) => candidate.id === id)!;
    const parentId = dropParent(state.folders, targetId, zone);
    const others = state.folders.filter((candidate) => candidate.id !== id);
    // 陣列順序就是同一層的順序：前 / 後插在目標旁邊，放進 / 最上層放在最後
    const targetIndex = others.findIndex((candidate) => candidate.id === targetId);
    const index = zone === "before" ? targetIndex : zone === "after" ? targetIndex + 1 : others.length;
    const moved = parentId === folder.parentId ? folder : { ...folder, parentId };
    const folders = [...others.slice(0, index), moved, ...others.slice(index)];
    const unchanged = folders.every((candidate, i) => candidate === state.folders[i]);
    return unchanged ? state : { ...state, folders };
  },

  "folder/delete": (state, { id, at }) => {
    if (!state.folders.some((folder) => folder.id === id)) return state;
    const removed = new Set(descendants(state.folders, id));
    const items = state.items.map((item) =>
      item.folderId !== null && removed.has(item.folderId)
        ? { ...item, folderId: null, trashed: trashedFrom(state, item.folderId, at) }
        : item,
    );
    return { ...state, folders: state.folders.filter((folder) => !removed.has(folder.id)), items };
  },
};

/**
 * Pure reducer for the asset library.
 *
 * Args:
 *   state: Current library.
 *   action: Change to apply.
 *
 * Returns:
 *   The new library, or the same reference when the action changes nothing or is invalid.
 */
export function libraryReducer(state: Library, action: LibraryAction): Library {
  // 以 mapped type 保證每個 action type 都有 handler；此處的 cast 只是把關聯型別交給 TS
  const handler = HANDLERS[action.type] as ActionHandler<LibraryAction["type"]>;
  return handler(state, action);
}
