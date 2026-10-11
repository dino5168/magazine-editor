/**
 * MCP 的編輯工具：把工具參數換成 reducer action，交給 `ToolContext.apply` 執行。
 *
 * 參數的型別與範圍已由 zod 檢查（`tool-definitions.ts`）；這裡檢查「這個物件能不能這樣改」，
 * 建立物件沿用 `element-factory`，名稱沿用 `validateName`。每個工具只送一個 action = 一筆復原。
 */
import {
  addMasterError,
  addPagesDefaults,
  addPagesError,
  addPagesIndex,
  buildAddedPages,
} from "@/lib/editor/add-pages";
import type { EditorAction, EditorState } from "@/lib/editor/editor-reducer";
import {
  builtInTextStyle,
  createId,
  createMasterPage,
  createImageElement,
  createShapeInBox,
  createTextElement,
} from "@/lib/editor/element-factory";
import { FONT_OPTIONS } from "@/lib/editor/fonts";
import { pageCenter } from "@/lib/editor/geometry";
import { findSheet, nextMasterName } from "@/lib/editor/master-pages";
import { clampCornerRadius } from "@/lib/editor/properties";
import { createLabel } from "@/lib/editor/shape-label";
import { pickTextStyle, styledTextOf, textStyleNameError, textStyleUsage } from "@/lib/editor/style-sheet";
import type {
  CanvasElement,
  ElementPatch,
  PageId,
  ShapeElement,
  StyledText,
  TextElement,
  TextStyle,
  TextStyleDef,
} from "@/lib/editor/types";
import { DOCUMENT_NAME_MAX_LENGTH, PAGE_NAME_MAX_LENGTH, validateName, type Result } from "@/lib/editor/validation";
import type { Library, LibraryItem } from "@/lib/library/types";
import { getElement } from "./queries";
import type { ToolArgs, TextStyleInput } from "./tool-definitions";

/** Width of text added without one (pt); the body text preset. */
export const DEFAULT_TEXT_WIDTH = 280;

/**
 * Runs an action on the latest state. Returns the next state, or null when the reducer made no
 * change (invalid, or the same values).
 */
export type ApplyAction = (action: EditorAction) => EditorState | null;

function fail(message: string): Result<never> {
  return { data: null, error: new Error(message) };
}

function ok<T>(data: T): Result<T> {
  return { data, error: null };
}

const STYLE_KEYS = [
  "fontSize",
  "font",
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "align",
  "textColor",
  "shadow",
  "lineHeight",
  "letterSpacing",
] as const satisfies readonly (keyof TextStyleInput)[];

function pickStyle(args: TextStyleInput): TextStyleInput {
  return Object.fromEntries(STYLE_KEYS.filter((key) => args[key] !== undefined).map((key) => [key, args[key]]));
}

/**
 * Turns tool style arguments into text style fields.
 *
 * Args:
 *   style: Validated style arguments.
 *
 * Returns:
 *   Only the fields that were given.
 */
export function textStyleFields(style: TextStyleInput): Partial<TextStyle> {
  const fields: { -readonly [K in keyof TextStyle]?: TextStyle[K] } = {};
  if (style.fontSize !== undefined) fields.fontSize = style.fontSize;
  if (style.font !== undefined) {
    // zod 已限定為 FONT_OPTIONS 的名稱
    fields.fontFamily = FONT_OPTIONS.find((option) => option.label === style.font)!.family;
  }
  if (style.bold !== undefined) fields.fontStyle = style.bold ? "bold" : "normal";
  if (style.italic !== undefined) fields.italic = style.italic;
  if (style.underline !== undefined) fields.underline = style.underline;
  if (style.strikethrough !== undefined) fields.strikethrough = style.strikethrough;
  if (style.align !== undefined) fields.align = style.align;
  if (style.textColor !== undefined) fields.fill = style.textColor;
  if (style.shadow !== undefined) fields.shadow = style.shadow;
  if (style.lineHeight !== undefined) fields.lineHeight = style.lineHeight;
  if (style.letterSpacing !== undefined) fields.letterSpacing = style.letterSpacing;
  return fields;
}

function hasKeys(value: object): boolean {
  return Object.keys(value).length > 0;
}

/** The page or master page a new element goes to: `pageId`, or the sheet the user is looking at. */
function targetSheet(state: EditorState, pageId: PageId | undefined): Result<PageId> {
  const document = state.history.present;
  if (pageId === undefined) return ok(state.activePageId);
  const exists = document.pages.some((page) => page.id === pageId) || document.masters.some((m) => m.id === pageId);
  return exists ? ok(pageId) : fail(`找不到頁面「${pageId}」，請先用 list_pages 取得 id`);
}

function addElement(apply: ApplyAction, element: CanvasElement, pageId: PageId) {
  if (!apply({ type: "element/add", element, pageId })) return fail("App 沒有接受這個物件（參數不合法）");
  return ok({ id: element.id, pageId });
}

/**
 * A text style by id, or by name (trimmed, exact).
 *
 * Args:
 *   state: Editor state.
 *   ref: Id or name from the AI.
 *
 * Returns:
 *   The style, or an error pointing to `list_text_styles`.
 */
export function findTextStyle(state: EditorState, ref: string): Result<TextStyleDef> {
  const { textStyles } = state.history.present;
  const style = textStyles.find((s) => s.id === ref) ?? textStyles.find((s) => s.name === ref.trim());
  return style ? ok(style) : fail(`找不到文字樣式「${ref}」，請先用 list_text_styles 取得名稱或 id`);
}

/** The style's values and link when `ref` is given; nothing when it is undefined. */
function styleLink(state: EditorState, ref: string | undefined): Result<Partial<StyledText>> {
  if (ref === undefined) return ok({});
  const style = findTextStyle(state, ref);
  return style.error ? style : ok({ ...pickTextStyle(style.data), styleId: style.data.id });
}

/** Tool `add_text`. */
export function addText(state: EditorState, apply: ApplyAction, args: ToolArgs<"add_text">) {
  const sheet = targetSheet(state, args.pageId);
  if (sheet.error) return sheet;
  const link = styleLink(state, args.style);
  if (link.error) return link;
  // 先取樣式的值，再套這次給的欄位（和樣式不同 = 覆寫）
  const element: TextElement = {
    ...createTextElement("body", { x: 0, y: 0 }),
    x: args.x,
    y: args.y,
    rotation: args.rotation ?? 0,
    text: args.text,
    width: args.width ?? DEFAULT_TEXT_WIDTH,
    align: "left",
    ...link.data,
    ...textStyleFields(pickStyle(args)),
  };
  return addElement(apply, element, sheet.data);
}

/**
 * A library item by id, or by name (trimmed, exact). Items in the trash are only found to say so.
 *
 * Args:
 *   library: The asset library.
 *   ref: Id or name from the AI.
 *
 * Returns:
 *   The item, or an error pointing to `list_library_items` (unknown, or several with that name).
 */
export function findLibraryItem(library: Library, ref: string): Result<LibraryItem> {
  const byId = library.items.find((item) => item.id === ref);
  if (byId) return ok(byId);
  const named = library.items.filter((item) => item.name === ref.trim());
  // 同名時以不在垃圾桶的為準；只有垃圾桶裡有，才回報「在垃圾桶」
  const candidates = named.some((item) => !item.trashed) ? named.filter((item) => !item.trashed) : named;
  if (candidates.length === 1) return ok(candidates[0]);
  if (candidates.length > 1) {
    return fail(`有 ${candidates.length} 個素材叫「${ref.trim()}」（${candidates.map((item) => item.id).join("、")}），請改用 id`);
  }
  return fail(`找不到素材「${ref}」，請先用 list_library_items 取得名稱或 id`);
}

/** Tool `place_library_item` (images only). */
export function placeLibraryItem(
  state: EditorState,
  library: Library,
  apply: ApplyAction,
  args: ToolArgs<"place_library_item">,
) {
  const sheetId = targetSheet(state, args.pageId);
  if (sheetId.error) return sheetId;
  const found = findLibraryItem(library, args.item);
  if (found.error) return found;
  const item = found.data;
  if (item.trashed) return fail(`素材「${item.name}」在垃圾桶裡，請使用者先在素材管理還原`);
  if (item.kind === "audio") return fail("音訊不能放到頁面");
  if (item.kind === "text") {
    return fail(`目前只能放圖片；文字檔「${item.name}」請用 list_library_items 的摘錄（或使用者提供的內容）以 add_text 加入`);
  }
  const sheet = findSheet(state.history.present, sheetId.data)!;
  // 和素材面板放到頁面相同（太大時縮小）；給寬度時依原圖比例算高度
  const placed = createImageElement(item.src, item, sheet, pageCenter(sheet));
  const width = args.width ?? placed.width;
  // 比例用原圖像素（同 createImageElement 的下限 1），不用縮小後的尺寸，免得多出浮點誤差
  const height = args.width === undefined ? placed.height : (width * Math.max(item.height, 1)) / Math.max(item.width, 1);
  const element = {
    ...placed,
    width,
    height,
    x: args.x ?? (sheet.width - width) / 2,
    y: args.y ?? (sheet.height - height) / 2,
  };
  const added = addElement(apply, element, sheetId.data);
  return added.error ? added : ok({ ...added.data, width, height });
}

/** Tool `add_shape`. */
export function addShape(state: EditorState, apply: ApplyAction, args: ToolArgs<"add_shape">) {
  const sheet = targetSheet(state, args.pageId);
  if (sheet.error) return sheet;
  const style = pickStyle(args);
  if (args.text === undefined && (hasKeys(style) || args.verticalAlign !== undefined || args.style !== undefined)) {
    return fail("style、文字樣式欄位與 verticalAlign 用在圖形內的文字：請同時給 text");
  }
  const link = styleLink(state, args.style);
  if (link.error) return link;
  const shape = createShapeInBox(args.shape, {
    minX: args.x,
    minY: args.y,
    maxX: args.x + args.width,
    maxY: args.y + args.height,
  });
  const element: ShapeElement = {
    ...shape,
    rotation: args.rotation ?? 0,
    ...(args.fill !== undefined && { fill: args.fill }),
    ...(args.stroke !== undefined && { stroke: args.stroke }),
    label:
      args.text === undefined
        ? null
        : {
            ...createLabel(args.text),
            ...link.data,
            ...textStyleFields(style),
            ...(args.verticalAlign !== undefined && { verticalAlign: args.verticalAlign }),
          },
  };
  return addElement(apply, element, sheet.data);
}

/** Fields of `update_element` each element type accepts (besides position and rotation). */
const UPDATABLE: Record<CanvasElement["type"], readonly string[]> = {
  text: ["width", "text", ...STYLE_KEYS],
  shape: ["width", "height", "fill", "stroke", "cornerRadius", "text", "verticalAlign", ...STYLE_KEYS],
  image: ["width", "height"],
};

const TYPE_NAMES: Record<CanvasElement["type"], string> = { text: "文字物件", shape: "圖形", image: "圖片" };

/** Builds the patch of `update_element`, or explains which argument does not fit the element. */
function elementPatch(element: CanvasElement, args: ToolArgs<"update_element">): Result<ElementPatch> {
  const { id: _id, x, y, rotation, ...rest } = args;
  const given = Object.keys(rest).filter((key) => rest[key as keyof typeof rest] !== undefined);
  const rejected = given.filter((key) => !UPDATABLE[element.type].includes(key));
  if (rejected.length > 0) {
    const hint = element.type === "text" && rejected.includes("fill") ? "（文字顏色用 textColor）" : "";
    return fail(`${TYPE_NAMES[element.type]}不能修改：${rejected.join("、")}${hint}`);
  }
  const position = {
    ...(x !== undefined && { x }),
    ...(y !== undefined && { y }),
    ...(rotation !== undefined && { rotation }),
    ...(args.width !== undefined && { width: args.width }),
  };
  const style = textStyleFields(pickStyle(args));
  switch (element.type) {
    case "text":
      return ok({ ...position, ...(args.text !== undefined && { text: args.text }), ...style });
    case "image":
      return ok({ ...position, ...(args.height !== undefined && { height: args.height }) });
    case "shape": {
      const width = args.width ?? element.width;
      const height = args.height ?? element.height;
      const patch: { -readonly [K in keyof ShapeElement]?: ShapeElement[K] } = {
        ...position,
        ...(args.height !== undefined && { height: args.height }),
        ...(args.fill !== undefined && { fill: args.fill }),
        ...(args.stroke !== undefined && { stroke: args.stroke }),
      };
      if (args.cornerRadius !== undefined) {
        if (element.geometry.kind !== "rect") return fail("只有矩形可以設定 cornerRadius");
        patch.geometry = { kind: "rect", cornerRadius: clampCornerRadius({ width, height }, args.cornerRadius) };
      }
      const labelChanges = hasKeys(style) || args.verticalAlign !== undefined;
      if (args.text === "") {
        if (labelChanges) return fail("text 是空字串會移除圖形內的文字，不能同時給文字樣式");
        patch.label = null;
      } else if (args.text !== undefined || labelChanges) {
        const base = element.label ?? (args.text !== undefined ? createLabel(args.text) : null);
        if (!base) return fail("這個圖形沒有文字：要設定文字樣式請同時給 text");
        patch.label = {
          ...base,
          ...(args.text !== undefined && { text: args.text }),
          ...style,
          ...(args.verticalAlign !== undefined && { verticalAlign: args.verticalAlign }),
        };
      }
      return ok(patch);
    }
  }
}

/** Tool `update_element`. */
export function updateElement(state: EditorState, apply: ApplyAction, args: ToolArgs<"update_element">) {
  const found = getElement(state, args.id);
  if (found.error) return found;
  const { element, sheet } = found.data;
  const patch = elementPatch(element, args);
  if (patch.error) return patch;
  if (!hasKeys(patch.data)) return fail("沒有要修改的欄位");
  const next = apply({ type: "element/update", id: element.id, patch: patch.data, pageId: sheet.id });
  return ok({ id: element.id, pageId: sheet.id, changed: next !== null });
}

/** Tool `delete_elements`. */
export function deleteElements(state: EditorState, apply: ApplyAction, args: ToolArgs<"delete_elements">) {
  const ids = [...new Set(args.ids)];
  const sheets = new Set<PageId>();
  for (const id of ids) {
    const found = getElement(state, id);
    if (found.error) return found;
    sheets.add(found.data.sheet.id);
  }
  if (sheets.size > 1) return fail("一次只能刪除同一頁（或同一主頁）的物件，請分頁呼叫");
  const [pageId] = sheets;
  if (!apply({ type: "element/delete", ids, pageId })) return fail("App 沒有刪除任何物件");
  return ok({ deleted: ids.length, pageId });
}

/** Tool `add_page`: the Add Pages dialog's defaults and rules (`add-pages.ts`). */
export function addPage(state: EditorState, apply: ApplyAction, args: ToolArgs<"add_page">) {
  const document = state.history.present;
  const defaults = addPagesDefaults(document, state.activePageId, "end");
  const form = {
    count: args.count ?? defaults.count,
    side: args.side ?? defaults.side,
    pageNumber: args.pageNumber ?? defaults.pageNumber,
    masterId: args.masterId === undefined ? defaults.masterId : args.masterId,
  };
  const error = addPagesError(form, document);
  if (error) return fail(error);
  const pages = buildAddedPages(document, form);
  if (!apply({ type: "page/addMany", pages, index: addPagesIndex(form) })) return fail("App 沒有新增頁面");
  return ok({ pages: pages.map((page) => ({ id: page.id, name: page.name })), activePageId: pages[0].id });
}

/** Tool `add_master`: the Add Master Page dialog's defaults and rules (`page-dialogs.tsx`, `add-pages.ts`). */
export function addMaster(state: EditorState, apply: ApplyAction, args: ToolArgs<"add_master">) {
  const { masters, pages } = state.history.present;
  const editing = masters.find((master) => master.id === state.activePageId);
  const parentId = args.parentId === undefined ? (editing?.id ?? null) : args.parentId;
  if (parentId !== null && !masters.some((master) => master.id === parentId)) {
    return fail(`找不到主頁「${parentId}」，請先用 list_pages 取得主頁 id`);
  }
  const name = args.name ?? nextMasterName(masters);
  const error = addMasterError(name, parentId, masters);
  if (error) return fail(error);
  // 尺寸和目前的頁面一樣（頁面設定一次改所有頁面與主頁）
  const size = pages.find((page) => page.id === state.activePageId) ?? editing ?? pages[0];
  const master = createMasterPage(name.trim(), size, args.background ?? "#ffffff", parentId);
  if (!apply({ type: "master/add", master })) return fail("App 沒有新增主頁");
  return ok({ id: master.id, name: master.name, parentId, activePageId: master.id });
}

/** Tool `set_page_master`. */
export function setPageMaster(state: EditorState, apply: ApplyAction, args: ToolArgs<"set_page_master">) {
  const { masters, pages } = state.history.present;
  const pageIds = [...new Set(args.pageIds)];
  const unknown = pageIds.filter((id) => !pages.some((page) => page.id === id));
  if (unknown.length > 0) {
    const isMaster = unknown.some((id) => masters.some((master) => master.id === id));
    const hint = isMaster ? "主頁不能套用主頁（要讓主頁以另一個主頁為基礎，請在 App 的「頁面」面板設定）" : "請先用 list_pages 取得頁面 id";
    return fail(`找不到頁面「${unknown.join("、")}」：${hint}`);
  }
  if (args.masterId !== null && !masters.some((master) => master.id === args.masterId)) {
    return fail(`找不到主頁「${args.masterId}」，請先用 list_pages 取得主頁 id`);
  }
  const next = apply({ type: "page/setMaster", ids: pageIds, masterId: args.masterId });
  return ok({ pageIds, masterId: args.masterId, changed: next !== null });
}

/** Tool `rename_page`. */
export function renamePage(state: EditorState, apply: ApplyAction, args: ToolArgs<"rename_page">) {
  const target = targetSheet(state, args.pageId);
  if (target.error) return target;
  const name = validateName(args.name, PAGE_NAME_MAX_LENGTH);
  if (name.error) return name;
  const next = apply({ type: "page/rename", id: args.pageId, name: name.data });
  return ok({ pageId: args.pageId, name: name.data, changed: next !== null });
}

/** Tool `set_page_background`. */
export function setPageBackground(state: EditorState, apply: ApplyAction, args: ToolArgs<"set_page_background">) {
  const target = targetSheet(state, args.pageId);
  if (target.error) return target;
  const next = apply({ type: "page/setBackground", id: args.pageId, color: args.color });
  return ok({ pageId: args.pageId, changed: next !== null });
}

/** Tool `rename_document`. */
export function renameDocument(apply: ApplyAction, args: ToolArgs<"rename_document">) {
  const name = validateName(args.name, DOCUMENT_NAME_MAX_LENGTH);
  if (name.error) return name;
  const next = apply({ type: "document/rename", name: name.data });
  return ok({ name: name.data, changed: next !== null });
}

/** Tools `undo` / `redo`. */
export function stepHistory(apply: ApplyAction, direction: "undo" | "redo") {
  const next = apply({ type: direction === "undo" ? "history/undo" : "history/redo" });
  if (!next) return fail(direction === "undo" ? "沒有可以復原的步驟" : "沒有可以重做的步驟");
  return ok({ canUndo: next.history.past.length > 0, canRedo: next.history.future.length > 0 });
}

/** Tool `add_text_style`: starts from the built-in 內文 values. */
export function addTextStyle(state: EditorState, apply: ApplyAction, args: ToolArgs<"add_text_style">) {
  const error = textStyleNameError(args.name, state.history.present.textStyles, null);
  if (error) return fail(error);
  const style: TextStyleDef = {
    ...pickTextStyle(builtInTextStyle("body")),
    ...textStyleFields(pickStyle(args)),
    id: createId(),
    name: args.name.trim(),
  };
  if (!apply({ type: "textStyle/add", style })) return fail("App 沒有接受這個樣式（參數不合法）");
  return ok({ id: style.id, name: style.name });
}

/** Tool `update_text_style`. */
export function updateTextStyle(state: EditorState, apply: ApplyAction, args: ToolArgs<"update_text_style">) {
  const found = findTextStyle(state, args.style);
  if (found.error) return found;
  const style = found.data;
  const fields = textStyleFields(pickStyle(args));
  if (!hasKeys(fields) && args.name === undefined) return fail("沒有要修改的欄位");
  if (args.name !== undefined) {
    const error = textStyleNameError(args.name, state.history.present.textStyles, style.id);
    if (error) return fail(error);
  }
  const next = apply({ type: "textStyle/update", id: style.id, style: { ...pickTextStyle(style), ...fields }, name: args.name });
  const linkedTexts = textStyleUsage(state.history.present).get(style.id) ?? 0;
  return ok({ id: style.id, name: args.name?.trim() ?? style.name, changed: next !== null, linkedTexts });
}

/** Tool `delete_text_style`. */
export function deleteTextStyle(state: EditorState, apply: ApplyAction, args: ToolArgs<"delete_text_style">) {
  const found = findTextStyle(state, args.style);
  if (found.error) return found;
  const unlinkedTexts = textStyleUsage(state.history.present).get(found.data.id) ?? 0;
  if (!apply({ type: "textStyle/delete", id: found.data.id })) return fail("App 沒有刪除這個樣式");
  return ok({ deleted: found.data.id, name: found.data.name, unlinkedTexts });
}

/** Tool `apply_text_style`: elements without text are skipped and reported. */
export function applyTextStyle(state: EditorState, apply: ApplyAction, args: ToolArgs<"apply_text_style">) {
  const style = args.style === null ? null : findTextStyle(state, args.style);
  if (style?.error) return style;
  const ids = [...new Set(args.ids)];
  const sheets = new Set<PageId>();
  const applicable: string[] = [];
  const skipped: string[] = [];
  for (const id of ids) {
    const found = getElement(state, id);
    if (found.error) return found;
    sheets.add(found.data.sheet.id);
    (styledTextOf(found.data.element) ? applicable : skipped).push(id);
  }
  if (sheets.size > 1) return fail("一次只能套用同一頁（或同一主頁）的物件，請分頁呼叫");
  if (applicable.length === 0) return fail("這些物件都沒有文字（圖片、沒有文字的圖形不能套用文字樣式）");
  const [pageId] = sheets;
  const styleId = style?.data.id ?? null;
  const next = apply({ type: "element/applyTextStyle", ids: applicable, styleId, pageId });
  return ok({ style: styleId, applied: applicable.length, skipped, changed: next !== null });
}
