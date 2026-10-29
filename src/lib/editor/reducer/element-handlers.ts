import { DUPLICATE_OFFSET_PT, selectActivePage } from "../editor-reducer";
import { hasValidSwatchLinks } from "../swatches";
import type { CanvasElement } from "../types";
import {
  applyPatch,
  commit,
  hasValidStyleLinks,
  isValidElementShape,
  isValidPatch,
  reconcileSelection,
  targetSheetId,
  updateActivePage,
  updateElements,
  updateSheet,
  type HandlerMap,
} from "./helpers";

export const ELEMENT_HANDLERS = {
  "element/add": (state, action) => {
    if (!isValidElementShape(action.element)) return state;
    if (!hasValidStyleLinks(state.history.present, action.element)) return state;
    if (!hasValidSwatchLinks(state.history.present, action.element)) return state;
    const sheetId = targetSheetId(state, action.pageId);
    const next = updateSheet(state, sheetId, (page) => ({ ...page, elements: [...page.elements, action.element] }));
    if (next === state) return state;
    // 選取只屬於目前頁：加到別頁時不動目前的選取
    return sheetId === selectActivePage(state).id ? { ...next, selectedIds: [action.element.id] } : next;
  },

  "element/update": (state, action) => updateElements(state, [{ id: action.id, patch: action.patch }], action.pageId),
  "element/replace": (state, action) => {
    const { element } = action;
    const document = state.history.present;
    if (!isValidElementShape(element)) return state;
    if (!hasValidStyleLinks(document, element)) return state;
    if (!hasValidSwatchLinks(document, element)) return state;
    return updateSheet(state, targetSheetId(state, action.pageId), (sheet) => {
      const index = sheet.elements.findIndex((candidate) => candidate.id === element.id);
      if (index === -1 || sheet.elements[index] === element) return sheet;
      return { ...sheet, elements: sheet.elements.map((candidate, i) => (i === index ? element : candidate)) };
    });
  },

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
} satisfies Partial<HandlerMap>;
