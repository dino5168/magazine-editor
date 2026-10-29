import { createPage, nextPageNames } from "../element-factory";
import { selectActivePage } from "../editor-reducer";
import { canSetParent, deleteMaster, findSheet, isMasterId } from "../master-pages";
import { isPageOrder } from "../page-order";
import { hasValidSwatchLinks } from "../swatches";
import { PAGE_NAME_MAX_LENGTH, isHexColor, isPageSize, validateName } from "../validation";
import type { Page } from "../types";
import { NO_SELECTION, commit, duplicateIn, updateSheet, type HandlerMap } from "./helpers";

export const PAGE_HANDLERS = {
  // 新頁面沿用目前頁面的尺寸、背景與主頁（目前在編輯主頁時，新頁面套用該主頁）
  "page/add": (state, action) => {
    const document = state.history.present;
    const active = selectActivePage(state);
    const afterIndex = action.after === undefined ? -1 : document.pages.findIndex((p) => p.id === action.after);
    if (action.after !== undefined && afterIndex === -1) return state;
    const masterId = isMasterId(document, active.id) ? active.id : (active as Page).masterId;
    const page = createPage(nextPageNames(document.pages, 1)[0], active, active.background, masterId, active.backgroundSwatchId);
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
          !hasValidSwatchLinks(document, page) ||
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
    const swatchId = action.swatchId ?? null;
    if (!isHexColor(action.color)) return state;
    if (!hasValidSwatchLinks(state.history.present, { background: action.color, backgroundSwatchId: swatchId })) return state;
    return updateSheet(state, action.id, (sheet) =>
      sheet.background === action.color && sheet.backgroundSwatchId === swatchId
        ? sheet
        : { ...sheet, background: action.color, backgroundSwatchId: swatchId },
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
      !hasValidSwatchLinks(document, master) ||
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
} satisfies Partial<HandlerMap>;
