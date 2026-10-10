/**
 * 編輯器文件模型。
 *
 * 長度單位一律為 pt（1/72 inch），與 Typst 一致；座標原點為頁面左上角。
 * 每種物件的 `x` / `y` 都是外框（旋轉前）的左上角，旋轉也繞這一點。
 */

export type ElementId = string;
export type PageId = string;

export interface BaseElement {
  readonly id: ElementId;
  /** Top-left corner of the element's box, before rotation. */
  readonly x: number;
  readonly y: number;
  /** Degrees, clockwise, around (x, y). */
  readonly rotation: number;
}

/** Hard text shadow: the text drawn again at an offset, without blur. */
export interface TextShadow {
  /** `#rrggbb` or `#rrggbbaa`. */
  readonly color: string;
  /** pt, towards the page's right / bottom whatever the element's rotation. */
  readonly offsetX: number;
  readonly offsetY: number;
}

/** Text style shared by text elements, the text inside shapes and page numbers. */
export interface TextStyle {
  readonly fontSize: number;
  readonly fontFamily: string;
  /** Weight: picks the regular or the bold font file. */
  readonly fontStyle: "normal" | "bold";
  /** Slanted by the renderer (no italic font files are bundled). */
  readonly italic: boolean;
  readonly underline: boolean;
  readonly strikethrough: boolean;
  /** null = no shadow. */
  readonly shadow: TextShadow | null;
  readonly align: "left" | "center" | "right";
  /** Text color. */
  readonly fill: string;
}

/**
 * A named text style in the document's style sheet (`EditorDocument.textStyles`). Texts linked to
 * it keep their own copy of every field; a field that differs from the style is an override.
 */
export interface TextStyleDef extends TextStyle {
  readonly id: string;
  readonly name: string;
}

/** Text that can be linked to a style sheet entry. */
export interface StyledText extends TextStyle {
  /** `TextStyleDef.id` it follows; null = not linked. */
  readonly styleId: string | null;
}

export interface TextElement extends BaseElement, StyledText {
  readonly type: "text";
  readonly text: string;
  /** Wrapping width. */
  readonly width: number;
}

export interface Stroke {
  /** `#rrggbb` or `#rrggbbaa`. */
  readonly color: string;
  /** Line width in pt. */
  readonly width: number;
  readonly dash: "solid" | "dashed" | "dotted";
}

/** Text inside a shape (draw.io's label). */
export interface ShapeLabel extends StyledText {
  readonly text: string;
  readonly verticalAlign: "top" | "middle" | "bottom";
}

/**
 * What a shape draws inside its box. Adding a box shape = adding a member here.
 * Polygons and stars are stretched so their vertices touch every edge of the box.
 */
export type ShapeGeometry =
  | { readonly kind: "rect"; readonly cornerRadius: number }
  | { readonly kind: "ellipse" }
  | { readonly kind: "polygon"; readonly sides: number }
  /** `innerRatio` = inner radius / outer radius. */
  | { readonly kind: "star"; readonly numPoints: number; readonly innerRatio: number };

export type GeometryKind = ShapeGeometry["kind"];

export interface ShapeElement extends BaseElement {
  readonly type: "shape";
  readonly width: number;
  readonly height: number;
  readonly geometry: ShapeGeometry;
  readonly fill: string;
  /** null = no outline. */
  readonly stroke: Stroke | null;
  /** null = no text. */
  readonly label: ShapeLabel | null;
}

export interface ImageElement extends BaseElement {
  readonly type: "image";
  /**
   * Desktop: project-relative path such as `assets/images/<hash>.png` (resolved by `resolveAssetUrl`).
   * Browser-only dev mode (no project): a bundled asset or `blob:` URL used as-is.
   */
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

export type CanvasElement = TextElement | ShapeElement | ImageElement;

export type ElementType = CanvasElement["type"];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Partial update for any element kind; `id` and `type` are immutable. */
export type ElementPatch = Partial<DistributiveOmit<CanvasElement, "id" | "type">>;

/** What pages and master pages have in common: everything the canvas needs to draw and edit one. */
export interface Sheet {
  /** Unique across pages and master pages. */
  readonly id: PageId;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly background: string;
  /** Z-order: index 0 is the bottom-most element. */
  readonly elements: readonly CanvasElement[];
}

export interface Page extends Sheet {
  /** Master page drawn under this page's elements; null = none. */
  readonly masterId: PageId | null;
}

/**
 * Content shared by the pages that use it (see `master-pages.ts`). Its background is only the
 * default of new pages; pages keep their own background.
 */
export interface MasterPage extends Sheet {
  /** Master page this one is based on (drawn under it); null = top level. */
  readonly parentId: PageId | null;
}

/** Page margins in pt, measured inward from each page edge. */
export interface Margins {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** Where a page number sits; the column decides the text alignment, the middle ones are vertical. */
export type PageNumberPosition =
  | "topLeft"
  | "topCenter"
  | "topRight"
  | "middleLeft"
  | "middleRight"
  | "bottomLeft"
  | "bottomCenter"
  | "bottomRight";

/** Settings for the odd or the even pages of a page number rule. */
export interface PageNumberFace {
  readonly position: PageNumberPosition;
  /** Text before the number, e.g. "第 ". */
  readonly prefix: string;
  /** Text after the number, e.g. " 頁". */
  readonly suffix: string;
}

/** Look of a page number, shared by the odd and even pages of a rule. */
export interface PageNumberStyle extends Omit<TextStyle, "align"> {
  /** null = no border. */
  readonly stroke: Stroke | null;
}

/** Page numbering of one run of pages (one row in the page number dialog). */
export interface PageNumberRule {
  readonly id: string;
  /** First page of the run (1-based, inclusive; counted in document order). */
  readonly from: number;
  /** Last page of the run (inclusive); may exceed the current page count. */
  readonly to: number;
  /** Number shown on page `from`; following pages count up by 1. */
  readonly start: number;
  readonly odd: PageNumberFace;
  readonly even: PageNumberFace;
  readonly style: PageNumberStyle;
}

export interface EditorDocument {
  readonly name: string;
  /** Same for every page; drawn as guides on the canvas only, never exported. */
  readonly margins: Margins;
  /**
   * Sorted by `from`, ranges never overlap. Pages outside every rule have no number. The numbers
   * are drawn on the canvas and exported, but are not elements (see `page-numbers.ts`).
   */
  readonly pageNumberRules: readonly PageNumberRule[];
  /** Style sheet; ids and names unique (`style-sheet.ts`). */
  readonly textStyles: readonly TextStyleDef[];
  /** Kept apart from `pages`: page order, page numbers and export only ever see pages. */
  readonly masters: readonly MasterPage[];
  readonly pages: readonly Page[];
}

/** An image stored in the project (`assets/images/`), listed in the upload panel. */
export interface AssetInfo {
  /** Same value an `ImageElement.src` uses to show this image. */
  readonly src: string;
  /** Original file name. */
  readonly name: string;
  /** Intrinsic size in pixels. */
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}
