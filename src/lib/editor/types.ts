/**
 * 編輯器文件模型。
 *
 * 長度單位一律為 pt（1/72 inch），與 Typst 一致；座標原點為頁面左上角。
 * `x` / `y` 沿用 Konva 語意：text / rect / image 為左上角，ellipse / polygon / star 為中心點。
 */

export type ElementId = string;
export type PageId = string;

export interface BaseElement {
  readonly id: ElementId;
  readonly x: number;
  readonly y: number;
  /** Degrees, clockwise, around the element origin. */
  readonly rotation: number;
}

export interface TextElement extends BaseElement {
  readonly type: "text";
  readonly text: string;
  /** Wrapping width. */
  readonly width: number;
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly fontStyle: "normal" | "bold";
  readonly align: "left" | "center" | "right";
  readonly fill: string;
}

export interface RectElement extends BaseElement {
  readonly type: "rect";
  readonly width: number;
  readonly height: number;
  readonly cornerRadius: number;
  readonly fill: string;
}

export interface EllipseElement extends BaseElement {
  readonly type: "ellipse";
  readonly radiusX: number;
  readonly radiusY: number;
  readonly fill: string;
}

export interface PolygonElement extends BaseElement {
  readonly type: "polygon";
  readonly sides: number;
  readonly radius: number;
  readonly fill: string;
}

export interface StarElement extends BaseElement {
  readonly type: "star";
  readonly numPoints: number;
  readonly innerRadius: number;
  readonly outerRadius: number;
  readonly fill: string;
}

export interface ImageElement extends BaseElement {
  readonly type: "image";
  /** Bundled asset URL or session-scoped `blob:` URL. */
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

export type CanvasElement =
  | TextElement
  | RectElement
  | EllipseElement
  | PolygonElement
  | StarElement
  | ImageElement;

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

export interface UploadedImage {
  readonly id: string;
  readonly name: string;
  readonly src: string;
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
