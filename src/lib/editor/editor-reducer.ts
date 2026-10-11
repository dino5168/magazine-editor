import { createPage, createSampleDocument, nextPageNames, type ShapeKind } from "./element-factory";
import { canSetParent, copyElements, deleteMaster, findSheet, isMasterId } from "./master-pages";
import { isPageNumberRules, sortPageNumberRules } from "./page-numbers";
import { isPageOrder } from "./page-order";
import {
  TEXT_STYLE_NAME_MAX_LENGTH,
  deleteTextStyle,
  isTextStyleSheet,
  linkTextStyle,
  mapElementText,
  pickTextStyle,
  restyleDocument,
  styledTextOf,
} from "./style-sheet";
import { isLetterSpacing, isLineHeight } from "./text-style";
import { DEFAULT_SHAPE_KIND, DEFAULT_TOOL, type ToolId } from "./tools";
import {
  DOCUMENT_NAME_MAX_LENGTH,
  PAGE_NAME_MAX_LENGTH,
  isElementColor,
  isHexColor,
  isMargins,
  isPageSize,
  isShapeGeometry,
  isShapeLabel,
  isStroke,
  isTextShadow,
  isTextStyle,
  validateName,
} from "./validation";
import { clampZoom } from "./viewport";
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
  readonly shapeKind: ShapeKind;
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
  | { readonly type: "element/reorder"; readonly id: ElementId; readonly direction: "up" | "down" | "top" | "bottom" }
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
  /** Background of a page or a master page. */
  | { readonly type: "page/setBackground"; readonly id: PageId; readonly color: string }
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
  | { readonly type: "document/rename"; readonly name: string }
  /** Page setup dialog: resizes every page (elements stay where they are) and sets the margins, in one undo step. */
  | { readonly type: "document/setPageSetup"; readonly size: Size; readonly margins: Margins }
  /** Page number dialog: replaces every page number rule in one undo step; invalid rules are a no-op. */
  | { readonly type: "document/setPageNumbering"; readonly rules: readonly PageNumberRule[] }
  | { readonly type: "history/undo" }
  | { readonly type: "history/redo" }
  /** Selects only this element; null clears the selection. */
  | { readonly type: "selection/set"; readonly id: ElementId | null }
  /** Ctrl+click: adds the element to the selection, or removes it when already selected. */
  | { readonly type: "selection/toggle"; readonly id: ElementId }
  /** Marquee: selects these elements; `additive` (Ctrl held) adds them to the current selection. */
  | { readonly type: "selection/setMany"; readonly ids: readonly ElementId[]; readonly additive: boolean }
  | { readonly type: "view/setZoom"; readonly zoom: number }
  | { readonly type: "view/fit" }
  | { readonly type: "tool/set"; readonly tool: ToolId; readonly shape?: ShapeKind }
  | {
      readonly type: "document/load";
      readonly document: EditorDocument;
      /** False when the loaded content differs from what is on disk and should be saved. */
      readonly saved: boolean;
    }
  | { readonly type: "document/markSaved"; readonly document: EditorDocument };

type ActionOf<T extends EditorAction["type"]> = Extract<EditorAction, { readonly type: T }>;
type ActionHandler<T extends EditorAction["type"]> = (state: EditorState, action: ActionOf<T>) => EditorState;

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

const NO_SELECTION: readonly ElementId[] = [];

function commit(state: EditorState, next: EditorDocument): EditorState {
  if (next === state.history.present) return state;
  const past = [...state.history.past, state.history.present].slice(-HISTORY_LIMIT);
  return { ...state, history: { past, present: next, future: [] } };
}

/**
 * Updates one page or master page. `update` only replaces common fields (spreading the sheet), so
 * the result keeps the kind and the `masterId` / `parentId` of the original.
 */
function updateSheet(state: EditorState, id: PageId, update: (sheet: Sheet) => Sheet): EditorState {
  const document = state.history.present;
  const target = findSheet(document, id);
  if (!target) return state;
  const next = update(target);
  if (next === target) return state;
  return commit(
    state,
    isMasterId(document, id)
      ? { ...document, masters: document.masters.map((master) => (master.id === id ? (next as MasterPage) : master)) }
      : { ...document, pages: document.pages.map((page) => (page.id === id ? (next as Page) : page)) },
  );
}

function updateActivePage(state: EditorState, update: (sheet: Sheet) => Sheet): EditorState {
  return updateSheet(state, selectActivePage(state).id, update);
}

/** `pageId` when given (see `EditorAction`), else the active page. */
function targetSheetId(state: EditorState, pageId: PageId | undefined): PageId {
  return pageId ?? selectActivePage(state).id;
}

// 複本的名稱：原名加「複本」，超過長度上限時截斷原名
function copyName(name: string): string {
  const suffix = " 複本";
  return Array.from(name).slice(0, PAGE_NAME_MAX_LENGTH - suffix.length).join("") + suffix;
}

/** Inserts a copy right after the sheet with `id`; returns null when the ids do not fit. */
function duplicateIn<S extends Sheet>(
  sheets: readonly S[],
  document: EditorDocument,
  action: { readonly id: PageId; readonly newId: PageId; readonly elementIds: readonly ElementId[] },
): S[] | null {
  const index = sheets.findIndex((sheet) => sheet.id === action.id);
  if (index === -1 || findSheet(document, action.newId)) return null;
  const source = sheets[index];
  if (new Set(action.elementIds).size !== action.elementIds.length) return null;
  const elements = copyElements(source.elements, action.elementIds);
  if (!elements) return null;
  const copy: S = { ...source, id: action.newId, name: copyName(source.name), elements };
  return [...sheets.slice(0, index + 1), copy, ...sheets.slice(index + 1)];
}

/** undo/redo 後頁面或物件可能已不存在，校正 UI 狀態避免指向失效的 id。 */
function reconcileSelection(state: EditorState): EditorState {
  const document = state.history.present;
  const activePage = findSheet(document, state.activePageId) ?? document.pages[0];
  const existing = new Set(activePage.elements.map((element) => element.id));
  const valid = state.selectedIds.filter((id) => existing.has(id));
  return {
    ...state,
    activePageId: activePage.id,
    selectedIds: valid.length === state.selectedIds.length ? state.selectedIds : valid,
  };
}

const TEXT_FLAGS = ["italic", "underline", "strikethrough"] as const;

// 屬性面板的數字欄位、拖曳結果都直接來自使用者操作：不合法的 patch 一律不接受
function isValidPatch(patch: ElementPatch): boolean {
  if ("fill" in patch && (typeof patch.fill !== "string" || !isElementColor(patch.fill))) return false;
  if ("stroke" in patch && patch.stroke !== null && !isStroke(patch.stroke)) return false;
  if ("label" in patch && patch.label !== null && !isShapeLabel(patch.label)) return false;
  if ("geometry" in patch && !isShapeGeometry(patch.geometry)) return false;
  if ("shadow" in patch && patch.shadow !== null && !isTextShadow(patch.shadow)) return false;
  const fields: Record<string, unknown> = patch;
  if (TEXT_FLAGS.some((flag) => flag in fields && typeof fields[flag] !== "boolean")) return false;
  if ("lineHeight" in fields && !isLineHeight(fields.lineHeight)) return false;
  if ("letterSpacing" in fields && !isLetterSpacing(fields.letterSpacing)) return false;
  // NaN / Infinity 一律不接受
  return !Object.values(patch).some((value) => typeof value === "number" && !Number.isFinite(value));
}

/** Applies a validated patch; returns the same element when nothing changes. */
function applyPatch(current: CanvasElement, patch: ElementPatch): CanvasElement {
  const changed = Object.entries(patch).some(
    ([key, value]) => (current as unknown as Record<string, unknown>)[key] !== value,
  );
  // patch 型別為各物件屬性的聯集；呼叫端依物件的 type 傳入對應欄位
  return changed ? ({ ...current, ...patch } as CanvasElement) : current;
}

/** A `styleId` must be null or name a style of the document (Rust `require_style`). */
function isStyleLink(document: EditorDocument, styleId: unknown): boolean {
  return styleId === null || document.textStyles.some((style) => style.id === styleId);
}

/** The style links an element or a patch brings in (its own `styleId`, its label's) are valid. */
function hasValidStyleLinks(document: EditorDocument, value: CanvasElement | ElementPatch): boolean {
  const fields = value as Record<string, unknown>;
  if ("styleId" in fields && !isStyleLink(document, fields.styleId)) return false;
  const label = fields.label as { readonly styleId?: unknown } | null | undefined;
  return !label || isStyleLink(document, label.styleId);
}

function updateElements(state: EditorState, entries: readonly ElementPatchEntry[], pageId?: PageId): EditorState {
  if (!entries.every((entry) => isValidPatch(entry.patch))) return state;
  if (!entries.every((entry) => hasValidStyleLinks(state.history.present, entry.patch))) return state;
  const patches = new Map(entries.map((entry) => [entry.id, entry.patch]));
  // 全部的變更放在同一次 commit：多選移動 = 一筆復原
  return updateSheet(state, targetSheetId(state, pageId), (page) => {
    let changed = false;
    const elements = page.elements.map((element) => {
      const patch = patches.get(element.id);
      const next = patch ? applyPatch(element, patch) : element;
      if (next !== element) changed = true;
      return next;
    });
    return changed ? { ...page, elements } : page;
  });
}

/**
 * Renames a style (trimmed, unique). Returns the new document, the same one when the name does not
 * change, or null when the style is unknown or the name invalid / taken.
 */
function renameTextStyle(document: EditorDocument, id: string, name: string): EditorDocument | null {
  const target = document.textStyles.find((style) => style.id === id);
  const result = validateName(name, TEXT_STYLE_NAME_MAX_LENGTH);
  if (!target || result.error) return null;
  if (result.data === target.name) return document;
  if (document.textStyles.some((style) => style.name === result.data)) return null;
  return { ...document, textStyles: document.textStyles.map((style) => (style === target ? { ...style, name: result.data } : style)) };
}

/**
 * Links (or with null, unlinks) the texts of these elements on one sheet.
 *
 * Returns the new document, the same one when nothing changes, or null when the sheet does not exist.
 */
function linkElements(
  document: EditorDocument,
  sheetId: PageId,
  ids: readonly ElementId[],
  style: TextStyleDef | null,
): EditorDocument | null {
  const sheet = findSheet(document, sheetId);
  if (!sheet) return null;
  const targets = new Set(ids);
  let changed = false;
  const elements = sheet.elements.map((element) => {
    if (!targets.has(element.id) || !styledTextOf(element)) return element;
    const next = mapElementText(element, (text) => linkTextStyle(text, style));
    if (next !== element) changed = true;
    return next;
  });
  if (!changed) return document;
  const replace = <S extends Sheet>(sheets: readonly S[]) => sheets.map((s) => (s.id === sheetId ? { ...s, elements } : s));
  return isMasterId(document, sheetId)
    ? { ...document, masters: replace(document.masters) }
    : { ...document, pages: replace(document.pages) };
}

function sameIds(a: readonly ElementId[], b: readonly ElementId[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

const HANDLERS: { readonly [T in EditorAction["type"]]: ActionHandler<T> } = {
  "element/add": (state, action) => {
    if (!hasValidStyleLinks(state.history.present, action.element)) return state;
    const sheetId = targetSheetId(state, action.pageId);
    const next = updateSheet(state, sheetId, (page) => ({ ...page, elements: [...page.elements, action.element] }));
    if (next === state) return state;
    // 選取只屬於目前頁：加到別頁時不動目前的選取
    return sheetId === selectActivePage(state).id ? { ...next, selectedIds: [action.element.id] } : next;
  },

  "element/update": (state, action) => updateElements(state, [{ id: action.id, patch: action.patch }], action.pageId),

  "element/updateMany": (state, action) => updateElements(state, action.patches, action.pageId),

  "element/delete": (state, action) => {
    const ids = new Set(action.ids);
    const next = updateSheet(state, targetSheetId(state, action.pageId), (page) => {
      const elements = page.elements.filter((element) => !ids.has(element.id));
      return elements.length === page.elements.length ? page : { ...page, elements };
    });
    return next === state ? state : reconcileSelection(next);
  },

  // 拖過書背放下：同一筆復原裡改位置、換到對頁的座標、搬到對頁的最上層，並切到對頁選取它們
  "element/moveToPage": (state, action) => {
    const document = state.history.present;
    const source = selectActivePage(state);
    const target = document.pages.find((page) => page.id === action.pageId);
    const ids = new Set(action.moves.map((move) => move.id));
    if (
      !target ||
      target.id === source.id ||
      !document.pages.some((page) => page.id === source.id) ||
      !Number.isFinite(action.dx) ||
      ids.size === 0 ||
      ids.size !== action.moves.length ||
      ![...ids].every((id) => source.elements.some((element) => element.id === id)) ||
      !action.moves.every((move) => isValidPatch(move.patch))
    ) {
      return state;
    }
    const patches = new Map(action.moves.map((move) => [move.id, move.patch]));
    // 依原本的圖層順序搬過去，保持彼此的上下關係
    const moved = source.elements
      .filter((element) => ids.has(element.id))
      .map((element) => {
        const next = applyPatch(element, patches.get(element.id)!);
        return { ...next, x: next.x + action.dx } as CanvasElement;
      });
    const pages = document.pages.map((page) => {
      if (page.id === source.id) return { ...page, elements: page.elements.filter((element) => !ids.has(element.id)) };
      if (page.id === target.id) return { ...page, elements: [...page.elements, ...moved] };
      return page;
    });
    return { ...commit(state, { ...document, pages }), activePageId: target.id, selectedIds: moved.map((element) => element.id) };
  },

  "element/reorder": (state, action) =>
    updateActivePage(state, (page) => {
      const index = page.elements.findIndex((element) => element.id === action.id);
      const last = page.elements.length - 1;
      const target = { up: index + 1, down: index - 1, top: last, bottom: 0 }[action.direction];
      if (index === -1 || target === index || target < 0 || target > last) return page;
      const elements = page.elements.filter((element) => element.id !== action.id);
      elements.splice(target, 0, page.elements[index]);
      return { ...page, elements };
    }),

  // 每個複本放在各自原物件的正上方一層（不是最上層），位移一點以便看出是新的物件；之後選取這組複本
  "element/duplicate": (state, action) => {
    const page = selectActivePage(state);
    const existing = new Set(page.elements.map((element) => element.id));
    const newIds = new Set(action.copies.map((copy) => copy.newId));
    if (
      action.copies.length === 0 ||
      newIds.size !== action.copies.length ||
      action.copies.some((copy) => !existing.has(copy.id) || existing.has(copy.newId))
    ) {
      return state;
    }
    const newIdOf = new Map(action.copies.map((copy) => [copy.id, copy.newId]));
    const next = updateActivePage(state, (p) => ({
      ...p,
      elements: p.elements.flatMap((element) => {
        const newId = newIdOf.get(element.id);
        if (newId === undefined) return [element];
        const copy: CanvasElement = {
          ...element,
          id: newId,
          x: element.x + DUPLICATE_OFFSET_PT,
          y: element.y + DUPLICATE_OFFSET_PT,
        };
        return [element, copy];
      }),
    }));
    return { ...next, selectedIds: action.copies.map((copy) => copy.newId) };
  },

  // 新頁面沿用目前頁面的尺寸、背景與主頁（目前在編輯主頁時，新頁面套用該主頁）
  "page/add": (state, action) => {
    const document = state.history.present;
    const active = selectActivePage(state);
    const afterIndex = action.after === undefined ? -1 : document.pages.findIndex((p) => p.id === action.after);
    if (action.after !== undefined && afterIndex === -1) return state;
    const masterId = isMasterId(document, active.id) ? active.id : (active as Page).masterId;
    const page = createPage(nextPageNames(document.pages, 1)[0], active, active.background, masterId);
    const pages = [...document.pages];
    pages.splice(afterIndex === -1 ? pages.length : afterIndex + 1, 0, page);
    return { ...commit(state, { ...document, pages }), activePageId: page.id, selectedIds: NO_SELECTION };
  },

  // 新頁面由呼叫端建立（id、名稱、主頁）；任何一頁不合法就整批不做
  "page/addMany": (state, action) => {
    const document = state.history.present;
    const { index } = action;
    const ids = action.pages.map((page) => page.id);
    const masterIds = new Set(document.masters.map((master) => master.id));
    if (
      action.pages.length === 0 ||
      !Number.isInteger(index) ||
      index < 0 ||
      index > document.pages.length ||
      new Set(ids).size !== ids.length ||
      action.pages.some(
        (page) =>
          findSheet(document, page.id) !== undefined ||
          (page.masterId !== null && !masterIds.has(page.masterId)) ||
          !isPageSize(page) ||
          !isHexColor(page.background) ||
          validateName(page.name, PAGE_NAME_MAX_LENGTH).data !== page.name,
      )
    ) {
      return state;
    }
    const pages = [...document.pages.slice(0, index), ...action.pages, ...document.pages.slice(index)];
    return { ...commit(state, { ...document, pages }), activePageId: action.pages[0].id, selectedIds: NO_SELECTION };
  },

  "page/duplicate": (state, action) => {
    const document = state.history.present;
    const pages = duplicateIn(document.pages, document, action);
    if (!pages) return state;
    return { ...commit(state, { ...document, pages }), activePageId: action.newId, selectedIds: NO_SELECTION };
  },

  "page/setMaster": (state, action) => {
    const document = state.history.present;
    if (action.masterId !== null && !isMasterId(document, action.masterId)) return state;
    const ids = new Set(action.ids);
    if (ids.size === 0 || ![...ids].every((id) => document.pages.some((page) => page.id === id))) return state;
    let changed = false;
    const pages = document.pages.map((page) => {
      if (!ids.has(page.id) || page.masterId === action.masterId) return page;
      changed = true;
      return { ...page, masterId: action.masterId };
    });
    return changed ? commit(state, { ...document, pages }) : state;
  },

  "page/select": (state, action) => {
    if (action.id === state.activePageId) return state;
    if (!findSheet(state.history.present, action.id)) return state;
    return { ...state, activePageId: action.id, selectedIds: NO_SELECTION };
  },

  "page/rename": (state, action) => {
    const result = validateName(action.name, PAGE_NAME_MAX_LENGTH);
    if (result.error) return state;
    return updateSheet(state, action.id, (sheet) => (sheet.name === result.data ? sheet : { ...sheet, name: result.data }));
  },

  "page/delete": (state, action) => {
    const document = state.history.present;
    if (document.pages.length <= 1) return state;
    const index = document.pages.findIndex((page) => page.id === action.id);
    if (index === -1) return state;
    const pages = document.pages.filter((page) => page.id !== action.id);
    const next = commit(state, { ...document, pages });
    if (state.activePageId !== action.id) return next;
    return { ...next, activePageId: pages[Math.max(0, index - 1)].id, selectedIds: NO_SELECTION };
  },

  "page/reorder": (state, action) => {
    const document = state.history.present;
    const current = document.pages.map((page) => page.id);
    if (!isPageOrder(current, action.order) || action.order.every((id, index) => id === current[index])) return state;
    const byId = new Map(document.pages.map((page) => [page.id, page]));
    // 頁面物件本身不變，只換位置；目前頁與選取都跟著頁面走，不必調整
    return commit(state, { ...document, pages: action.order.map((id) => byId.get(id)!) });
  },

  "page/setBackground": (state, action) => {
    if (!isHexColor(action.color)) return state;
    return updateSheet(state, action.id, (sheet) =>
      sheet.background === action.color ? sheet : { ...sheet, background: action.color },
    );
  },

  "master/add": (state, action) => {
    const document = state.history.present;
    const { master } = action;
    if (
      findSheet(document, master.id) ||
      !canSetParent(document.masters, master.id, master.parentId) ||
      !isPageSize(master) ||
      !isHexColor(master.background) ||
      validateName(master.name, PAGE_NAME_MAX_LENGTH).data !== master.name
    ) {
      return state;
    }
    const next = commit(state, { ...document, masters: [...document.masters, master] });
    return { ...next, activePageId: master.id, selectedIds: NO_SELECTION };
  },

  "master/duplicate": (state, action) => {
    const document = state.history.present;
    const masters = duplicateIn(document.masters, document, action);
    if (!masters) return state;
    return { ...commit(state, { ...document, masters }), activePageId: action.newId, selectedIds: NO_SELECTION };
  },

  "master/setParent": (state, action) => {
    const document = state.history.present;
    const target = document.masters.find((master) => master.id === action.id);
    if (!target || target.parentId === action.parentId) return state;
    if (!canSetParent(document.masters, action.id, action.parentId)) return state;
    return commit(state, {
      ...document,
      masters: document.masters.map((master) =>
        master.id === action.id ? { ...master, parentId: action.parentId } : master,
      ),
    });
  },

  // 正在編輯被刪除的主頁時回到第一頁
  "master/delete": (state, action) => {
    const document = state.history.present;
    const nextDocument = deleteMaster(document, action.id);
    if (nextDocument === document) return state;
    const next = commit(state, nextDocument);
    if (state.activePageId !== action.id) return next;
    return { ...next, activePageId: nextDocument.pages[0].id, selectedIds: NO_SELECTION };
  },

  "textStyle/add": (state, action) => {
    const document = state.history.present;
    const textStyles = [...document.textStyles, action.style];
    if (!isTextStyleSheet(textStyles)) return state;
    const added = { ...document, textStyles };
    if (!action.link) return commit(state, added);
    // 連結的文字和新樣式同一筆復原；頁面不存在就整個不做
    const linked = linkElements(added, action.link.pageId, action.link.ids, action.style);
    return linked ? commit(state, linked) : state;
  },

  "textStyle/update": (state, action) => {
    if (!isTextStyle(action.style)) return state;
    const restyled = restyleDocument(state.history.present, action.id, pickTextStyle(action.style));
    if (action.name === undefined) return commit(state, restyled);
    const renamed = renameTextStyle(restyled, action.id, action.name);
    return renamed ? commit(state, renamed) : state;
  },

  "textStyle/rename": (state, action) => {
    const renamed = renameTextStyle(state.history.present, action.id, action.name);
    return renamed ? commit(state, renamed) : state;
  },

  "textStyle/delete": (state, action) => commit(state, deleteTextStyle(state.history.present, action.id)),

  "element/applyTextStyle": (state, action) => {
    const document = state.history.present;
    const style = action.styleId === null ? null : document.textStyles.find((s) => s.id === action.styleId);
    if (style === undefined) return state;
    const linked = linkElements(document, targetSheetId(state, action.pageId), action.ids, style);
    return linked ? commit(state, linked) : state;
  },

  "document/rename": (state, action) => {
    const result = validateName(action.name, DOCUMENT_NAME_MAX_LENGTH);
    const document = state.history.present;
    if (result.error || result.data === document.name) return state;
    return commit(state, { ...document, name: result.data });
  },

  // 只改有變的部分：沒變的頁面保留原參考，完全沒變時回傳同一個 state
  "document/setPageSetup": (state, action) => {
    const { size, margins } = action;
    if (!isPageSize(size) || !isMargins(margins)) return state;
    const document = state.history.present;
    // 主頁和頁面同尺寸，主頁的物件才會落在頁面的同一個位置
    const resizeAll = <S extends Sheet>(sheets: readonly S[]): readonly S[] => {
      const resized = sheets.map((sheet) =>
        sheet.width === size.width && sheet.height === size.height
          ? sheet
          : { ...sheet, width: size.width, height: size.height },
      );
      return resized.some((sheet, index) => sheet !== sheets[index]) ? resized : sheets;
    };
    const pages = resizeAll(document.pages);
    const masters = resizeAll(document.masters);
    const pagesChanged = pages !== document.pages || masters !== document.masters;
    const current = document.margins;
    const marginsChanged =
      current.top !== margins.top ||
      current.right !== margins.right ||
      current.bottom !== margins.bottom ||
      current.left !== margins.left;
    if (!pagesChanged && !marginsChanged) return state;
    return commit(state, {
      ...document,
      margins: marginsChanged ? { ...margins } : current,
      pages,
      masters,
    });
  },

  // 依 from 排序後存；內容相同時回傳同一個 state（對話框沒改動也按「確定」不會多一筆復原）
  "document/setPageNumbering": (state, action) => {
    if (!isPageNumberRules(action.rules)) return state;
    const document = state.history.present;
    const rules = sortPageNumberRules(action.rules);
    if (JSON.stringify(rules) === JSON.stringify(document.pageNumberRules)) return state;
    return commit(state, { ...document, pageNumberRules: rules });
  },

  "history/undo": (state) => {
    const { past, present, future } = state.history;
    if (past.length === 0) return state;
    return reconcileSelection({
      ...state,
      history: { past: past.slice(0, -1), present: past[past.length - 1], future: [present, ...future] },
    });
  },

  "history/redo": (state) => {
    const { past, present, future } = state.history;
    if (future.length === 0) return state;
    return reconcileSelection({
      ...state,
      history: { past: [...past, present], present: future[0], future: future.slice(1) },
    });
  },

  "selection/set": (state, action) => {
    const ids = action.id === null ? NO_SELECTION : [action.id];
    if (sameIds(state.selectedIds, ids)) return state;
    if (action.id !== null && !selectActivePage(state).elements.some((element) => element.id === action.id)) {
      return state;
    }
    return { ...state, selectedIds: ids };
  },

  "selection/toggle": (state, action) => {
    if (state.selectedIds.includes(action.id)) {
      return { ...state, selectedIds: state.selectedIds.filter((id) => id !== action.id) };
    }
    if (!selectActivePage(state).elements.some((element) => element.id === action.id)) return state;
    return { ...state, selectedIds: [...state.selectedIds, action.id] };
  },

  "selection/setMany": (state, action) => {
    const existing = new Set(selectActivePage(state).elements.map((element) => element.id));
    const valid = action.ids.filter((id) => existing.has(id));
    const ids = action.additive
      ? [...state.selectedIds, ...valid.filter((id) => !state.selectedIds.includes(id))]
      : valid;
    return sameIds(state.selectedIds, ids) ? state : { ...state, selectedIds: ids };
  },

  "view/setZoom": (state, action) => {
    const zoom = clampZoom(action.zoom);
    return zoom === state.view.zoom ? state : { ...state, view: { ...state.view, zoom } };
  },

  "view/fit": (state) => ({ ...state, view: { ...state.view, fitRequest: state.view.fitRequest + 1 } }),

  // 切到建立工具（文字、圖形）時取消選取，建立前畫面上不留控制框；選取與手形保留原本的選取
  "tool/set": (state, action) => {
    const shapeKind = action.shape ?? state.shapeKind;
    if (action.tool === state.tool && shapeKind === state.shapeKind) return state;
    const creates = action.tool === "text" || action.tool === "shape";
    return { ...state, tool: action.tool, shapeKind, selectedIds: creates ? NO_SELECTION : state.selectedIds };
  },

  // 開啟 / 新增專案：換掉整份文件並清空復原歷史（不能復原到另一個專案的內容）
  "document/load": (state, action) => {
    const initial = createInitialState(action.document);
    return {
      ...initial,
      view: { zoom: state.view.zoom, fitRequest: state.view.fitRequest + 1 },
      // 工具是使用者的操作狀態，換專案時保留
      tool: state.tool,
      shapeKind: state.shapeKind,
      savedDocument: action.saved ? action.document : null,
    };
  },

  // 存檔期間若又有修改，present 已經不是存下的那份文件，仍會是「未存檔」
  "document/markSaved": (state, action) =>
    state.savedDocument === action.document ? state : { ...state, savedDocument: action.document },
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
