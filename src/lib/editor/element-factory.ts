import { PAGE_SIZE_PRESETS, presetToPt } from "./units";
import type {
  CanvasElement,
  EditorDocument,
  ImageElement,
  Page,
  Point,
  Size,
  TextElement,
} from "./types";

export const DEFAULT_FONT_FAMILY = '"Geist Variable", "Microsoft JhengHei", sans-serif';
export const DEFAULT_SHAPE_FILL = "#64748b";
export const DEFAULT_TEXT_FILL = "#171717";
export const DEFAULT_PAGE_BACKGROUND = "#ffffff";

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
    align: "center",
    fill: DEFAULT_TEXT_FILL,
  };
}

const SHAPE_FACTORIES: { readonly [K in ShapeKind]: (id: string, center: Point) => CanvasElement } = {
  rect: (id, c) => ({ id, type: "rect", x: c.x - 80, y: c.y - 60, rotation: 0, width: 160, height: 120, cornerRadius: 0, fill: DEFAULT_SHAPE_FILL }),
  roundedRect: (id, c) => ({ id, type: "rect", x: c.x - 80, y: c.y - 60, rotation: 0, width: 160, height: 120, cornerRadius: 16, fill: DEFAULT_SHAPE_FILL }),
  ellipse: (id, c) => ({ id, type: "ellipse", x: c.x, y: c.y, rotation: 0, radiusX: 60, radiusY: 60, fill: DEFAULT_SHAPE_FILL }),
  triangle: (id, c) => ({ id, type: "polygon", x: c.x, y: c.y, rotation: 0, sides: 3, radius: 70, fill: DEFAULT_SHAPE_FILL }),
  star: (id, c) => ({ id, type: "star", x: c.x, y: c.y, rotation: 0, numPoints: 5, innerRadius: 30, outerRadius: 70, fill: DEFAULT_SHAPE_FILL }),
};

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
export function createShapeElement(kind: ShapeKind, center: Point): CanvasElement {
  return SHAPE_FACTORIES[kind](createId(), center);
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
 *
 * Returns:
 *   New page without elements.
 */
export function createPage(name: string, size: Size, background: string): Page {
  return { id: createId(), name, width: size.width, height: size.height, background, elements: [] };
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
    { id: createId(), type: "rect", x: centerX - 240, y: 90, rotation: 0, width: 480, height: 130, cornerRadius: 12, fill: "#e0e7ff" },
    { ...heading, text: "雜誌編輯軟體", width: 420, x: centerX - 210 },
    { ...subheading, text: "Konva.js 編輯範例", fill: "#4f46e5" },
    { ...body, text: "點選物件可拖曳、縮放、旋轉；雙擊文字可直接編輯。", width: 360, x: centerX - 180 },
    { id: createId(), type: "ellipse", x: 180, y: 480, rotation: 0, radiusX: 60, radiusY: 60, fill: "#fda4af" },
    { id: createId(), type: "star", x: centerX, y: 480, rotation: 0, numPoints: 5, innerRadius: 30, outerRadius: 70, fill: "#fcd34d" },
    { id: createId(), type: "polygon", x: size.width - 180, y: 490, rotation: 0, sides: 3, radius: 70, fill: "#86efac" },
  ];
  return { name: "未命名文件", pages: [{ ...page, elements }] };
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
    case "text": {
      const chars = Array.from(element.text.replace(/\s+/g, " ").trim());
      if (chars.length === 0) return "文字";
      return chars.length > 20 ? `${chars.slice(0, 20).join("")}…` : chars.join("");
    }
    case "rect":
      return element.cornerRadius > 0 ? "圓角矩形" : "矩形";
    case "ellipse":
      return element.radiusX === element.radiusY ? "圓形" : "橢圓";
    case "polygon":
      return element.sides === 3 ? "三角形" : "多邊形";
    case "star":
      return "星形";
    case "image":
      return "圖片";
    default: {
      const exhaustive: never = element;
      return exhaustive;
    }
  }
}
