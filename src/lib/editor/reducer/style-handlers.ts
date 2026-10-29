import { findSheet, isMasterId } from "../master-pages";
import { addProjectFont, applyFontEdits, deleteProjectFont, updateProjectFont } from "../project-fonts";
import {
  TEXT_STYLE_NAME_MAX_LENGTH,
  deleteTextStyle,
  isTextStyleSheet,
  linkTextStyle,
  mapElementText,
  pickTextStyle,
  restyleDocument,
  styledTextOf,
} from "../style-sheet";
import { applySwatchEdits, deleteSwatch, hasValidSwatchLinks, updateSwatch } from "../swatches";
import { isTextStyle, validateName } from "../validation";
import type { EditorDocument, ElementId, PageId, Sheet, TextStyleDef } from "../types";
import { commit, targetSheetId, type HandlerMap } from "./helpers";

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

export const STYLE_HANDLERS = {
  "textStyle/add": (state, action) => {
    const document = state.history.present;
    const textStyles = [...document.textStyles, action.style];
    if (!isTextStyleSheet(textStyles) || !hasValidSwatchLinks(document, action.style)) return state;
    const added = { ...document, textStyles };
    if (!action.link) return commit(state, added);
    // 連結的文字和新樣式同一筆復原；頁面不存在就整個不做
    const linked = linkElements(added, action.link.pageId, action.link.ids, action.style);
    return linked ? commit(state, linked) : state;
  },

  "textStyle/update": (state, action) => {
    if (!isTextStyle(action.style) || !hasValidSwatchLinks(state.history.present, action.style)) return state;
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

  "swatch/add": (state, action) => {
    const document = state.history.present;
    const next = applySwatchEdits(document, [...document.swatches, action.swatch], []);
    return next ? commit(state, next) : state;
  },

  "swatch/update": (state, action) => {
    const change = {
      ...(action.name !== undefined && { name: action.name.trim() }),
      ...(action.color !== undefined && { color: action.color }),
    };
    const next = updateSwatch(state.history.present, action.id, change);
    return next ? commit(state, next) : state;
  },

  "swatch/delete": (state, action) => {
    const next = deleteSwatch(state.history.present, action.id, action.replaceWith);
    return next ? commit(state, next) : state;
  },

  "swatch/applyEdits": (state, action) => {
    const next = applySwatchEdits(state.history.present, action.swatches, action.deletions);
    return next ? commit(state, next) : state;
  },

  "font/add": (state, action) => {
    const next = addProjectFont(state.history.present, action.font);
    return next ? commit(state, next) : state;
  },

  "font/update": (state, action) => {
    const next = updateProjectFont(state.history.present, action.id, action.change);
    return next ? commit(state, next) : state;
  },

  "font/delete": (state, action) => {
    const next = deleteProjectFont(state.history.present, action.id, action.replaceWith);
    return next ? commit(state, next) : state;
  },

  "font/applyEdits": (state, action) => {
    const next = applyFontEdits(state.history.present, action.fonts, action.deletions);
    return next ? commit(state, next) : state;
  },
} satisfies Partial<HandlerMap>;
