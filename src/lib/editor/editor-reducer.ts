import { createSampleDocument, type ShapeChoice } from "./element-factory";
import type { ReorderDirection } from "./layer-order";
import { findSheet } from "./master-pages";
import type { FontDeletion, ProjectFontChange } from "./project-fonts";
import type { SwatchDeletion } from "./swatches";
import { DEFAULT_LINE_KIND, type LineKind } from "./line-kinds";
import { DEFAULT_SHAPE_KIND, DEFAULT_TOOL, type ToolId } from "./tools";
import { DOCUMENT_HANDLERS } from "./reducer/document-handlers";
import { ELEMENT_HANDLERS } from "./reducer/element-handlers";
import { NO_SELECTION, type ActionHandler, type HandlerMap } from "./reducer/helpers";
import { PAGE_HANDLERS } from "./reducer/page-handlers";
import { STYLE_HANDLERS } from "./reducer/style-handlers";
import type {
  CanvasElement,
  EditorDocument,
  ElementId,
  ElementPatch,
  Margins,
  MasterPage,
  Page,
  PageId,
  PageNumberRule,
  Sheet,
  Size,
  ProjectFont,
  Swatch,
  TextStyle,
  TextStyleDef,
} from "./types";

export const HISTORY_LIMIT = 100;

/** How far a duplicated element is offset from the original, in pt. */
export const DUPLICATE_OFFSET_PT = 10;

export interface EditorHistory {
  readonly past: readonly EditorDocument[];
  readonly present: EditorDocument;
  readonly future: readonly EditorDocument[];
}

export interface EditorView {
  readonly zoom: number;
  /** Incremented to ask the canvas to fit the page; the canvas owns the viewport size. */
  readonly fitRequest: number;
}

export interface EditorState {
  readonly history: EditorHistory;
  // 以下為 UI 狀態，不進入 undo 歷史
  readonly activePageId: PageId;
  /** The page shown last (never a master page): 「回到頁面」 returns here after editing a master page. */
  readonly lastPageId: PageId;
  /** Selected elements on the active page, in the order they were selected; empty when nothing is selected. */
  readonly selectedIds: readonly ElementId[];
  readonly view: EditorView;
  /** Active canvas tool (bottom toolbar). */
  readonly tool: ToolId;
  /** Shape the shape tool creates; also the last shape used, shown on the toolbar button. */
  readonly shapeKind: ShapeChoice;
  /** Line the line tool creates (straight / arrow / double arrow); the last one used. */
  readonly lineKind: LineKind;
  /** Document as last saved / loaded; null when it must be saved (e.g. opened from a backup). */
  readonly savedDocument: EditorDocument | null;
}

export interface ElementPatchEntry {
  readonly id: ElementId;
  readonly patch: ElementPatch;
}

export interface ElementCopy {
  readonly id: ElementId;
  /** Comes from the caller so the reducer stays pure (React may run it twice). */
  readonly newId: ElementId;
}

/**
 * The `element/*` actions below work on the active page; `pageId` targets another page or master
 * page instead (automation, MCP) without switching what the user is looking at. An unknown
 * `pageId` is a no-op.
 */
export type EditorAction =
  /** Adds on top and selects it (only selects when it lands on the active page). */
  | { readonly type: "element/add"; readonly element: CanvasElement; readonly pageId?: PageId }
  | { readonly type: "element/update"; readonly id: ElementId; readonly patch: ElementPatch; readonly pageId?: PageId }
  /**
   * Swaps an element for another one (e.g. an image into an image frame) in the same layer position,
   * one undo step. The new element keeps the id, so the selection stays; anything invalid is a no-op.
   */
  | { readonly type: "element/replace"; readonly element: CanvasElement; readonly pageId?: PageId }
  /** Several elements in one undo step (moving a multi-selection); any invalid patch rejects them all. */
  | { readonly type: "element/updateMany"; readonly patches: readonly ElementPatchEntry[]; readonly pageId?: PageId }
  | { readonly type: "element/delete"; readonly ids: readonly ElementId[]; readonly pageId?: PageId }
  /**
   * Drop across the spine: applies the moves (positions on the active page), shifts the elements by
   * `dx` into the facing page's coordinates and moves them on top of that page, which becomes the
   * active page with them selected. One undo step; anything invalid is a no-op.
   */
  | {
      readonly type: "element/moveToPage";
      readonly moves: readonly ElementPatchEntry[];
      readonly pageId: PageId;
      readonly dx: number;
    }
  /** up / down: one layer; top / bottom: to the front / back of the page. */
  | { readonly type: "element/reorder"; readonly id: ElementId; readonly direction: ReorderDirection }
  | { readonly type: "element/duplicate"; readonly copies: readonly ElementCopy[] }
  /** `after` 省略時加在最後（「+」按鈕），有值時插在該頁後面（「插入頁面」） */
  | { readonly type: "page/add"; readonly after?: PageId }
  /** Add Pages dialog: inserts these pages (built by the caller, ids included) before `index`. */
  | { readonly type: "page/addMany"; readonly pages: readonly Page[]; readonly index: number }
  /** Copies a page and its elements (`elementIds`: one new id per element) right after it. */
  | {
      readonly type: "page/duplicate";
      readonly id: PageId;
      readonly newId: PageId;
      readonly elementIds: readonly ElementId[];
    }
  /** Applies a master page (null = none) to these pages. */
  | { readonly type: "page/setMaster"; readonly ids: readonly PageId[]; readonly masterId: PageId | null }
  /** Switches to a page, or to a master page to edit it. */
  | { readonly type: "page/select"; readonly id: PageId }
  /** Renames a page or a master page. */
  | { readonly type: "page/rename"; readonly id: PageId; readonly name: string }
  | { readonly type: "page/delete"; readonly id: PageId }
  /** New page order (every page id once); anything else is a no-op. The active page stays active. */
  | { readonly type: "page/reorder"; readonly order: readonly PageId[] }
  /**
   * Background of a page or a master page; `swatchId` links it to a swatch (whose color it must be),
   * omitted or null = not linked.
   */
  | { readonly type: "page/setBackground"; readonly id: PageId; readonly color: string; readonly swatchId?: string | null }
  /** Adds a master page (built by the caller) at the end and switches to it. */
  | { readonly type: "master/add"; readonly master: MasterPage }
  /** Copies a master page and its elements right after it and switches to the copy. */
  | {
      readonly type: "master/duplicate";
      readonly id: PageId;
      readonly newId: PageId;
      readonly elementIds: readonly ElementId[];
    }
  /** Bases a master page on another one (null = top level); a cycle or a too deep chain is a no-op. */
  | { readonly type: "master/setParent"; readonly id: PageId; readonly parentId: PageId | null }
  /** Removes a master page; whatever was based on it moves to its parent. */
  | { readonly type: "master/delete"; readonly id: PageId }
  /**
   * Text style sheet (`style-sheet.ts`), each one undo step; invalid input is a no-op. `add` may also
   * link texts to the new style (「建立新樣式」 from a selection) in the same step.
   */
  | {
      readonly type: "textStyle/add";
      readonly style: TextStyleDef;
      readonly link?: { readonly pageId: PageId; readonly ids: readonly ElementId[] };
    }
  /**
   * New field values (the id stays) and optionally a new name; linked texts follow except where they
   * override it. The style dialog sends both in one undo step.
   */
  | { readonly type: "textStyle/update"; readonly id: string; readonly style: TextStyle; readonly name?: string }
  | { readonly type: "textStyle/rename"; readonly id: string; readonly name: string }
  /** Removes a style; its texts keep their look and are unlinked. */
  | { readonly type: "textStyle/delete"; readonly id: string }
  /**
   * Links texts (text elements, the label of shapes) to a style and gives them its values; `null`
   * unlinks them and keeps their look. Other elements are skipped.
   */
  | {
      readonly type: "element/applyTextStyle";
      readonly ids: readonly ElementId[];
      readonly styleId: string | null;
      readonly pageId?: PageId;
    }
  /**
   * Document swatches (`swatches.ts`), each one undo step; invalid input is a no-op. Uses of a
   * recolored swatch follow its color; uses of a deleted one move to `replaceWith` or are unlinked.
   */
  | { readonly type: "swatch/add"; readonly swatch: Swatch }
  | { readonly type: "swatch/update"; readonly id: string; readonly name?: string; readonly color?: string }
  | { readonly type: "swatch/delete"; readonly id: string; readonly replaceWith: string | null }
  /** Swatch dialog: the whole new list plus the deleted swatches, in one undo step. */
  | { readonly type: "swatch/applyEdits"; readonly swatches: readonly Swatch[]; readonly deletions: readonly SwatchDeletion[] }
  /**
   * Project fonts (`project-fonts.ts`), each one undo step; invalid input is a no-op. The files are
   * already in `assets/fonts/` (`font_import`). A new fallback kind rewrites every use; deleting a
   * font switches its uses to `replaceWith` (the CSS family of a menu font).
   */
  | { readonly type: "font/add"; readonly font: ProjectFont }
  | { readonly type: "font/update"; readonly id: string; readonly change: ProjectFontChange }
  | { readonly type: "font/delete"; readonly id: string; readonly replaceWith: string }
  /** Font dialog: the whole new list plus the deleted fonts, in one undo step. */
  | { readonly type: "font/applyEdits"; readonly fonts: readonly ProjectFont[]; readonly deletions: readonly FontDeletion[] }
  | { readonly type: "document/rename"; readonly name: string }
  /** Page setup dialog: resizes every page (elements stay where they are) and sets the margins, in one undo step. */
  | { readonly type: "document/setPageSetup"; readonly size: Size; readonly margins: Margins }
  /** Page number dialog: replaces every page number rule in one undo step; invalid rules are a no-op. */
  | { readonly type: "document/setPageNumbering"; readonly rules: readonly PageNumberRule[] }
  | { readonly type: "history/undo" }
  | { readonly type: "history/redo" }
  /**
   * Applies several actions as one undo step (MCP `batch`). Only `BatchableAction`s: any history,
   * load or save action inside makes the whole batch a no-op.
   */
  | { readonly type: "history/batch"; readonly actions: readonly EditorAction[] }
  /** Selects only this element; null clears the selection. */
  | { readonly type: "selection/set"; readonly id: ElementId | null }
  /** Ctrl+click: adds the element to the selection, or removes it when already selected. */
  | { readonly type: "selection/toggle"; readonly id: ElementId }
  /** Marquee: selects these elements; `additive` (Ctrl held) adds them to the current selection. */
  | { readonly type: "selection/setMany"; readonly ids: readonly ElementId[]; readonly additive: boolean }
  | { readonly type: "view/setZoom"; readonly zoom: number }
  | { readonly type: "view/fit" }
  | { readonly type: "tool/set"; readonly tool: ToolId; readonly shape?: ShapeChoice; readonly line?: LineKind }
  | {
      readonly type: "document/load";
      readonly document: EditorDocument;
      /** False when the loaded content differs from what is on disk and should be saved. */
      readonly saved: boolean;
    }
  | { readonly type: "document/markSaved"; readonly document: EditorDocument };

/**
 * Actions allowed inside `history/batch`: everything except history, loading and saving, and
 * `page/add` (it makes its own page id, so replaying a batch would not give the same result).
 */
export type BatchableAction = Exclude<
  EditorAction,
  { readonly type: `history/${string}` | "document/load" | "document/markSaved" | "page/add" }
>;

const NOT_BATCHABLE: ReadonlySet<EditorAction["type"]> = new Set(["document/load", "document/markSaved", "page/add"]);

/**
 * Tells whether an action may go into `history/batch`.
 *
 * Args:
 *   action: Any editor action.
 *
 * Returns:
 *   False for history, load and save actions and `page/add`.
 */
export function isBatchableAction(action: EditorAction): action is BatchableAction {
  return !action.type.startsWith("history/") && !NOT_BATCHABLE.has(action.type);
}

/**
 * Creates the initial editor state from a document.
 *
 * Args:
 *   document: Initial document; defaults to the sample document.
 *
 * Returns:
 *   Editor state with the first page active.
 */
export function createInitialState(document: EditorDocument = createSampleDocument()): EditorState {
  return {
    history: { past: [], present: document, future: [] },
    activePageId: document.pages[0].id,
    lastPageId: document.pages[0].id,
    selectedIds: NO_SELECTION,
    view: { zoom: 1, fitRequest: 1 },
    tool: DEFAULT_TOOL,
    shapeKind: DEFAULT_SHAPE_KIND,
    lineKind: DEFAULT_LINE_KIND,
    savedDocument: document,
  };
}

/**
 * Whether the document differs from the last saved version.
 *
 * Args:
 *   state: Editor state.
 *
 * Returns:
 *   True when there are unsaved changes.
 */
export function selectIsDirty(state: EditorState): boolean {
  // 文件是不可變資料：比較參考即可；復原到存檔時的版本會自動變回「未修改」
  return state.history.present !== state.savedDocument;
}

/**
 * Returns the page or master page being edited; falls back to the first page if the id is stale.
 *
 * Args:
 *   state: Editor state.
 *
 * Returns:
 *   Active page or master page.
 */
export function selectActivePage(state: EditorState): Sheet {
  const document = state.history.present;
  return findSheet(document, state.activePageId) ?? document.pages[0];
}

/**
 * The page to go back to from a master page: the page shown last, or the first page when it was
 * deleted since.
 *
 * Args:
 *   state: Editor state.
 *
 * Returns:
 *   A page id.
 */
export function selectReturnPageId(state: EditorState): PageId {
  const { pages } = state.history.present;
  return pages.some((page) => page.id === state.lastPageId) ? state.lastPageId : pages[0].id;
}

/**
 * Returns the selected elements on the active page.
 *
 * Args:
 *   state: Editor state.
 *
 * Returns:
 *   Selected elements in layer order (bottom first).
 */
export function selectSelectedElements(state: EditorState): CanvasElement[] {
  if (state.selectedIds.length === 0) return [];
  const ids = new Set(state.selectedIds);
  return selectActivePage(state).elements.filter((element) => ids.has(element.id));
}

/**
 * Returns the selected element when exactly one is selected.
 *
 * Args:
 *   state: Editor state.
 *
 * Returns:
 *   The only selected element, or null when none or several are selected.
 */
export function selectSelectedElement(state: EditorState): CanvasElement | null {
  if (state.selectedIds.length !== 1) return null;
  return selectActivePage(state).elements.find((element) => element.id === state.selectedIds[0]) ?? null;
}

const HANDLERS: HandlerMap = {
  ...ELEMENT_HANDLERS,
  ...PAGE_HANDLERS,
  ...STYLE_HANDLERS,
  ...DOCUMENT_HANDLERS,
};

/**
 * Pure reducer for the editor. Document mutations are recorded in the undo history.
 *
 * Args:
 *   state: Current state.
 *   action: Action to apply.
 *
 * Returns:
 *   Next state (the same reference when nothing changed).
 */
export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  // 以 mapped type 保證每個 action type 都有 handler；此處的 cast 只是把關聯型別交給 TS
  const handler = HANDLERS[action.type] as ActionHandler<EditorAction["type"]>;
  return rememberPage(handler(state, action));
}

// 切到頁面（不是主頁）時記下來，從主頁回來時用；沒有變化時回傳同一個 state
function rememberPage(state: EditorState): EditorState {
  if (state.activePageId === state.lastPageId) return state;
  if (!state.history.present.pages.some((page) => page.id === state.activePageId)) return state;
  return { ...state, lastPageId: state.activePageId };
}
