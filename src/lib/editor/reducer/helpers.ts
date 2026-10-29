import {
  HISTORY_LIMIT,
  selectActivePage,
  type EditorAction,
  type EditorState,
  type ElementPatchEntry,
} from "../editor-reducer";
import { copyElements, findSheet, isMasterId } from "../master-pages";
import { hasValidSwatchLinks } from "../swatches";
import { hasValidTextIndent } from "../text-indent";
import { isLetterSpacing, isLineHeight } from "../text-style";
import {
  PAGE_NAME_MAX_LENGTH,
  isElementColor,
  isShapeGeometry,
  isShapeImage,
  isValidLine,
  isShapeLabel,
  isStroke,
  isSwatchLink,
  isTextShadow,
} from "../validation";
import type { CanvasElement, EditorDocument, ElementId, ElementPatch, MasterPage, Page, PageId, Sheet } from "../types";

export const NO_SELECTION: readonly ElementId[] = [];

export type ActionOf<T extends EditorAction["type"]> = Extract<EditorAction, { readonly type: T }>;
export type ActionHandler<T extends EditorAction["type"]> = (state: EditorState, action: ActionOf<T>) => EditorState;
export type HandlerMap = { readonly [T in EditorAction["type"]]: ActionHandler<T> };

export function commit(state: EditorState, next: EditorDocument): EditorState {
  if (next === state.history.present) return state;
  const past = [...state.history.past, state.history.present].slice(-HISTORY_LIMIT);
  return { ...state, history: { past, present: next, future: [] } };
}

/**
 * Updates one page or master page. `update` only replaces common fields (spreading the sheet), so
 * the result keeps the kind and the `masterId` / `parentId` of the original.
 */
export function updateSheet(state: EditorState, id: PageId, update: (sheet: Sheet) => Sheet): EditorState {
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

export function updateActivePage(state: EditorState, update: (sheet: Sheet) => Sheet): EditorState {
  return updateSheet(state, selectActivePage(state).id, update);
}

/** `pageId` when given (see `EditorAction`), else the active page. */
export function targetSheetId(state: EditorState, pageId: PageId | undefined): PageId {
  return pageId ?? selectActivePage(state).id;
}

// 複本的名稱：原名加「複本」，超過長度上限時截斷原名
function copyName(name: string): string {
  const suffix = " 複本";
  return Array.from(name).slice(0, PAGE_NAME_MAX_LENGTH - suffix.length).join("") + suffix;
}

/** Inserts a copy right after the sheet with `id`; returns null when the ids do not fit. */
export function duplicateIn<S extends Sheet>(
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
export function reconcileSelection(state: EditorState): EditorState {
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
export function isValidPatch(patch: ElementPatch): boolean {
  if ("fill" in patch && (typeof patch.fill !== "string" || !isElementColor(patch.fill))) return false;
  if ("fillSwatchId" in patch && !isSwatchLink(patch.fillSwatchId)) return false;
  if ("stroke" in patch && patch.stroke !== null && !isStroke(patch.stroke)) return false;
  if ("label" in patch && patch.label !== null && !isShapeLabel(patch.label)) return false;
  if ("geometry" in patch && !isShapeGeometry(patch.geometry)) return false;
  if ("image" in patch && patch.image !== null && !isShapeImage(patch.image)) return false;
  if ("shadow" in patch && patch.shadow !== null && !isTextShadow(patch.shadow)) return false;
  const fields: Record<string, unknown> = patch;
  if (TEXT_FLAGS.some((flag) => flag in fields && typeof fields[flag] !== "boolean")) return false;
  if ("lineHeight" in fields && !isLineHeight(fields.lineHeight)) return false;
  if ("letterSpacing" in fields && !isLetterSpacing(fields.letterSpacing)) return false;
  // NaN / Infinity 一律不接受
  return !Object.values(patch).some((value) => typeof value === "number" && !Number.isFinite(value));
}

/**
 * Checks the fields a patch cannot check alone: a line's points, stroke and ends (`isValidLine`), and
 * a text's indents (the first line depends on the left indent, a patch may set only one of them).
 */
export function isValidElementShape(element: CanvasElement): boolean {
  switch (element.type) {
    case "line":
      return isValidLine(element);
    case "text":
      return hasValidTextIndent(element);
    case "shape":
      // 新增的物件不經過 isValidPatch，照片在這裡檢查
      return (
        (element.label === null || hasValidTextIndent(element.label)) &&
        (element.image === null || isShapeImage(element.image))
      );
    case "image":
      return true;
  }
}

/** Applies a validated patch; returns the same element when nothing changes. */
export function applyPatch(current: CanvasElement, patch: ElementPatch): CanvasElement {
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
export function hasValidStyleLinks(document: EditorDocument, value: CanvasElement | ElementPatch): boolean {
  const fields = value as Record<string, unknown>;
  if ("styleId" in fields && !isStyleLink(document, fields.styleId)) return false;
  const label = fields.label as { readonly styleId?: unknown } | null | undefined;
  return !label || isStyleLink(document, label.styleId);
}

// 只給顏色、沒給連結 = 不連到色票（同 page/setBackground 省略 swatchId）
function withFillLink(patch: ElementPatch): ElementPatch {
  return "fill" in patch && !("fillSwatchId" in patch) ? { ...patch, fillSwatchId: null } : patch;
}

export function updateElements(state: EditorState, entries: readonly ElementPatchEntry[], pageId?: PageId): EditorState {
  const document = state.history.present;
  if (!entries.every((entry) => isValidPatch(entry.patch))) return state;
  if (!entries.every((entry) => hasValidStyleLinks(document, entry.patch))) return state;
  const patches = new Map(entries.map((entry) => [entry.id, withFillLink(entry.patch)]));
  // 色票連結看套用後的物件：只改顏色或只改連結時，兩者也要對得上
  const sheet = findSheet(document, targetSheetId(state, pageId));
  const patched = sheet?.elements.filter((element) => patches.has(element.id)) ?? [];
  if (!patched.every((element) => hasValidSwatchLinks(document, applyPatch(element, patches.get(element.id)!)))) return state;
  // 線條的欄位（點、線條、兩端）看套用後的整條線
  if (!patched.every((element) => isValidElementShape(applyPatch(element, patches.get(element.id)!)))) return state;
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

export function sameIds(a: readonly ElementId[], b: readonly ElementId[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
