import { LIBRARY_DEPTH_MAX, type LibraryFolder } from "./types";

/** Where a dragged folder lands relative to the row it is dropped on, or the top level. */
export type FolderDropZone = "before" | "into" | "after" | "root";

/**
 * Number of folders from the top level down to `id`, counting both.
 *
 * Args:
 *   folders: All folders.
 *   id: Folder id.
 *
 * Returns:
 *   1 for a top-level folder; null when the parents form a cycle or `id` / a parent is missing.
 */
export function folderChainLength(folders: readonly LibraryFolder[], id: string): number | null {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  let current = byId.get(id);
  let length = 0;
  while (current) {
    length += 1;
    // 步數超過資料夾總數就是循環
    if (length > folders.length) return null;
    if (current.parentId === null) return length;
    current = byId.get(current.parentId);
  }
  return null;
}

/**
 * A folder and everything nested in it.
 *
 * Args:
 *   folders: All folders.
 *   id: Folder id.
 *
 * Returns:
 *   Ids with `id` first, then its descendants (breadth first).
 */
export function descendants(folders: readonly LibraryFolder[], id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) {
    for (const folder of folders) if (folder.parentId === out[i] && !out.includes(folder.id)) out.push(folder.id);
  }
  return out;
}

/** Levels in the subtree rooted at `id` (1 = no subfolders). */
function subtreeHeight(folders: readonly LibraryFolder[], id: string): number {
  const children = folders.filter((folder) => folder.parentId === id);
  return 1 + Math.max(0, ...children.map((child) => subtreeHeight(folders, child.id)));
}

/**
 * Names from the top level down to a folder.
 *
 * Args:
 *   folders: All folders.
 *   id: Folder id.
 *
 * Returns:
 *   Names, top level first; empty when the folder does not exist.
 */
export function folderPath(folders: readonly LibraryFolder[], id: string): string[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const names: string[] = [];
  for (let folder = byId.get(id); folder && names.length <= folders.length; folder = byId.get(folder.parentId ?? "")) {
    names.unshift(folder.name);
    if (folder.parentId === null) break;
  }
  return names;
}

/**
 * The parent a folder gets when dropped in `zone` of `targetId`.
 *
 * Args:
 *   folders: All folders.
 *   targetId: Folder row it is dropped on (ignored for `root`).
 *   zone: Drop zone.
 *
 * Returns:
 *   New parent id (`null` = top level).
 */
export function dropParent(folders: readonly LibraryFolder[], targetId: string | null, zone: FolderDropZone): string | null {
  if (zone === "root" || targetId === null) return null;
  if (zone === "into") return targetId;
  return folders.find((folder) => folder.id === targetId)?.parentId ?? null;
}

/**
 * Checks whether a folder can be moved; the message explains why not.
 *
 * Args:
 *   folders: All folders.
 *   id: Folder being dragged.
 *   targetId: Folder row it is dropped on (`null` with `zone: "root"`).
 *   zone: Drop zone.
 *
 * Returns:
 *   A message in Traditional Chinese, or null when the move is allowed (including moves that
 *   change nothing).
 */
export function folderMoveError(
  folders: readonly LibraryFolder[],
  id: string,
  targetId: string | null,
  zone: FolderDropZone,
): string | null {
  const folder = folders.find((candidate) => candidate.id === id);
  if (!folder) return "找不到資料夾";
  if (targetId !== null && zone !== "root") {
    if (!folders.some((candidate) => candidate.id === targetId)) return "找不到資料夾";
    if (targetId === id) return zone === "into" ? "不能放進自己裡面" : null;
    if (descendants(folders, id).includes(targetId)) return "不能放進自己的子資料夾";
  }
  const parentId = dropParent(folders, targetId, zone);
  // 名稱本身已經合法，只需要檢查新的一層有沒有同名
  const clash = folders.some((f) => f.id !== id && f.parentId === parentId && f.name === folder.name);
  if (parentId !== folder.parentId && clash) return `同一層已經有「${folder.name}」`;
  const parentLength = parentId === null ? 0 : (folderChainLength(folders, parentId) ?? LIBRARY_DEPTH_MAX);
  if (parentLength + subtreeHeight(folders, id) > LIBRARY_DEPTH_MAX) return `資料夾最多 ${LIBRARY_DEPTH_MAX} 層`;
  return null;
}

/**
 * Drop zone from the pointer position on a folder row: upper quarter = before, lower quarter =
 * after, the middle = into.
 *
 * Args:
 *   top: Row top (px).
 *   height: Row height (px).
 *   y: Pointer y (px), same coordinate space as `top`.
 *
 * Returns:
 *   Drop zone.
 */
export function treeDropZone(top: number, height: number, y: number): Exclude<FolderDropZone, "root"> {
  const ratio = height > 0 ? (y - top) / height : 0.5;
  if (ratio < 0.25) return "before";
  if (ratio > 0.75) return "after";
  return "into";
}

/** One visible row of the folder tree. */
export interface TreeRow {
  readonly folder: LibraryFolder;
  /** 0 = top level. */
  readonly depth: number;
  readonly hasChildren: boolean;
}

/**
 * Flattens the folder tree into the rows to draw, skipping the contents of collapsed folders.
 *
 * Args:
 *   folders: All folders (array order = sibling order).
 *   expanded: Ids of expanded folders.
 *
 * Returns:
 *   Rows in display order.
 */
export function treeRows(folders: readonly LibraryFolder[], expanded: ReadonlySet<string>): TreeRow[] {
  const children = new Map<string | null, LibraryFolder[]>();
  for (const folder of folders) {
    const siblings = children.get(folder.parentId) ?? [];
    siblings.push(folder);
    children.set(folder.parentId, siblings);
  }
  const rows: TreeRow[] = [];
  const walk = (parentId: string | null, depth: number): void => {
    for (const folder of children.get(parentId) ?? []) {
      const hasChildren = children.has(folder.id);
      rows.push({ folder, depth, hasChildren });
      // 深度上限擋住循環資料（正常的素材庫不會有）
      if (hasChildren && expanded.has(folder.id) && depth < LIBRARY_DEPTH_MAX) walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}
