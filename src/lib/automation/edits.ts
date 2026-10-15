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
  choiceGeometry,
  createId,
  createMasterPage,
  createImageElement,
  createLineElement,
  createShapeInBox,
  createTextElement,
  presetChoice,
  PLAIN_LINE_END,
  type ShapeChoice,
  type ShapeKind,
} from "@/lib/editor/element-factory";
import { FONT_OPTIONS, projectFontOption } from "@/lib/editor/fonts";
import { pageCenter } from "@/lib/editor/geometry";
import { withLinePoints } from "@/lib/editor/line-geometry";
import { toolLineStroke } from "@/lib/editor/line-kinds";
import { findSheet, nextMasterName } from "@/lib/editor/master-pages";
import { clampCornerRadii } from "@/lib/editor/corner-radius";
import { withAlpha } from "@/lib/editor/palette";
import { createLabel } from "@/lib/editor/shape-label";
import { findShapePreset, resolvePresetParams } from "@/lib/editor/shape-presets";
import { pickTextStyle, styledTextOf, textStyleNameError, textStyleUsage } from "@/lib/editor/style-sheet";
import { swatchNameError, swatchUsage, type ColorSlot } from "@/lib/editor/swatches";
import type {
  CanvasElement,
  ElementPatch,
  LineElement,
  LineEnd,
  PageId,
  ShapeElement,
  ShapeGeometry,
  Stroke,
  StyledText,
  Swatch,
  TextElement,
  TextStyle,
  TextStyleDef,
} from "@/lib/editor/types";
import { DOCUMENT_NAME_MAX_LENGTH, PAGE_NAME_MAX_LENGTH, validateName, type Result } from "@/lib/editor/validation";
import type { Library, LibraryItem } from "@/lib/library/types";
import { getElement } from "./queries";
import { SHAPE_KINDS, type ColorInput, type PageColorInput, type ToolArgs, type TextStyleInput } from "./tool-definitions";

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
 * Turns tool style arguments into text style fields; colors given as `{ swatch }` link to it.
 *
 * Args:
 *   state: Editor state (for the swatches).
 *   style: Validated style arguments.
 *
 * Returns:
 *   Only the fields that were given, or an error when a swatch is unknown.
 */
export function textStyleFields(state: EditorState, style: TextStyleInput): Result<Partial<TextStyle>> {
  const fields: { -readonly [K in keyof TextStyle]?: TextStyle[K] } = {};
  if (style.fontSize !== undefined) fields.fontSize = style.fontSize;
  if (style.font !== undefined) {
    const font = findFont(state, style.font);
    if (font.error) return font;
    fields.fontFamily = font.data;
  }
  if (style.bold !== undefined) fields.fontStyle = style.bold ? "bold" : "normal";
  if (style.italic !== undefined) fields.italic = style.italic;
  if (style.underline !== undefined) fields.underline = style.underline;
  if (style.strikethrough !== undefined) fields.strikethrough = style.strikethrough;
  if (style.align !== undefined) fields.align = style.align;
  if (style.textColor !== undefined) {
    const color = resolveColor(state, style.textColor);
    if (color.error) return color;
    fields.fill = color.data.color;
    fields.fillSwatchId = color.data.swatchId;
  }
  if (style.shadow !== undefined) {
    const color = style.shadow && resolveColor(state, style.shadow.color);
    if (color?.error) return color;
    fields.shadow = style.shadow && { ...style.shadow, ...color!.data };
  }
  if (style.lineHeight !== undefined) fields.lineHeight = style.lineHeight;
  if (style.letterSpacing !== undefined) fields.letterSpacing = style.letterSpacing;
  return ok(fields);
}

/**
 * The CSS family of a font named by the AI: a built-in font by its menu name, or a project font by
 * id or name (trimmed, exact).
 *
 * Args:
 *   state: Editor state (for the project fonts).
 *   ref: Name or id.
 *
 * Returns:
 *   The family texts store, or an error pointing to `list_fonts`.
 */
export function findFont(state: EditorState, ref: string): Result<string> {
  const builtIn = FONT_OPTIONS.find((option) => option.label === ref.trim());
  if (builtIn) return ok(builtIn.family);
  const { fonts } = state.history.present;
  const font = fonts.find((f) => f.id === ref) ?? fonts.find((f) => f.name === ref.trim());
  return font ? ok(projectFontOption(font).family) : fail(`找不到字型「${ref}」，請先用 list_fonts 取得名稱或 id`);
}

/**
 * A swatch by id, or by name (trimmed, exact).
 *
 * Args:
 *   state: Editor state.
 *   ref: Id or name from the AI.
 *
 * Returns:
 *   The swatch, or an error pointing to `list_swatches`.
 */
export function findSwatch(state: EditorState, ref: string): Result<Swatch> {
  const { swatches } = state.history.present;
  const swatch = swatches.find((s) => s.id === ref) ?? swatches.find((s) => s.name === ref.trim());
  return swatch ? ok(swatch) : fail(`找不到色票「${ref}」，請先用 list_swatches 取得名稱或 id`);
}

/** A color argument as the color and swatch link to store: hex = not linked; `{ swatch, opacity }` = linked. */
function resolveColor(state: EditorState, input: ColorInput | PageColorInput): Result<ColorSlot> {
  if (typeof input === "string") return ok({ color: input, swatchId: null });
  const swatch = findSwatch(state, input.swatch);
  if (swatch.error) return swatch;
  const opacity = "opacity" in input ? (input.opacity ?? 1) : 1;
  return ok({ color: withAlpha(swatch.data.color, opacity), swatchId: swatch.data.id });
}

type StrokeInput = ToolArgs<"add_shape">["stroke"];

/** A stroke argument with its color resolved (undefined = not given, null = no stroke). */
function resolveStroke(state: EditorState, stroke: StrokeInput): Result<Stroke | null | undefined> {
  if (!stroke) return ok(stroke);
  const color = resolveColor(state, stroke.color);
  return color.error ? color : ok({ ...stroke, ...color.data });
}

/** A fill argument as `fill` / `fillSwatchId` fields (none when not given). */
function resolveFill(state: EditorState, fill: ColorInput | undefined): Result<Pick<ShapeElement, "fill" | "fillSwatchId"> | object> {
  if (fill === undefined) return ok({});
  const color = resolveColor(state, fill);
  return color.error ? color : ok({ fill: color.data.color, fillSwatchId: color.data.swatchId });
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
  const fields = textStyleFields(state, pickStyle(args));
  if (fields.error) return fields;
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
    ...fields.data,
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

// add_shape / update_element 的 shape：基本圖形照名稱，其他是圖形庫的 id（schema 已限制在 SHAPE_NAMES 裡）
function shapeChoiceOfName(name: string): ShapeChoice {
  return (SHAPE_KINDS as readonly string[]).includes(name) ? (name as ShapeKind) : presetChoice(name);
}

/**
 * Applies `params` to a shape-library shape: every name must be one of the shape's parameters;
 * values are clamped to their ranges, parameters not given keep their value.
 */
function withParams(geometry: ShapeGeometry, params: Readonly<Record<string, number>> | undefined): Result<ShapeGeometry> {
  if (params === undefined) return ok(geometry);
  if (geometry.kind !== "preset") return fail("只有圖形庫的圖形有 params（基本圖形沒有參數，矩形圓角用 cornerRadius）");
  const preset = findShapePreset(geometry.preset);
  if (!preset) return fail(`這個版本不認得圖形「${geometry.preset}」，不能設定參數`);
  const unknown = Object.keys(params).filter((name) => !preset.params.some((param) => param.name === name));
  if (unknown.length > 0) {
    const names = preset.params.map((param) => param.name).join("、") || "沒有參數";
    return fail(`圖形「${preset.label}」沒有參數 ${unknown.join("、")}（可用：${names}；見 list_shapes）`);
  }
  return ok({ ...geometry, params: resolvePresetParams(preset, { ...geometry.params, ...params }) });
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
  const fields = textStyleFields(state, style);
  if (fields.error) return fields;
  const fill = resolveFill(state, args.fill);
  if (fill.error) return fill;
  const stroke = resolveStroke(state, args.stroke);
  if (stroke.error) return stroke;
  const shape = createShapeInBox(shapeChoiceOfName(args.shape), {
    minX: args.x,
    minY: args.y,
    maxX: args.x + args.width,
    maxY: args.y + args.height,
  });
  const geometry = withParams(shape.geometry, args.params);
  if (geometry.error) return geometry;
  const element: ShapeElement = {
    ...shape,
    geometry: geometry.data,
    rotation: args.rotation ?? 0,
    ...fill.data,
    ...(stroke.data !== undefined && { stroke: stroke.data }),
    label:
      args.text === undefined
        ? null
        : {
            ...createLabel(args.text),
            ...link.data,
            ...fields.data,
            ...(args.verticalAlign !== undefined && { verticalAlign: args.verticalAlign }),
          },
  };
  return addElement(apply, element, sheet.data);
}

type LineEndInput = NonNullable<ToolArgs<"add_line">["start"]>;

// 箭頭參數 → LineEnd：scale 省略 = 原本的大小（新線條是 1）
function lineEnd(input: LineEndInput | undefined, current: LineEnd): LineEnd {
  return input ? { arrowhead: input.arrowhead, scale: input.scale ?? current.scale } : current;
}

/** Tool `add_line`: a line through page points, styled like the line tool's lines unless told otherwise. */
export function addLine(state: EditorState, apply: ApplyAction, args: ToolArgs<"add_line">) {
  const sheet = targetSheet(state, args.pageId);
  if (sheet.error) return sheet;
  const path = args.path ?? "straight";
  if (args.compound === "double" && path === "smooth") return fail("曲線（path: smooth）不能畫成雙線");
  const color = args.color === undefined ? null : resolveColor(state, args.color);
  if (color?.error) return color;
  const stroke: Stroke = {
    ...toolLineStroke(state.history.present.swatches),
    ...(color && color.data),
    ...(args.width !== undefined && { width: args.width }),
    ...(args.dash !== undefined && { dash: args.dash }),
  };
  const line = createLineElement(args.points, {
    path,
    compound: args.compound ?? "single",
    stroke,
    start: lineEnd(args.start, PLAIN_LINE_END),
    end: lineEnd(args.end, PLAIN_LINE_END),
  });
  return addElement(apply, line, sheet.data);
}

// update_element 對線條：points 換掉所有點（頁面座標，保留旋轉）；雙線只給 straight；線條一定有 stroke
function linePatch(state: EditorState, line: LineElement, args: ToolArgs<"update_element">, position: ElementPatch): Result<ElementPatch> {
  if (args.points !== undefined && (args.x !== undefined || args.y !== undefined)) {
    return fail("points 是頁面座標、已經決定了位置，不能同時給 x / y");
  }
  if (args.stroke === null) return fail("線條一定要有線條樣式（stroke 不能是 null）");
  const stroke = resolveStroke(state, args.stroke);
  if (stroke.error) return stroke;
  const path = args.path ?? line.path;
  const compound = args.compound ?? line.compound;
  if (compound === "double" && path === "smooth") return fail("曲線（path: smooth）不能畫成雙線");
  const placed = { ...line, ...position } as LineElement;
  return ok({
    ...position,
    ...(args.points !== undefined && withLinePoints(placed, args.points)),
    ...(args.path !== undefined && { path }),
    ...(args.compound !== undefined && { compound }),
    ...(stroke.data && { stroke: stroke.data }),
    ...(args.start !== undefined && { start: lineEnd(args.start, line.start) }),
    ...(args.end !== undefined && { end: lineEnd(args.end, line.end) }),
  });
}

/** Fields of `update_element` each element type accepts (besides position and rotation). */
const UPDATABLE: Record<CanvasElement["type"], readonly string[]> = {
  text: ["width", "text", ...STYLE_KEYS],
  shape: ["width", "height", "fill", "stroke", "cornerRadius", "shape", "params", "text", "verticalAlign", ...STYLE_KEYS],
  image: ["width", "height"],
  line: ["points", "path", "compound", "stroke", "start", "end"],
};

const TYPE_NAMES: Record<CanvasElement["type"], string> = { text: "文字物件", shape: "圖形", image: "圖片", line: "線條" };

/** Builds the patch of `update_element`, or explains which argument does not fit the element. */
function elementPatch(state: EditorState, element: CanvasElement, args: ToolArgs<"update_element">): Result<ElementPatch> {
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
  const fields = textStyleFields(state, pickStyle(args));
  if (fields.error) return fields;
  const style = fields.data;
  switch (element.type) {
    case "text":
      return ok({ ...position, ...(args.text !== undefined && { text: args.text }), ...style });
    case "image":
      return ok({ ...position, ...(args.height !== undefined && { height: args.height }) });
    case "line":
      return linePatch(state, element, args, position);
    case "shape": {
      const width = args.width ?? element.width;
      const height = args.height ?? element.height;
      const fill = resolveFill(state, args.fill);
      if (fill.error) return fill;
      const stroke = resolveStroke(state, args.stroke);
      if (stroke.error) return stroke;
      const patch: { -readonly [K in keyof ShapeElement]?: ShapeElement[K] } = {
        ...position,
        ...(args.height !== undefined && { height: args.height }),
        ...fill.data,
        ...(stroke.data !== undefined && { stroke: stroke.data }),
      };
      // 依序：換成另一個圖形 → 圓角 → 參數（所以可以一次換成圓角矩形並給圓角，或換成圖形庫圖形並給參數）
      let geometry = args.shape === undefined ? element.geometry : choiceGeometry(shapeChoiceOfName(args.shape), { width, height });
      if (args.cornerRadius !== undefined) {
        if (geometry.kind !== "rect") return fail("只有矩形可以設定 cornerRadius");
        geometry = { kind: "rect", cornerRadius: clampCornerRadii({ width, height }, args.cornerRadius) };
      }
      const withParamsGeometry = withParams(geometry, args.params);
      if (withParamsGeometry.error) return withParamsGeometry;
      geometry = withParamsGeometry.data;
      if (geometry !== element.geometry) patch.geometry = geometry;
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
  const patch = elementPatch(state, element, args);
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
  const background = resolveColor(state, args.background ?? "#ffffff");
  if (background.error) return background;
  const master = createMasterPage(name.trim(), size, background.data.color, parentId, background.data.swatchId);
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
  const color = resolveColor(state, args.color);
  if (color.error) return color;
  const next = apply({ type: "page/setBackground", id: args.pageId, ...color.data });
  return ok({ pageId: args.pageId, ...color.data, changed: next !== null });
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
  const fields = textStyleFields(state, pickStyle(args));
  if (fields.error) return fields;
  const style: TextStyleDef = {
    ...pickTextStyle(builtInTextStyle("body")),
    ...fields.data,
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
  const resolved = textStyleFields(state, pickStyle(args));
  if (resolved.error) return resolved;
  const fields = resolved.data;
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

/** Tool `add_swatch`. */
export function addSwatch(state: EditorState, apply: ApplyAction, args: ToolArgs<"add_swatch">) {
  const error = swatchNameError(args.name, state.history.present.swatches, null);
  if (error) return fail(error);
  const swatch: Swatch = { id: createId(), name: args.name.trim(), color: args.color.toLowerCase() };
  if (!apply({ type: "swatch/add", swatch })) return fail("App 沒有接受這個色票（參數不合法）");
  return ok(swatch);
}

/** Tool `update_swatch`: every color linked to it follows. */
export function updateSwatch(state: EditorState, apply: ApplyAction, args: ToolArgs<"update_swatch">) {
  const found = findSwatch(state, args.swatch);
  if (found.error) return found;
  const swatch = found.data;
  if (args.name === undefined && args.color === undefined) return fail("沒有要修改的欄位");
  if (args.name !== undefined) {
    const error = swatchNameError(args.name, state.history.present.swatches, swatch.id);
    if (error) return fail(error);
  }
  const color = args.color?.toLowerCase();
  const next = apply({ type: "swatch/update", id: swatch.id, name: args.name, color });
  const linkedColors = swatchUsage(state.history.present).get(swatch.id) ?? 0;
  return ok({ id: swatch.id, name: args.name?.trim() ?? swatch.name, color: color ?? swatch.color, changed: next !== null, linkedColors });
}

/** Tool `delete_swatch`: uses move to `replaceWith`, or keep their color unlinked. */
export function deleteSwatch(state: EditorState, apply: ApplyAction, args: ToolArgs<"delete_swatch">) {
  const found = findSwatch(state, args.swatch);
  if (found.error) return found;
  const replacement = args.replaceWith == null ? null : findSwatch(state, args.replaceWith);
  if (replacement?.error) return replacement;
  if (replacement?.data.id === found.data.id) return fail("replaceWith 不能是要刪除的同一個色票");
  const affectedColors = swatchUsage(state.history.present).get(found.data.id) ?? 0;
  const replaceWith = replacement?.data.id ?? null;
  if (!apply({ type: "swatch/delete", id: found.data.id, replaceWith })) return fail("App 沒有刪除這個色票");
  return ok({ deleted: found.data.id, name: found.data.name, replaceWith, affectedColors });
}
