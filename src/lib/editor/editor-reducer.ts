import { createPage, createSampleDocument, type ShapeKind } from "./element-factory";
import { DEFAULT_SHAPE_KIND, DEFAULT_TOOL, type ToolId } from "./tools";
import { DOCUMENT_NAME_MAX_LENGTH, PAGE_NAME_MAX_LENGTH, isHexColor, validateName } from "./validation";
import { clampZoom } from "./viewport";
import type {
  AssetInfo,
  CanvasElement,
  EditorDocument,
  ElementId,
  ElementPatch,
  Page,
  PageId,
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
  readonly selectedId: ElementId | null;
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

export type EditorAction =
  | { readonly type: "element/add"; readonly element: CanvasElement }
  | { readonly type: "element/update"; readonly id: ElementId; readonly patch: ElementPatch }
  | { readonly type: "element/delete"; readonly id: ElementId }
  | { readonly type: "element/reorder"; readonly id: ElementId; readonly direction: "up" | "down" }
  /** `newId` comes from the caller so the reducer stays pure (React may run it twice). */
  | { readonly type: "element/duplicate"; readonly id: ElementId; readonly newId: ElementId }
  | { readonly type: "page/add" }
  | { readonly type: "page/select"; readonly id: PageId }
  | { readonly type: "page/rename"; readonly id: PageId; readonly name: string }
  | { readonly type: "page/delete"; readonly id: PageId }
  | { readonly type: "page/setBackground"; readonly id: PageId; readonly color: string }
  | { readonly type: "document/rename"; readonly name: string }
  | { readonly type: "history/undo" }
  | { readonly type: "history/redo" }
  | { readonly type: "selection/set"; readonly id: ElementId | null }
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
    selectedId: null,
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
 * Returns the selected element on the active page.
 *
 * Args:
 *   state: Editor state.
 *
 * Returns:
 *   Selected element, or null.
 */
export function selectSelectedElement(state: EditorState): CanvasElement | null {
  if (state.selectedId === null) return null;
  return selectActivePage(state).elements.find((element) => element.id === state.selectedId) ?? null;
}

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
  const selectionValid =
    state.selectedId !== null && activePage.elements.some((element) => element.id === state.selectedId);
  return {
    ...state,
    activePageId: activePage.id,
    selectedId: selectionValid ? state.selectedId : null,
  };
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
    return { ...next, selectedId: action.element.id };
  },

  "element/update": (state, action) =>
    updateActivePage(state, (page) => {
      const index = page.elements.findIndex((element) => element.id === action.id);
      if (index === -1) return page;
      const current = page.elements[index];
      const changed = Object.entries(action.patch).some(
        ([key, value]) => (current as unknown as Record<string, unknown>)[key] !== value,
      );
      if (!changed) return page;
      // patch 型別為各物件屬性的聯集；呼叫端依選取物件的 type 傳入對應欄位
      const updated = { ...current, ...action.patch } as CanvasElement;
      const elements = [...page.elements];
      elements[index] = updated;
      return { ...page, elements };
    }),

  "element/delete": (state, action) => {
    const next = updateActivePage(state, (page) => {
      const elements = page.elements.filter((element) => element.id !== action.id);
      return elements.length === page.elements.length ? page : { ...page, elements };
    });
    return state.selectedId === action.id ? { ...next, selectedId: null } : next;
  },

  "element/reorder": (state, action) =>
    updateActivePage(state, (page) => {
      const index = page.elements.findIndex((element) => element.id === action.id);
      const target = action.direction === "up" ? index + 1 : index - 1;
      if (index === -1 || target < 0 || target >= page.elements.length) return page;
      const elements = [...page.elements];
      [elements[index], elements[target]] = [elements[target], elements[index]];
      return { ...page, elements };
    }),

  // 複本放在原物件正上方一層（不是最上層），位移一點以便看出是新的物件
  "element/duplicate": (state, action) => {
    const page = selectActivePage(state);
    const index = page.elements.findIndex((element) => element.id === action.id);
    if (index === -1 || page.elements.some((element) => element.id === action.newId)) return state;
    const original = page.elements[index];
    const copy: CanvasElement = {
      ...original,
      id: action.newId,
      x: original.x + DUPLICATE_OFFSET_PT,
      y: original.y + DUPLICATE_OFFSET_PT,
    };
    const next = updateActivePage(state, (p) => {
      const elements = [...p.elements];
      elements.splice(index + 1, 0, copy);
      return { ...p, elements };
    });
    return { ...next, selectedId: copy.id };
  },

  "page/add": (state) => {
    const document = state.history.present;
    const active = selectActivePage(state);
    const page = createPage(nextPageName(document.pages), active, active.background);
    const activeIndex = document.pages.findIndex((p) => p.id === active.id);
    const pages = [...document.pages];
    pages.splice(activeIndex + 1, 0, page);
    return { ...commit(state, { ...document, pages }), activePageId: page.id, selectedId: null };
  },

  "page/select": (state, action) => {
    if (action.id === state.activePageId) return state;
    if (!state.history.present.pages.some((page) => page.id === action.id)) return state;
    return { ...state, activePageId: action.id, selectedId: null };
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
    return { ...next, activePageId: pages[Math.max(0, index - 1)].id, selectedId: null };
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
    if (state.selectedId === action.id) return state;
    if (action.id !== null && !selectActivePage(state).elements.some((element) => element.id === action.id)) {
      return state;
    }
    return { ...state, selectedId: action.id };
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
    return { ...state, tool: action.tool, shapeKind, selectedId: creates ? null : state.selectedId };
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
