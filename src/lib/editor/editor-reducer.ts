import { createPage, createSampleDocument, type ShapeKind } from "./element-factory";
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
  validateName,
} from "./validation";
import { clampZoom } from "./viewport";
import type {
  AssetInfo,
  CanvasElement,
  EditorDocument,
  ElementId,
  ElementPatch,
  Margins,
  Page,
  PageId,
  Size,
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
  /** Selected elements on the active page, in the order they were selected; empty when nothing is selected. */
  readonly selectedIds: readonly ElementId[];
  readonly view: EditorView;
  /** Active canvas tool (bottom toolbar). */
  readonly tool: ToolId;
  /** Shape the shape tool creates; also the last shape used, shown on the toolbar button. */
  readonly shapeKind: ShapeKind;
  /** Images stored in the project; saved with it but not part of undo history. */
  readonly assets: readonly AssetInfo[];
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

export type EditorAction =
  | { readonly type: "element/add"; readonly element: CanvasElement }
  | { readonly type: "element/update"; readonly id: ElementId; readonly patch: ElementPatch }
  /** Several elements in one undo step (moving a multi-selection); any invalid patch rejects them all. */
  | { readonly type: "element/updateMany"; readonly patches: readonly ElementPatchEntry[] }
  | { readonly type: "element/delete"; readonly ids: readonly ElementId[] }
  /** up / down: one layer; top / bottom: to the front / back of the page. */
  | { readonly type: "element/reorder"; readonly id: ElementId; readonly direction: "up" | "down" | "top" | "bottom" }
  | { readonly type: "element/duplicate"; readonly copies: readonly ElementCopy[] }
  /** `after` 省略時加在最後（「+」按鈕），有值時插在該頁後面（「插入頁面」） */
  | { readonly type: "page/add"; readonly after?: PageId }
  | { readonly type: "page/select"; readonly id: PageId }
  | { readonly type: "page/rename"; readonly id: PageId; readonly name: string }
  | { readonly type: "page/delete"; readonly id: PageId }
  | { readonly type: "page/setBackground"; readonly id: PageId; readonly color: string }
  | { readonly type: "document/rename"; readonly name: string }
  /** Page setup dialog: resizes every page (elements stay where they are) and sets the margins, in one undo step. */
  | { readonly type: "document/setPageSetup"; readonly size: Size; readonly margins: Margins }
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
  | { readonly type: "asset/add"; readonly asset: AssetInfo }
  | {
      readonly type: "document/load";
      readonly document: EditorDocument;
      readonly assets: readonly AssetInfo[];
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
 *   assets: Images stored with the document.
 *
 * Returns:
 *   Editor state with the first page active.
 */
export function createInitialState(
  document: EditorDocument = createSampleDocument(),
  assets: readonly AssetInfo[] = [],
): EditorState {
  return {
    history: { past: [], present: document, future: [] },
    activePageId: document.pages[0].id,
    selectedIds: NO_SELECTION,
    view: { zoom: 1, fitRequest: 1 },
    tool: DEFAULT_TOOL,
    shapeKind: DEFAULT_SHAPE_KIND,
    assets,
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
 * Returns the active page; falls back to the first page if the id is stale.
 *
 * Args:
 *   state: Editor state.
 *
 * Returns:
 *   Active page.
 */
export function selectActivePage(state: EditorState): Page {
  const { pages } = state.history.present;
  return pages.find((page) => page.id === state.activePageId) ?? pages[0];
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

function updateActivePage(state: EditorState, update: (page: Page) => Page): EditorState {
  const document = state.history.present;
  const active = selectActivePage(state);
  const next = update(active);
  if (next === active) return state;
  return commit(state, {
    ...document,
    pages: document.pages.map((page) => (page.id === active.id ? next : page)),
  });
}

function updatePage(state: EditorState, id: PageId, update: (page: Page) => Page): EditorState {
  const document = state.history.present;
  const target = document.pages.find((page) => page.id === id);
  if (!target) return state;
  const next = update(target);
  if (next === target) return state;
  return commit(state, { ...document, pages: document.pages.map((page) => (page.id === id ? next : page)) });
}

/** undo/redo 後頁面或物件可能已不存在，校正 UI 狀態避免指向失效的 id。 */
function reconcileSelection(state: EditorState): EditorState {
  const { pages } = state.history.present;
  const activePage = pages.find((page) => page.id === state.activePageId) ?? pages[0];
  const existing = new Set(activePage.elements.map((element) => element.id));
  const valid = state.selectedIds.filter((id) => existing.has(id));
  return {
    ...state,
    activePageId: activePage.id,
    selectedIds: valid.length === state.selectedIds.length ? state.selectedIds : valid,
  };
}

// 屬性面板的數字欄位、拖曳結果都直接來自使用者操作：不合法的 patch 一律不接受
function isValidPatch(patch: ElementPatch): boolean {
  if ("fill" in patch && (typeof patch.fill !== "string" || !isElementColor(patch.fill))) return false;
  if ("stroke" in patch && patch.stroke !== null && !isStroke(patch.stroke)) return false;
  if ("label" in patch && patch.label !== null && !isShapeLabel(patch.label)) return false;
  if ("geometry" in patch && !isShapeGeometry(patch.geometry)) return false;
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

function updateElements(state: EditorState, entries: readonly ElementPatchEntry[]): EditorState {
  if (!entries.every((entry) => isValidPatch(entry.patch))) return state;
  const patches = new Map(entries.map((entry) => [entry.id, entry.patch]));
  // 全部的變更放在同一次 commit：多選移動 = 一筆復原
  return updateActivePage(state, (page) => {
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

function sameIds(a: readonly ElementId[], b: readonly ElementId[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function nextPageName(pages: readonly Page[]): string {
  const used = pages
    .map((page) => /^Page-(\d+)$/.exec(page.name))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number(match[1]));
  return `Page-${Math.max(pages.length, ...used) + 1}`;
}

const HANDLERS: { readonly [T in EditorAction["type"]]: ActionHandler<T> } = {
  "element/add": (state, action) => {
    const next = updateActivePage(state, (page) => ({ ...page, elements: [...page.elements, action.element] }));
    return { ...next, selectedIds: [action.element.id] };
  },

  "element/update": (state, action) => updateElements(state, [{ id: action.id, patch: action.patch }]),

  "element/updateMany": (state, action) => updateElements(state, action.patches),

  "element/delete": (state, action) => {
    const ids = new Set(action.ids);
    const next = updateActivePage(state, (page) => {
      const elements = page.elements.filter((element) => !ids.has(element.id));
      return elements.length === page.elements.length ? page : { ...page, elements };
    });
    return next === state ? state : reconcileSelection(next);
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

  // 新頁面沿用目前頁面的尺寸與背景
  "page/add": (state, action) => {
    const document = state.history.present;
    const active = selectActivePage(state);
    const afterIndex = action.after === undefined ? -1 : document.pages.findIndex((p) => p.id === action.after);
    if (action.after !== undefined && afterIndex === -1) return state;
    const page = createPage(nextPageName(document.pages), active, active.background);
    const pages = [...document.pages];
    pages.splice(afterIndex === -1 ? pages.length : afterIndex + 1, 0, page);
    return { ...commit(state, { ...document, pages }), activePageId: page.id, selectedIds: NO_SELECTION };
  },

  "page/select": (state, action) => {
    if (action.id === state.activePageId) return state;
    if (!state.history.present.pages.some((page) => page.id === action.id)) return state;
    return { ...state, activePageId: action.id, selectedIds: NO_SELECTION };
  },

  "page/rename": (state, action) => {
    const result = validateName(action.name, PAGE_NAME_MAX_LENGTH);
    if (result.error) return state;
    return updatePage(state, action.id, (page) => (page.name === result.data ? page : { ...page, name: result.data }));
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

  "page/setBackground": (state, action) => {
    if (!isHexColor(action.color)) return state;
    return updatePage(state, action.id, (page) =>
      page.background === action.color ? page : { ...page, background: action.color },
    );
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
    let pagesChanged = false;
    const pages = document.pages.map((page) => {
      if (page.width === size.width && page.height === size.height) return page;
      pagesChanged = true;
      return { ...page, width: size.width, height: size.height };
    });
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
      pages: pagesChanged ? pages : document.pages,
    });
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

  // 圖片以內容 hash 命名，同一張圖再次匯入會得到相同的 src，不重複列出
  "asset/add": (state, action) =>
    state.assets.some((asset) => asset.src === action.asset.src)
      ? state
      : { ...state, assets: [...state.assets, action.asset] },

  // 開啟 / 新增專案：換掉整份文件並清空復原歷史（不能復原到另一個專案的內容）
  "document/load": (state, action) => {
    const initial = createInitialState(action.document, action.assets);
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
  return handler(state, action);
}
