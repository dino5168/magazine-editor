import type { CanvasElement, EditorDocument, ElementId, MasterPage, Page, PageId, Sheet } from "./types";

/** Longest chain of master pages (a master based on a master …), counting the top one. */
export const MASTER_DEPTH_MAX = 8;

/**
 * Finds a page or master page by id.
 *
 * Args:
 *   document: Document to search.
 *   id: Page or master page id.
 *
 * Returns:
 *   The page or master page, or undefined.
 */
export function findSheet(document: EditorDocument, id: PageId): Sheet | undefined {
  return document.pages.find((page) => page.id === id) ?? document.masters.find((master) => master.id === id);
}

/**
 * Whether an id belongs to a master page.
 *
 * Args:
 *   document: Document to search.
 *   id: Any id.
 *
 * Returns:
 *   True for a master page id.
 */
export function isMasterId(document: EditorDocument, id: PageId): boolean {
  return document.masters.some((master) => master.id === id);
}

/** The master a sheet is drawn on top of: `masterId` for a page, `parentId` for a master page. */
export function baseMasterId(sheet: Sheet): PageId | null {
  if ("masterId" in sheet) return (sheet as Page).masterId;
  if ("parentId" in sheet) return (sheet as MasterPage).parentId;
  return null;
}

/**
 * The chain of master pages starting at `masterId` and following `parentId` upwards.
 *
 * Stops at a missing id or a cycle (neither occurs in a valid document), so it always ends.
 *
 * Args:
 *   masters: Every master page.
 *   masterId: First master of the chain; null gives an empty chain.
 *
 * Returns:
 *   Master pages in drawing order: the top-level ancestor first, `masterId` last.
 */
export function masterChain(masters: readonly MasterPage[], masterId: PageId | null): MasterPage[] {
  const byId = new Map(masters.map((master) => [master.id, master]));
  const chain: MasterPage[] = [];
  const seen = new Set<PageId>();
  for (let id = masterId; id !== null && !seen.has(id); ) {
    const master = byId.get(id);
    if (!master) break;
    seen.add(id);
    chain.push(master);
    id = master.parentId;
  }
  return chain.reverse();
}

/**
 * Elements a sheet inherits from its master pages, drawn under its own elements.
 *
 * Args:
 *   masters: Every master page.
 *   sheet: Page (uses `masterId`) or master page (uses `parentId`).
 *
 * Returns:
 *   Inherited elements bottom first: the top-level ancestor's, …, then the nearest master's.
 */
export function inheritedElements(masters: readonly MasterPage[], sheet: Sheet): CanvasElement[] {
  return masterContent(masters, baseMasterId(sheet));
}

/**
 * Everything a master page shows: its ancestors' elements, then its own.
 *
 * Args:
 *   masters: Every master page.
 *   masterId: The master page; null gives nothing.
 *
 * Returns:
 *   Elements bottom first.
 */
export function masterContent(masters: readonly MasterPage[], masterId: PageId | null): CanvasElement[] {
  return masterChain(masters, masterId).flatMap((master) => master.elements);
}

/**
 * Pages that show a master page's content: those using it directly or through a child master.
 *
 * Args:
 *   document: Document.
 *   masterId: Master page.
 *
 * Returns:
 *   Matching pages in document order.
 */
export function pagesUsingMaster(document: EditorDocument, masterId: PageId): Page[] {
  return document.pages.filter((page) =>
    masterChain(document.masters, page.masterId).some((master) => master.id === masterId),
  );
}

// 以 id 為根的子樹往下最長幾層（只有自己 = 0）；呼叫前已確認沒有循環
function subtreeHeight(masters: readonly MasterPage[], id: PageId): number {
  const children = masters.filter((master) => master.parentId === id);
  return children.length === 0 ? 0 : 1 + Math.max(...children.map((child) => subtreeHeight(masters, child.id)));
}

/**
 * Whether a master page may be based on another one: the parent exists, no cycle is formed and
 * no chain gets longer than `MASTER_DEPTH_MAX`.
 *
 * Args:
 *   masters: Every master page (`id` may be absent when checking a new master).
 *   id: Master page to re-parent.
 *   parentId: New parent; null (top level) is always allowed.
 *
 * Returns:
 *   True when allowed.
 */
export function canSetParent(masters: readonly MasterPage[], id: PageId, parentId: PageId | null): boolean {
  if (parentId === null) return true;
  if (!masters.some((master) => master.id === parentId)) return false;
  const parentChain = masterChain(masters, parentId);
  if (parentChain.some((master) => master.id === id)) return false;
  const height = masters.some((master) => master.id === id) ? subtreeHeight(masters, id) : 0;
  return parentChain.length + 1 + height <= MASTER_DEPTH_MAX;
}

/**
 * Checks the master page references of a document (file data is untrusted): page and master ids
 * unique across both lists, every `masterId` / `parentId` exists, no cycles, depth within
 * `MASTER_DEPTH_MAX`. Same rules as Rust `format.rs`.
 *
 * Args:
 *   document: Document to check.
 *
 * Returns:
 *   True when valid.
 */
export function isMasterGraphValid(document: EditorDocument): boolean {
  const { masters, pages } = document;
  const ids = [...pages, ...masters].map((sheet) => sheet.id);
  if (new Set(ids).size !== ids.length) return false;
  const masterIds = new Set(masters.map((master) => master.id));
  if (pages.some((page) => page.masterId !== null && !masterIds.has(page.masterId))) return false;
  if (masters.some((master) => master.parentId !== null && !masterIds.has(master.parentId))) return false;
  // 每個主頁往上走：遇到自己 = 循環；走完的長度就是深度
  return masters.every((master) => {
    const chain = masterChain(masters, master.id);
    return chain.length <= MASTER_DEPTH_MAX && chain[0].parentId === null;
  });
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Name of a new master page: `Master A`, `Master B` … (the first unused letter), then `Master 27` ….
 *
 * Args:
 *   masters: Existing master pages.
 *
 * Returns:
 *   An unused name.
 */
export function nextMasterName(masters: readonly MasterPage[]): string {
  const used = new Set(masters.map((master) => master.name));
  const letter = Array.from(LETTERS).find((l) => !used.has(`Master ${l}`));
  if (letter) return `Master ${letter}`;
  for (let n = LETTERS.length + 1; ; n++) if (!used.has(`Master ${n}`)) return `Master ${n}`;
}

/**
 * Removes a master page: pages and master pages based on it move to its parent (or to none).
 *
 * Args:
 *   document: Document.
 *   id: Master page to remove.
 *
 * Returns:
 *   The new document, or the same one when `id` is not a master page.
 */
export function deleteMaster(document: EditorDocument, id: PageId): EditorDocument {
  const target = document.masters.find((master) => master.id === id);
  if (!target) return document;
  const parentId = target.parentId;
  return {
    ...document,
    masters: document.masters
      .filter((master) => master.id !== id)
      .map((master) => (master.parentId === id ? { ...master, parentId } : master)),
    pages: document.pages.map((page) => (page.masterId === id ? { ...page, masterId: parentId } : page)),
  };
}

/**
 * Copies a sheet's elements with new ids, keeping their order and position.
 *
 * Args:
 *   elements: Elements to copy.
 *   newIds: One new id per element, in the same order.
 *
 * Returns:
 *   The copies, or null when the number of ids does not match.
 */
export function copyElements(
  elements: readonly CanvasElement[],
  newIds: readonly ElementId[],
): CanvasElement[] | null {
  if (newIds.length !== elements.length) return null;
  return elements.map((element, index) => ({ ...element, id: newIds[index] }));
}
