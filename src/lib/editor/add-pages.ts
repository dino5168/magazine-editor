import { createPage, nextPageNames } from "./element-factory";
import { canSetParent } from "./master-pages";
import type { EditorDocument, MasterPage, Page, PageId } from "./types";
import { PAGE_NAME_MAX_LENGTH, validateName } from "./validation";

/** Most pages the Add Pages dialog inserts at once. */
export const ADD_PAGES_MAX = 100;

export type InsertSide = "before" | "after";

/** Where the dialog was opened from: the 「+」 at the end of the tabs, or 「插入頁面」 at the current page. */
export type AddPagesAnchor = "end" | "current";

/** The Add Pages dialog's fields (Affinity's Add Pages without spreads). */
export interface AddPagesForm {
  /** Master page the new pages use; null = none. */
  readonly masterId: PageId | null;
  readonly count: number;
  readonly side: InsertSide;
  /** 1-based page the new pages go before / after. */
  readonly pageNumber: number;
}

/**
 * Initial values of the Add Pages dialog.
 *
 * The master is the one being edited, else the current page's, else the first master page (the
 * intended flow is: add a master page first, then pages using it). The position is after the last
 * page (「+」) or after the current page (「插入頁面」); while editing a master page there is no
 * current page, so it is the end too.
 *
 * Args:
 *   document: Document.
 *   activePageId: Page or master page being shown.
 *   anchor: Where the dialog was opened from.
 *
 * Returns:
 *   Form values.
 */
export function addPagesDefaults(document: EditorDocument, activePageId: PageId, anchor: AddPagesAnchor): AddPagesForm {
  const { pages, masters } = document;
  const pageIndex = pages.findIndex((page) => page.id === activePageId);
  const editingMaster = masters.some((master) => master.id === activePageId);
  const masterId = editingMaster
    ? activePageId
    : pageIndex >= 0 && pages[pageIndex].masterId !== null
      ? pages[pageIndex].masterId
      : (masters[0]?.id ?? null);
  const pageNumber = anchor === "current" && pageIndex >= 0 ? pageIndex + 1 : pages.length;
  return { masterId, count: 1, side: "after", pageNumber };
}

/**
 * Why the Add Pages form cannot be applied.
 *
 * Args:
 *   form: Form values.
 *   document: Document (page count, master pages).
 *
 * Returns:
 *   A message for the dialog, or null when the form is valid.
 */
export function addPagesError(form: AddPagesForm, document: EditorDocument): string | null {
  const pageCount = document.pages.length;
  if (!Number.isInteger(form.count) || form.count < 1 || form.count > ADD_PAGES_MAX) {
    return `頁數必須是 1–${ADD_PAGES_MAX} 的整數`;
  }
  if (!Number.isInteger(form.pageNumber) || form.pageNumber < 1 || form.pageNumber > pageCount) {
    return `頁必須是 1–${pageCount} 的整數`;
  }
  if (form.masterId !== null && !document.masters.some((master) => master.id === form.masterId)) {
    return "找不到選擇的主頁";
  }
  return null;
}

/**
 * Index in `pages` where the new pages are inserted.
 *
 * Args:
 *   form: Valid form values.
 *
 * Returns:
 *   0-based insertion index.
 */
export function addPagesIndex(form: AddPagesForm): number {
  return form.side === "before" ? form.pageNumber - 1 : form.pageNumber;
}

/**
 * Builds the pages the dialog adds: named `Page-N` after the existing ones, sized like the page
 * they are inserted next to, with the master page's background as their own (backgrounds are not
 * inherited) or the neighbour page's when no master page is chosen.
 *
 * Args:
 *   document: Document.
 *   form: Valid form values.
 *
 * Returns:
 *   New empty pages, in order.
 */
export function buildAddedPages(document: EditorDocument, form: AddPagesForm): Page[] {
  const neighbour = document.pages[form.pageNumber - 1] ?? document.pages[0];
  const master = document.masters.find((candidate) => candidate.id === form.masterId);
  const background = master?.background ?? neighbour.background;
  return nextPageNames(document.pages, form.count).map((name) => createPage(name, neighbour, background, form.masterId));
}

/**
 * Why the Add Master Page form cannot be applied.
 *
 * Args:
 *   name: Name typed by the user.
 *   parentId: Master page it is based on; null = none.
 *   masters: Existing master pages.
 *
 * Returns:
 *   A message for the dialog, or null when the form is valid.
 */
export function addMasterError(name: string, parentId: PageId | null, masters: readonly MasterPage[]): string | null {
  const result = validateName(name, PAGE_NAME_MAX_LENGTH);
  if (result.error) return result.error.message;
  // 新主頁還沒有 id，用一個不會存在的 id 檢查深度
  if (!canSetParent(masters, "", parentId)) return "這個主頁已經是最深的一層，不能再以它為基礎";
  return null;
}
