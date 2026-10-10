/**
 * 唯讀查詢：把編輯器狀態整理成給 AI 看的精簡 JSON。
 *
 * 只讀 `history.present` 與目前頁，不改任何東西。數字四捨五入到 0.01 pt（清單）或原樣（單一物件）。
 */
import { selectActivePage, selectIsDirty, type EditorState } from "@/lib/editor/editor-reducer";
import { findFontOption } from "@/lib/editor/fonts";
import { findSheet, pagesUsingMaster } from "@/lib/editor/master-pages";
import { styledTextOf, textStyleUsage } from "@/lib/editor/style-sheet";
import type { CanvasElement, PageId, Sheet, TextShadow, TextStyleDef } from "@/lib/editor/types";
import type { Result } from "@/lib/editor/validation";

/** Longest text excerpt in element lists (characters, not UTF-16 units). */
export const TEXT_EXCERPT_LENGTH = 80;

export interface DocumentSummary {
  readonly name: string;
  readonly unit: "pt";
  readonly pageCount: number;
  readonly masterCount: number;
  /** Distinct page sizes, most common first; pages usually share one. */
  readonly pageSizes: readonly { readonly width: number; readonly height: number; readonly pages: number }[];
  readonly margins: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
  readonly pageNumberRules: number;
  readonly textStyles: number;
  readonly unsavedChanges: boolean;
  /** What the user is looking at: a page, or a master page being edited. */
  readonly activeSheet: SheetRef;
}

export interface SheetRef {
  readonly id: PageId;
  readonly name: string;
  readonly kind: "page" | "master";
  /** 1-based position for pages; null for master pages. */
  readonly index: number | null;
}

export interface PageSummary {
  readonly index: number;
  readonly id: PageId;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly background: string;
  readonly masterId: PageId | null;
  readonly elementCount: number;
}

export interface MasterSummary {
  readonly id: PageId;
  readonly name: string;
  readonly parentId: PageId | null;
  readonly width: number;
  readonly height: number;
  readonly background: string;
  readonly elementCount: number;
  /** Pages showing this master, directly or through a child master. */
  readonly usedByPages: number;
}

export interface ElementSummary {
  readonly id: string;
  readonly type: CanvasElement["type"];
  /** 0 = bottom-most. */
  readonly layer: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  /** Text elements have no stored height (it follows the text); omitted for them. */
  readonly height?: number;
  readonly rotation: number;
  /** Text (excerpt), shape kind and label, or image source. */
  readonly summary: string;
  /** Name of the text style the text (or the shape's label) is linked to; omitted when none. */
  readonly textStyle?: string;
}

/** A text style in the vocabulary of the tools' style arguments (`add_text`). */
export interface TextStyleSummary {
  readonly id: string;
  readonly name: string;
  /** Font menu name (黑體…), or the CSS family when it is not one of them. */
  readonly font: string;
  readonly fontSize: number;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly strikethrough: boolean;
  readonly align: "left" | "center" | "right";
  readonly textColor: string;
  readonly shadow: TextShadow | null;
  /** Texts linked to it (text elements and shape labels, pages and master pages). */
  readonly usedBy: number;
}

export interface ElementDetail {
  readonly sheet: SheetRef;
  readonly layer: number;
  readonly element: CanvasElement;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Excerpt of a text on one line, cut at `TEXT_EXCERPT_LENGTH` characters. */
export function excerpt(text: string): string {
  const oneLine = text.replace(/\r?\n/g, " ⏎ ");
  const characters = Array.from(oneLine);
  return characters.length <= TEXT_EXCERPT_LENGTH
    ? oneLine
    : `${characters.slice(0, TEXT_EXCERPT_LENGTH).join("")}…`;
}

function sheetRef(state: EditorState, sheet: Sheet): SheetRef {
  const index = state.history.present.pages.findIndex((page) => page.id === sheet.id);
  return index >= 0
    ? { id: sheet.id, name: sheet.name, kind: "page", index: index + 1 }
    : { id: sheet.id, name: sheet.name, kind: "master", index: null };
}

function elementSummary(element: CanvasElement): string {
  switch (element.type) {
    case "text":
      return `文字「${excerpt(element.text)}」`;
    case "shape": {
      const label = element.label ? `，內文「${excerpt(element.label.text)}」` : "";
      return `圖形 ${element.geometry.kind}，填色 ${element.fill}${label}`;
    }
    case "image":
      return `圖片 ${element.src}`;
  }
}

/**
 * Summary of the open document (tool `get_document`).
 *
 * Args:
 *   state: Editor state.
 *
 * Returns:
 *   Name, counts, page sizes, margins, unsaved flag and the sheet the user is looking at.
 */
export function getDocumentSummary(state: EditorState): DocumentSummary {
  const document = state.history.present;
  const sizes = new Map<string, { width: number; height: number; pages: number }>();
  for (const page of document.pages) {
    const width = round(page.width);
    const height = round(page.height);
    const key = `${width}x${height}`;
    const entry = sizes.get(key);
    if (entry) entry.pages += 1;
    else sizes.set(key, { width, height, pages: 1 });
  }
  const { top, right, bottom, left } = document.margins;
  return {
    name: document.name,
    unit: "pt",
    pageCount: document.pages.length,
    masterCount: document.masters.length,
    pageSizes: [...sizes.values()].sort((a, b) => b.pages - a.pages),
    margins: { top: round(top), right: round(right), bottom: round(bottom), left: round(left) },
    pageNumberRules: document.pageNumberRules.length,
    textStyles: document.textStyles.length,
    unsavedChanges: selectIsDirty(state),
    activeSheet: sheetRef(state, selectActivePage(state)),
  };
}

/**
 * Pages in document order and master pages (tool `list_pages`).
 *
 * Args:
 *   state: Editor state.
 *
 * Returns:
 *   Page and master page summaries.
 */
export function listPages(state: EditorState): { pages: PageSummary[]; masters: MasterSummary[] } {
  const document = state.history.present;
  return {
    pages: document.pages.map((page, index) => ({
      index: index + 1,
      id: page.id,
      name: page.name,
      width: round(page.width),
      height: round(page.height),
      background: page.background,
      masterId: page.masterId,
      elementCount: page.elements.length,
    })),
    masters: document.masters.map((master) => ({
      id: master.id,
      name: master.name,
      parentId: master.parentId,
      width: round(master.width),
      height: round(master.height),
      background: master.background,
      elementCount: master.elements.length,
      usedByPages: pagesUsingMaster(document, master.id).length,
    })),
  };
}

/**
 * Elements of one page or master page, bottom first (tool `list_elements`).
 *
 * Args:
 *   state: Editor state.
 *   pageId: Page or master page; omitted = the sheet the user is looking at.
 *
 * Returns:
 *   The sheet and its element summaries, or an error when the id is unknown.
 */
export function listElements(
  state: EditorState,
  pageId?: PageId,
): Result<{ sheet: SheetRef; elements: ElementSummary[] }> {
  const sheet = pageId === undefined ? selectActivePage(state) : findSheet(state.history.present, pageId);
  if (!sheet) return { data: null, error: new Error(`找不到頁面「${pageId}」，請先用 list_pages 取得 id`) };
  const styleNames = new Map(state.history.present.textStyles.map((style) => [style.id, style.name]));
  const elements = sheet.elements.map((element, layer) => ({
    id: element.id,
    type: element.type,
    layer,
    x: round(element.x),
    y: round(element.y),
    width: round(element.width),
    ...(element.type === "text" ? {} : { height: round(element.height) }),
    rotation: round(element.rotation),
    summary: elementSummary(element),
    ...linkedStyle(element, styleNames),
  }));
  return { data: { sheet: sheetRef(state, sheet), elements }, error: null };
}

/**
 * One element with every field, searched on pages and master pages (tool `get_element`).
 *
 * Args:
 *   state: Editor state.
 *   id: Element id.
 *
 * Returns:
 *   The element, its sheet and layer, or an error when no sheet has it.
 */
export function getElement(state: EditorState, id: string): Result<ElementDetail> {
  const document = state.history.present;
  for (const sheet of [...document.pages, ...document.masters]) {
    const layer = sheet.elements.findIndex((element) => element.id === id);
    if (layer >= 0) {
      return { data: { sheet: sheetRef(state, sheet), layer, element: sheet.elements[layer] }, error: null };
    }
  }
  return { data: null, error: new Error(`找不到物件「${id}」，請先用 list_elements 取得 id`) };
}

function linkedStyle(element: CanvasElement, names: ReadonlyMap<string, string>): { textStyle?: string } {
  const styleId = styledTextOf(element)?.styleId;
  const name = styleId ? names.get(styleId) : undefined;
  return name === undefined ? {} : { textStyle: name };
}

function styleSummary(style: TextStyleDef, usedBy: number): TextStyleSummary {
  return {
    id: style.id,
    name: style.name,
    font: findFontOption(style.fontFamily)?.label ?? style.fontFamily,
    fontSize: style.fontSize,
    bold: style.fontStyle === "bold",
    italic: style.italic,
    underline: style.underline,
    strikethrough: style.strikethrough,
    align: style.align,
    textColor: style.fill,
    shadow: style.shadow,
    usedBy,
  };
}

/**
 * The document's text styles (tool `list_text_styles`).
 *
 * Args:
 *   state: Editor state.
 *
 * Returns:
 *   Every style with its fields and how many texts are linked to it.
 */
export function listTextStyles(state: EditorState): TextStyleSummary[] {
  const document = state.history.present;
  const usage = textStyleUsage(document);
  return document.textStyles.map((style) => styleSummary(style, usage.get(style.id) ?? 0));
}
