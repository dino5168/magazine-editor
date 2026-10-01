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

/** Text style shared by text elements and the text inside shapes. */
export interface TextStyle {
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly fontStyle: "normal" | "bold";
  readonly align: "left" | "center" | "right";
  /** Text color. */
  readonly fill: string;
}

export interface TextElement extends BaseElement, TextStyle {
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
export interface ShapeLabel extends TextStyle {
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

export interface Page {
  readonly id: PageId;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly background: string;
  /** Z-order: index 0 is the bottom-most element. */
  readonly elements: readonly CanvasElement[];
}

export interface EditorDocument {
  readonly name: string;
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
