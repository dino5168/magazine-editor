import { HISTORY_LIMIT, createInitialState, editorReducer, isBatchableAction, selectActivePage } from "../editor-reducer";
import { isPageNumberRules, sortPageNumberRules } from "../page-numbers";
import { hasValidSwatchLinks } from "../swatches";
import { isCreateTool } from "../tools";
import { DOCUMENT_NAME_MAX_LENGTH, isMargins, isPageSize, validateName } from "../validation";
import { clampZoom } from "../viewport";
import type { Sheet } from "../types";
import { NO_SELECTION, commit, reconcileSelection, sameIds, type HandlerMap } from "./helpers";

export const DOCUMENT_HANDLERS = {
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
    const document = state.history.present;
    if (!isPageNumberRules(action.rules) || !hasValidSwatchLinks(document, action.rules)) return state;
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

  // 依序套用，最後把歷史收成一筆（中途每個 action 各自 commit，所以從原本的歷史重建）；
  // 文件沒變時只保留頁面 / 選取等 UI 狀態的變化，不進歷史
  "history/batch": (state, action) => {
    if (action.actions.length === 0 || !action.actions.every(isBatchableAction)) return state;
    const next = action.actions.reduce(editorReducer, state);
    if (next === state) return state;
    const { past, present } = state.history;
    if (next.history.present === present) return { ...next, history: state.history };
    return {
      ...next,
      history: { past: [...past, present].slice(-HISTORY_LIMIT), present: next.history.present, future: [] },
    };
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

  // 切到建立工具（文字、圖形、線條）時取消選取，建立前畫面上不留控制框；選取與手形保留原本的選取
  "tool/set": (state, action) => {
    const shapeKind = action.shape ?? state.shapeKind;
    const lineKind = action.line ?? state.lineKind;
    if (action.tool === state.tool && shapeKind === state.shapeKind && lineKind === state.lineKind) return state;
    const creates = isCreateTool(action.tool);
    return { ...state, tool: action.tool, shapeKind, lineKind, selectedIds: creates ? NO_SELECTION : state.selectedIds };
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
      lineKind: state.lineKind,
      savedDocument: action.saved ? action.document : null,
    };
  },

  // 存檔期間若又有修改，present 已經不是存下的那份文件，仍會是「未存檔」
  "document/markSaved": (state, action) =>
    state.savedDocument === action.document ? state : { ...state, savedDocument: action.document },
} satisfies Partial<HandlerMap>;
