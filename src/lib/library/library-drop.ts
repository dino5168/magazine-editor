import { libraryReducer, type LibraryAction } from "./library-reducer";
import { folderMoveError } from "./library-tree";
import type { Library } from "./types";

/** What is being dragged in the asset manager. */
export type LibraryDragPayload =
  | { readonly type: "items"; readonly ids: readonly string[] }
  | { readonly type: "folder"; readonly id: string };

/** Where the pointer is: a folder row (with the part of the row), a system entry, or the 資料夾 header. */
export type LibraryDropTarget =
  | { readonly type: "folder"; readonly id: string; readonly zone: "before" | "into" | "after" }
  | { readonly type: "unsorted" }
  | { readonly type: "trash" }
  | { readonly type: "all" }
  /** The 資料夾 header: moves a folder to the end of the top level. */
  | { readonly type: "root" };

/**
 * What dropping would do: an action, an explanation why it is refused, or nothing (not a target
 * for this payload, or nothing would change).
 */
export type LibraryDropResult = { readonly action: LibraryAction } | { readonly error: string } | null;

function itemsDrop(library: Library, ids: readonly string[], target: LibraryDropTarget, at: string): LibraryAction | null {
  const fromTrash = library.items.some((item) => ids.includes(item.id) && item.trashed);
  switch (target.type) {
    case "folder":
    case "unsorted": {
      const folderId = target.type === "folder" ? target.id : null;
      // 從垃圾桶拖回資料夾 = 還原到那裡
      return fromTrash ? { type: "item/restore", ids, folderId } : { type: "item/move", ids, folderId };
    }
    case "trash":
      return fromTrash ? null : { type: "item/trash", ids, at };
    case "all":
    case "root":
      return null;
  }
}

function folderDrop(library: Library, id: string, target: LibraryDropTarget): LibraryDropResult {
  if (target.type !== "folder" && target.type !== "root") return null;
  const targetId = target.type === "folder" ? target.id : null;
  const zone = target.type === "folder" ? target.zone : "root";
  const error = folderMoveError(library.folders, id, targetId, zone);
  // 放回自己身上不算錯誤，只是沒有動作
  if (error) return targetId === id ? null : { error };
  return { action: { type: "folder/move", id, targetId, zone } };
}

/**
 * Decides what a drop in the asset manager does. Items dropped on a folder row always go into it
 * (the before / after part only matters for folders).
 *
 * Args:
 *   library: Current library.
 *   payload: What is dragged.
 *   target: Where it is dropped.
 *   at: Timestamp for moving items to the trash.
 *
 * Returns:
 *   The action, a refusal message in Traditional Chinese, or null.
 */
export function libraryDropResult(
  library: Library,
  payload: LibraryDragPayload,
  target: LibraryDropTarget,
  at: string,
): LibraryDropResult {
  const result =
    payload.type === "items"
      ? (() => {
          const action = itemsDrop(library, payload.ids, target, at);
          return action ? { action } : null;
        })()
      : folderDrop(library, payload.id, target);
  // 結果和現在一樣（例如拖回原本的資料夾）就當成沒有動作
  if (result && "action" in result && libraryReducer(library, result.action) === library) return null;
  return result;
}
