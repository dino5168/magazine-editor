import { DEFAULT_FONT_OPTION } from "./fonts";
import { naturalAspect, unitVertices, vertexBounds } from "./shape-geometry";
import { PLAIN_TEXT_DECORATION } from "./text-style";
import { PAGE_SIZE_PRESETS, mmToPt, presetToPt } from "./units";
import type {
  Bounds,
  CanvasElement,
  EditorDocument,
  ImageElement,
  Margins,
  MasterPage,
  Page,
  PageId,
  Point,
  ShapeElement,
  ShapeGeometry,
  Size,
  TextElement,
} from "./types";

/** 新文字的字型：字型清單的第一個選項（黑體） */
export const DEFAULT_FONT_FAMILY = DEFAULT_FONT_OPTION.family;
export const DEFAULT_SHAPE_FILL = "#64748b";
export const DEFAULT_TEXT_FILL = "#171717";
export const DEFAULT_PAGE_BACKGROUND = "#ffffff";
/** Margins of a new document (15 mm on every side). Files without margins load as all 0 instead. */
export const DEFAULT_MARGINS: Margins = (() => {
  const side = mmToPt(15);
  return { top: side, right: side, bottom: side, left: side };
})();

/** Newly added images never exceed this fraction of the page size. */
const IMAGE_MAX_PAGE_RATIO = 0.5;

export type TextPreset = "heading" | "subheading" | "body";
export type ShapeKind = "rect" | "roundedRect" | "ellipse" | "triangle" | "star";

interface TextPresetConfig {
  readonly label: string;
  readonly text: string;
  readonly fontSize: number;
  readonly fontStyle: TextElement["fontStyle"];
  readonly width: number;
}

export const TEXT_PRESETS = {
  heading: { label: "新增標題", text: "標題", fontSize: 32, fontStyle: "bold", width: 360 },
  subheading: { label: "新增副標題", text: "副標題", fontSize: 20, fontStyle: "normal", width: 320 },
  body: { label: "新增內文", text: "雙擊這裡編輯內文", fontSize: 11, fontStyle: "normal", width: 280 },
} as const satisfies Record<TextPreset, TextPresetConfig>;

/**
 * Generates a unique element or page id.
 *
 * Returns:
 *   A random UUID.
 */
export function createId(): string {
  return crypto.randomUUID();
}

/**
 * Creates a text element centered on a point.
 *
 * Args:
 *   preset: Text style preset.
 *   center: Center position in pt.
 *
 * Returns:
 *   New text element.
 */
export function createTextElement(preset: TextPreset, center: Point): TextElement {
  const config = TEXT_PRESETS[preset];
  return {
    id: createId(),
    type: "text",
    x: center.x - config.width / 2,
    y: center.y - (config.fontSize * 1.2) / 2,
    rotation: 0,
    text: config.text,
    width: config.width,
    fontSize: config.fontSize,
    fontFamily: DEFAULT_FONT_FAMILY,
    fontStyle: config.fontStyle,
    ...PLAIN_TEXT_DECORATION,
    align: "center",
    fill: DEFAULT_TEXT_FILL,
  };
}

/** Star inner / outer radius ratio of new stars. */
const STAR_INNER_RATIO = 30 / 70;
/** Outer radius (pt) of a clicked triangle or star, before it is fitted into its box. */
const REGULAR_SHAPE_RADIUS = 70;

interface ShapePresetConfig {
  readonly geometry: ShapeGeometry;
  /** Size of a shape created by a click (or from the elements panel). */
  readonly size: Size;
}

function regularSize(geometry: ShapeGeometry): Size {
  const unit = unitVertices(geometry);
  if (!unit) throw new Error("regularSize needs a polygon or star");
  const { minX, minY, maxX, maxY } = vertexBounds(unit);
  return { width: (maxX - minX) * REGULAR_SHAPE_RADIUS, height: (maxY - minY) * REGULAR_SHAPE_RADIUS };
}

const TRIANGLE: ShapeGeometry = { kind: "polygon", sides: 3 };
const STAR: ShapeGeometry = { kind: "star", numPoints: 5, innerRatio: STAR_INNER_RATIO };

const SHAPE_PRESETS: { readonly [K in ShapeKind]: ShapePresetConfig } = {
  rect: { geometry: { kind: "rect", cornerRadius: 0 }, size: { width: 160, height: 120 } },
  roundedRect: { geometry: { kind: "rect", cornerRadius: 16 }, size: { width: 160, height: 120 } },
  ellipse: { geometry: { kind: "ellipse" }, size: { width: 120, height: 120 } },
  triangle: { geometry: TRIANGLE, size: regularSize(TRIANGLE) },
  star: { geometry: STAR, size: regularSize(STAR) },
};

function createShape(geometry: ShapeGeometry, box: Bounds): ShapeElement {
  return {
    id: createId(),
    type: "shape",
    x: box.minX,
    y: box.minY,
    rotation: 0,
    width: box.maxX - box.minX,
    height: box.maxY - box.minY,
    geometry,
    fill: DEFAULT_SHAPE_FILL,
    stroke: null,
    label: null,
  };
}

/**
 * Creates a shape element centered on a point.
 *
 * Args:
 *   kind: Shape kind shown in the elements panel.
 *   center: Center position in pt.
 *
 * Returns:
 *   New shape element.
 */
export function createShapeElement(kind: ShapeKind, center: Point): ShapeElement {
  const { geometry, size } = SHAPE_PRESETS[kind];
  return createShape(geometry, {
    minX: center.x - size.width / 2,
    minY: center.y - size.height / 2,
    maxX: center.x + size.width / 2,
    maxY: center.y + size.height / 2,
  });
}

/** Text created by dragging is never narrower than this, in pt. */
export const MIN_TEXT_WIDTH = 40;
/** Style of text created with the text tool. */
const TOOL_TEXT_PRESET: TextPreset = "subheading";

/**
 * Normalizes two drag corners into bounds.
 *
 * Args:
 *   a: Drag start in pt.
 *   b: Drag end in pt.
 *
 * Returns:
 *   Bounds spanning both points.
 */
export function boundsFromPoints(a: Point, b: Point): Bounds {
  return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
}

// 保持原本比例的最大外框，置中於 box
function fitAspect(box: Bounds, aspect: number): Bounds {
  const width = Math.min(box.maxX - box.minX, (box.maxY - box.minY) * aspect);
  const height = width / aspect;
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  return { minX: cx - width / 2, minY: cy - height / 2, maxX: cx + width / 2, maxY: cy + height / 2 };
}

/**
 * Creates a shape that fills a dragged box (the shape tool's drag).
 * Triangles and stars keep their proportions and are centred in the box.
 *
 * Args:
 *   kind: Shape kind.
 *   box: Dragged box in pt (non-empty).
 *
 * Returns:
 *   New shape element.
 */
export function createShapeInBox(kind: ShapeKind, box: Bounds): ShapeElement {
  const { geometry } = SHAPE_PRESETS[kind];
  switch (geometry.kind) {
    case "rect": {
      const shortSide = Math.min(box.maxX - box.minX, box.maxY - box.minY);
      return createShape({ kind: "rect", cornerRadius: Math.min(geometry.cornerRadius, shortSide / 2) }, box);
    }
    case "ellipse":
      return createShape(geometry, box);
    case "polygon":
    case "star":
      return createShape(geometry, fitAspect(box, naturalAspect(geometry)));
    default: {
      const exhaustive: never = geometry;
      return exhaustive;
    }
  }
}

/**
 * Creates the empty text the text tool edits in place. A click puts the first line's middle at
 * the point; a drag sets the left edge, top and wrapping width.
 *
 * Args:
 *   start: Click point, or drag start, in pt.
 *   box: Dragged box, or null for a click.
 *
 * Returns:
 *   Text element with empty text (added to the document only when the user types something).
 */
export function createToolText(start: Point, box: Bounds | null): TextElement {
  const config = TEXT_PRESETS[TOOL_TEXT_PRESET];
  const lineHeight = config.fontSize * 1.2;
  return {
    id: createId(),
    type: "text",
    x: box ? box.minX : start.x,
    y: box ? box.minY : start.y - lineHeight / 2,
    rotation: 0,
    text: "",
    width: box ? Math.max(MIN_TEXT_WIDTH, box.maxX - box.minX) : config.width,
    fontSize: config.fontSize,
    fontFamily: DEFAULT_FONT_FAMILY,
    fontStyle: config.fontStyle,
    ...PLAIN_TEXT_DECORATION,
    align: "left",
    fill: DEFAULT_TEXT_FILL,
  };
}

/**
 * Creates an image element scaled to fit within half of the page, preserving aspect ratio.
 *
 * Args:
 *   src: Image URL.
 *   natural: Intrinsic image size in pixels (treated as pt at 100%).
 *   page: Page size in pt.
 *   center: Center position in pt.
 *
 * Returns:
 *   New image element.
 */
export function createImageElement(src: string, natural: Size, page: Size, center: Point): ImageElement {
  const safeWidth = Math.max(natural.width, 1);
  const safeHeight = Math.max(natural.height, 1);
  const scale = Math.min(
    1,
    (page.width * IMAGE_MAX_PAGE_RATIO) / safeWidth,
    (page.height * IMAGE_MAX_PAGE_RATIO) / safeHeight,
  );
  const width = safeWidth * scale;
  const height = safeHeight * scale;
  return {
    id: createId(),
    type: "image",
    x: center.x - width / 2,
    y: center.y - height / 2,
    rotation: 0,
    src,
    width,
    height,
  };
}

/**
 * Creates an empty page.
 *
 * Args:
 *   name: Page name.
 *   size: Page size in pt.
 *   background: Background color.
 *   masterId: Master page the page uses; null = none.
 *
 * Returns:
 *   New page without elements.
 */
export function createPage(name: string, size: Size, background: string, masterId: PageId | null = null): Page {
  return { id: createId(), name, width: size.width, height: size.height, background, elements: [], masterId };
}

/**
 * Creates an empty master page.
 *
 * Args:
 *   name: Master page name.
 *   size: Page size in pt.
 *   background: Background color (the default of pages added with it).
 *   parentId: Master page it is based on; null = top level.
 *
 * Returns:
 *   New master page without elements.
 */
export function createMasterPage(name: string, size: Size, background: string, parentId: PageId | null): MasterPage {
  return { id: createId(), name, width: size.width, height: size.height, background, elements: [], parentId };
}

/**
 * Names for new pages: `Page-N` after the largest number already used (or the page count).
 *
 * Args:
 *   pages: Existing pages.
 *   count: How many names to return.
 *
 * Returns:
 *   `count` unused names in increasing order.
 */
export function nextPageNames(pages: readonly Page[], count: number): string[] {
  const used = pages
    .map((page) => /^Page-(\d+)$/.exec(page.name))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number(match[1]));
  const first = Math.max(pages.length, ...used) + 1;
  return Array.from({ length: count }, (_, index) => `Page-${first + index}`);
}

/**
 * Creates the document for a new project: one blank A4 portrait page.
 *
 * Returns:
 *   Blank document.
 */
export function createBlankDocument(): EditorDocument {
  return {
    name: "未命名文件",
    margins: DEFAULT_MARGINS,
    pageNumberRules: [],
    masters: [],
    pages: [createPage("Page-1", presetToPt(PAGE_SIZE_PRESETS.a4), DEFAULT_PAGE_BACKGROUND)],
  };
}

/**
 * Creates the demo document shown in browser-only dev mode: one A4 page with sample elements.
 *
 * Returns:
 *   Sample document.
 */
export function createSampleDocument(): EditorDocument {
  const size = presetToPt(PAGE_SIZE_PRESETS.a4);
  const centerX = size.width / 2;
  const page = createPage("Page-1", size, DEFAULT_PAGE_BACKGROUND);
  const heading = createTextElement("heading", { x: centerX, y: 130 });
  const subheading = createTextElement("subheading", { x: centerX, y: 180 });
  const body = createTextElement("body", { x: centerX, y: 260 });
  const elements: readonly CanvasElement[] = [
    {
      ...createShape({ kind: "rect", cornerRadius: 12 }, { minX: centerX - 240, minY: 90, maxX: centerX + 240, maxY: 220 }),
      fill: "#e0e7ff",
    },
    { ...heading, text: "雜誌編輯軟體", width: 420, x: centerX - 210 },
    { ...subheading, text: "Konva.js 編輯範例", fill: "#4f46e5" },
    { ...body, text: "點選物件可拖曳、縮放、旋轉；雙擊文字可直接編輯。", width: 360, x: centerX - 180 },
    { ...createShapeElement("ellipse", { x: 180, y: 480 }), fill: "#fda4af" },
    { ...createShapeElement("star", { x: centerX, y: 480 }), fill: "#fcd34d" },
    { ...createShapeElement("triangle", { x: size.width - 180, y: 490 }), fill: "#86efac" },
  ];
  return { name: "未命名文件", margins: DEFAULT_MARGINS, pageNumberRules: [], masters: [], pages: [{ ...page, elements }] };
}

const POLYGON_NAMES: Readonly<Record<number, string>> = { 3: "三角形", 4: "四邊形", 5: "五邊形", 6: "六邊形" };

/**
 * Returns the name of a shape's kind, e.g. 「圓角矩形」.
 *
 * Args:
 *   shape: Shape element.
 *
 * Returns:
 *   Label text.
 */
export function describeShape(shape: ShapeElement): string {
  const { geometry } = shape;
  switch (geometry.kind) {
    case "rect":
      return geometry.cornerRadius > 0 ? "圓角矩形" : "矩形";
    case "ellipse":
      return shape.width === shape.height ? "圓形" : "橢圓";
    case "polygon":
      return POLYGON_NAMES[geometry.sides] ?? `${geometry.sides} 邊形`;
    case "star":
      return "星形";
    default: {
      const exhaustive: never = geometry;
      return exhaustive;
    }
  }
}

// 空白壓成一個、去頭尾，超過 max 個字截斷；沒有內容時回傳 null
function summarize(text: string, max: number): string | null {
  const chars = Array.from(text.replace(/\s+/g, " ").trim());
  if (chars.length === 0) return null;
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : chars.join("");
}

/**
 * Returns a short human-readable label for an element (used by the layers panel).
 *
 * Args:
 *   element: Canvas element.
 *
 * Returns:
 *   Label text.
 */
export function describeElement(element: CanvasElement): string {
  switch (element.type) {
    case "text":
      return summarize(element.text, 20) ?? "文字";
    case "shape": {
      // 有文字的圖形帶上文字開頭，圖層清單才分得出是哪一個
      const text = element.label ? summarize(element.label.text, 12) : null;
      return text ? `${describeShape(element)}：${text}` : describeShape(element);
    }
    case "image":
      return "圖片";
    default: {
      const exhaustive: never = element;
      return exhaustive;
    }
  }
}
