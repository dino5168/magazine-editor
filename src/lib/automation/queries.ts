/**
 * 唯讀查詢：把編輯器狀態整理成給 AI 看的精簡 JSON。
 *
 * 只讀 `history.present` 與目前頁，不改任何東西。數字四捨五入到 0.01 pt（清單）或原樣（單一物件）。
 */
import { selectActivePage, selectIsDirty, type EditorState } from "@/lib/editor/editor-reducer";
import { FONT_OPTIONS, findFontOption, projectFontOption } from "@/lib/editor/fonts";
import { mapFontFamilies } from "@/lib/editor/project-fonts";
import { findSheet, pagesUsingMaster } from "@/lib/editor/master-pages";
import { SHAPE_KIND_LABELS, describeLine, shapeDefaultSize, type ShapeKind } from "@/lib/editor/element-factory";
import { linePagePoints } from "@/lib/editor/line-geometry";
import { lineLocalBounds } from "@/lib/editor/line-path";
import { SHAPE_CATEGORIES, SHAPE_LIBRARY } from "@/lib/editor/shape-presets";
import { styledTextOf, textStyleUsage } from "@/lib/editor/style-sheet";
import { swatchUsage } from "@/lib/editor/swatches";
import type { CanvasElement, PageId, ProjectFont, Sheet, Size, Swatch, TextAlign, TextShadow, TextStyleDef } from "@/lib/editor/types";
import type { Result } from "@/lib/editor/validation";
import { visibleItems } from "@/lib/library/library-selectors";
import { folderPath } from "@/lib/library/library-tree";
import type { Library, LibraryItem } from "@/lib/library/types";
import type { ToolArgs } from "./tool-definitions";

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
  readonly swatches: number;
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
  /** Name of the swatch the background follows. */
  readonly backgroundSwatch?: string;
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
  readonly backgroundSwatch?: string;
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
  readonly align: TextAlign;
  readonly textColor: string;
  /** Name of the swatch the text color follows. */
  readonly textColorSwatch?: string;
  readonly shadow: TextShadow | null;
  /** × font size. */
  readonly lineHeight: number;
  /** 1/1000 of the font size. */
  readonly letterSpacing: number;
  /** Paragraph indents, in multiples of the font size (negative first line = hanging). */
  readonly indentLeft: number;
  readonly indentRight: number;
  readonly indentFirstLine: number;
  /** Texts linked to it (text elements and shape labels, pages and master pages). */
  readonly usedBy: number;
}

export interface LibraryFolderSummary {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  /** Names from the top level down, e.g. `封面 / 人物`. */
  readonly path: string;
}

export interface LibraryItemSummary {
  readonly id: string;
  readonly name: string;
  readonly kind: LibraryItem["kind"];
  /** Folder path; null = 未分類 (and always null in the trash). */
  readonly folder: string | null;
  readonly bytes: number;
  readonly trashed: boolean;
  /** Images: intrinsic size in pixels. */
  readonly width?: number;
  readonly height?: number;
  /** Text files: the start of the text on one line. */
  readonly excerpt?: string;
}

export interface ElementDetail {
  readonly sheet: SheetRef;
  readonly layer: number;
  readonly element: CanvasElement;
  /** Lines: the points on the page (the same coordinates as `add_line` / `update_element`). */
  readonly pagePoints?: readonly { readonly x: number; readonly y: number }[];
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

// 線條回報點的外接框大小
function elementSize(element: CanvasElement): { width: number; height?: number } {
  if (element.type === "line") {
    const bounds = lineLocalBounds(element);
    return { width: round(bounds.maxX - bounds.minX), height: round(bounds.maxY - bounds.minY) };
  }
  return element.type === "text" ? { width: round(element.width) } : { width: round(element.width), height: round(element.height) };
}

function elementSummary(element: CanvasElement): string {
  switch (element.type) {
    case "text":
      return `文字「${excerpt(element.text)}」`;
    case "shape": {
      const label = element.label ? `，內文「${excerpt(element.label.text)}」` : "";
      const kind = element.geometry.kind === "preset" ? element.geometry.preset : element.geometry.kind;
      return `圖形 ${kind}，填色 ${element.fill}${label}`;
    }
    case "image":
      return `圖片 ${element.src}`;
    case "line":
      return `${describeLine(element)}，${element.points.length} 個點，線條 ${element.stroke.color}`;
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
    swatches: document.swatches.length,
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
  const swatch = swatchNameOf(document.swatches);
  return {
    pages: document.pages.map((page, index) => ({
      index: index + 1,
      id: page.id,
      name: page.name,
      width: round(page.width),
      height: round(page.height),
      background: page.background,
      ...swatch("backgroundSwatch", page.backgroundSwatchId),
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
      ...swatch("backgroundSwatch", master.backgroundSwatchId),
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
    ...elementSize(element),
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
      const element = sheet.elements[layer];
      const pagePoints = element.type === "line" ? linePagePoints(element).map((p) => ({ x: round(p.x), y: round(p.y) })) : undefined;
      return { data: { sheet: sheetRef(state, sheet), layer, element, ...(pagePoints && { pagePoints }) }, error: null };
    }
  }
  return { data: null, error: new Error(`找不到物件「${id}」，請先用 list_elements 取得 id`) };
}

function linkedStyle(element: CanvasElement, names: ReadonlyMap<string, string>): { textStyle?: string } {
  const styleId = styledTextOf(element)?.styleId;
  const name = styleId ? names.get(styleId) : undefined;
  return name === undefined ? {} : { textStyle: name };
}

/** `{ [key]: swatch name }` for a linked color, nothing for an unlinked one. */
function swatchNameOf(swatches: readonly Swatch[]) {
  const names = new Map(swatches.map((swatch) => [swatch.id, swatch.name]));
  return <K extends string>(key: K, id: string | null): Partial<Record<K, string>> => {
    const name = id === null ? undefined : names.get(id);
    return name === undefined ? {} : ({ [key]: name } as Record<K, string>);
  };
}

function styleSummary(
  style: TextStyleDef,
  usedBy: number,
  swatch: ReturnType<typeof swatchNameOf>,
  fonts: readonly ProjectFont[],
): TextStyleSummary {
  return {
    id: style.id,
    name: style.name,
    font: findFontOption(style.fontFamily, fonts)?.label ?? style.fontFamily,
    fontSize: style.fontSize,
    bold: style.fontStyle === "bold",
    italic: style.italic,
    underline: style.underline,
    strikethrough: style.strikethrough,
    align: style.align,
    textColor: style.fill,
    ...swatch("textColorSwatch", style.fillSwatchId),
    shadow: style.shadow,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    indentLeft: style.indentLeft,
    indentRight: style.indentRight,
    indentFirstLine: style.indentFirstLine,
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
  const swatch = swatchNameOf(document.swatches);
  return document.textStyles.map((style) => styleSummary(style, usage.get(style.id) ?? 0, swatch, document.fonts));
}

export interface SwatchSummary {
  readonly id: string;
  readonly name: string;
  /** `#rrggbb`. */
  readonly color: string;
  /** Color fields linked to it (elements, backgrounds, text styles, page numbers). */
  readonly usedBy: number;
}

/**
 * The document's swatches (tool `list_swatches`).
 *
 * Args:
 *   state: Editor state.
 *
 * Returns:
 *   Every swatch in display order with how many colors link to it.
 */
export function listSwatches(state: EditorState): SwatchSummary[] {
  const document = state.history.present;
  const usage = swatchUsage(document);
  return document.swatches.map(({ id, name, color }) => ({ id, name, color, usedBy: usage.get(id) ?? 0 }));
}

/** A shape `add_shape` can make (tool `list_shapes`). */
export interface ShapeSummary {
  /** `add_shape`'s `shape`. */
  readonly id: string;
  readonly name: string;
  readonly category: string;
  /** Size (pt) of a shape created by a click in the app. */
  readonly defaultSize: Size;
  readonly params: readonly {
    readonly name: string;
    readonly label: string;
    /** `ratio`: a fraction 0–1 of a side; `pt`: a fixed length. */
    readonly kind: "ratio" | "pt";
    readonly min: number;
    readonly max: number;
    readonly default: number;
  }[];
}

/**
 * Every shape the user can pick, in panel order (tool `list_shapes`).
 *
 * Returns:
 *   The basic shapes and the shape library, with each library shape's parameters.
 */
export function listShapes(): ShapeSummary[] {
  const [basic] = SHAPE_CATEGORIES;
  const basics = (Object.keys(SHAPE_KIND_LABELS) as ShapeKind[]).map(
    (kind): ShapeSummary => ({ id: kind, name: SHAPE_KIND_LABELS[kind], category: basic.label, defaultSize: shapeDefaultSize(kind), params: [] }),
  );
  // 和元素面板同樣的順序：基本圖形在「基本」最前面，接著每個分類的圖形庫圖形
  const library = SHAPE_CATEGORIES.flatMap((category) =>
    SHAPE_LIBRARY.filter((preset) => preset.category === category.id).map(
      (preset): ShapeSummary => ({
        id: preset.id,
        name: preset.label,
        category: category.label,
        defaultSize: preset.size,
        params: preset.params.map(({ name, label, kind, min, max, default: value }) => ({ name, label, kind, min, max, default: value })),
      }),
    ),
  );
  return [...basics, ...library];
}

/** A font the AI can pass as `font` (tool `list_fonts`). */
export interface FontSummary {
  /** Project fonts only; built-in fonts are named. */
  readonly id?: string;
  readonly name: string;
  readonly kind: "builtIn" | "project";
  /** Project fonts: the built-in font kind drawn for characters the font lacks. */
  readonly fallback?: "黑體" | "明體";
  /** Project fonts: false = bold looks the same as regular. */
  readonly hasBold?: boolean;
  /** Project fonts: embedding permission of the files (`installable` / `editable` / `previewAndPrint`). */
  readonly embedding?: string;
  readonly usedBy: number;
}

/**
 * Built-in and project fonts (tool `list_fonts`).
 *
 * Args:
 *   state: Editor state.
 *
 * Returns:
 *   The built-in fonts, then the project fonts in menu order, each with how many places use it.
 */
export function listFonts(state: EditorState): FontSummary[] {
  const document = state.history.present;
  const families = new Map<string, number>();
  mapFontFamilies(document, (family) => {
    const option = findFontOption(family, document.fonts);
    if (option) families.set(option.id, (families.get(option.id) ?? 0) + 1);
    return family;
  });
  const builtIn = FONT_OPTIONS.map((option): FontSummary => ({ name: option.label, kind: "builtIn", usedBy: families.get(option.id) ?? 0 }));
  const project = document.fonts.map((font): FontSummary => {
    const files = [font.regular, ...(font.bold ? [font.bold] : [])];
    // 授權取最嚴格的那個檔案
    const embedding = files.find((f) => f.embedding === "previewAndPrint") ?? files.find((f) => f.embedding === "editable") ?? font.regular;
    return {
      id: font.id,
      name: font.name,
      kind: "project",
      fallback: font.generic === "serif" ? "明體" : "黑體",
      hasBold: font.bold !== null,
      embedding: embedding.embedding,
      usedBy: families.get(projectFontOption(font).id) ?? 0,
    };
  });
  return [...builtIn, ...project];
}

/** Folder path joined the way the trash shows it (`封面 / 人物`). */
function folderPathText(library: Library, id: string): string {
  return folderPath(library.folders, id).join(" / ");
}

function itemSummary(library: Library, item: LibraryItem): LibraryItemSummary {
  const base = {
    id: item.id,
    name: item.name,
    kind: item.kind,
    folder: item.folderId === null ? null : folderPathText(library, item.folderId),
    bytes: item.bytes,
    trashed: item.trashed !== null,
  };
  switch (item.kind) {
    case "image":
      return { ...base, width: item.width, height: item.height };
    case "text":
      return { ...base, excerpt: excerpt(item.excerpt) };
    case "audio":
      return base;
  }
}

/**
 * Folders and items of the project's asset library (tool `list_library_items`).
 *
 * Args:
 *   library: The asset library.
 *   args: Filters: kind, name, folder (with subfolders), whether to add the trash.
 *
 * Returns:
 *   Every folder, and the matching items newest first (trashed ones last), or an error when the
 *   folder id is unknown.
 */
export function listLibraryItems(
  library: Library,
  args: ToolArgs<"list_library_items">,
): Result<{ folders: LibraryFolderSummary[]; items: LibraryItemSummary[] }> {
  const { kind, query = "", folderId, includeTrashed = false } = args;
  if (folderId !== undefined && !library.folders.some((folder) => folder.id === folderId)) {
    return { data: null, error: new Error(`找不到資料夾「${folderId}」，請用 list_library_items 回傳的 folders 取得 id`) };
  }
  // 垃圾桶裡的素材沒有資料夾，所以指定資料夾時不會有垃圾桶的素材
  const items = [
    ...visibleItems(library, folderId === undefined ? { type: "all" } : { type: "folder", id: folderId }, query),
    ...(includeTrashed && folderId === undefined ? visibleItems(library, { type: "trash" }, query) : []),
  ].filter((item) => kind === undefined || item.kind === kind);
  return {
    data: {
      folders: library.folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        path: folderPathText(library, folder.id),
      })),
      items: items.map((item) => itemSummary(library, item)),
    },
    error: null,
  };
}
