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
  /** `Swatch.id` the color follows (its RGB; the alpha stays this shadow's own); null = not linked. */
  readonly swatchId: string | null;
  /** pt, towards the page's right / bottom whatever the element's rotation. */
  readonly offsetX: number;
  readonly offsetY: number;
}

/**
 * Horizontal alignment of each line. `distributed`（首尾置中 / 分散對齊, v10）: every line,
 * the last one included, runs from the box's left edge to its right edge (a lone character is
 * centred); lines wrap as with `left`.
 */
export type TextAlign = "left" | "center" | "right" | "distributed";

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
  /** Distance between baselines ÷ font size (Konva `lineHeight`); 1.2 in files before v9. */
  readonly lineHeight: number;
  /** Extra space after every character, in 1/1000 of the font size (may be negative); 0 before v9. */
  readonly letterSpacing: number;
  readonly align: TextAlign;
  /** Text color. */
  readonly fill: string;
  /** `Swatch.id` the text color follows (its RGB; the alpha stays the text's own); null = not linked. */
  readonly fillSwatchId: string | null;
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
  /** `Swatch.id` the color follows; null = not linked. */
  readonly swatchId: string | null;
  /** Line width in pt. */
  readonly width: number;
  /** `dashDot`（點劃線）since v15. */
  readonly dash: "solid" | "dashed" | "dotted" | "dashDot";
}

/** Text inside a shape (draw.io's label). */
export interface ShapeLabel extends StyledText {
  readonly text: string;
  readonly verticalAlign: "top" | "middle" | "bottom";
}

/** Radii of a rectangle's four corners (pt), in Konva's order: top-left, top-right, bottom-right, bottom-left. */
export type CornerRadii = readonly [number, number, number, number];

/**
 * A rectangle's corner radius: one number for four equal corners (stored that way whenever they
 * match), or four numbers (`CornerRadii`, v11) when they differ.
 */
export type CornerRadius = number | CornerRadii;

/**
 * What a shape draws inside its box. Adding a box shape = adding a member here.
 * Polygons and stars are stretched so their vertices touch every edge of the box.
 */
export type ShapeGeometry =
  | { readonly kind: "rect"; readonly cornerRadius: CornerRadius }
  | { readonly kind: "ellipse" }
  | { readonly kind: "polygon"; readonly sides: number }
  /** `innerRatio` = inner radius / outer radius. */
  | { readonly kind: "star"; readonly numPoints: number; readonly innerRatio: number }
  /**
   * A shape from the shape library (v14), stretched to fill the box. Only the library id and the
   * named parameters are stored; a missing parameter takes its default, an out-of-range one is
   * clamped when drawing.
   */
  | { readonly kind: "preset"; readonly preset: string; readonly params: Readonly<Record<string, number>> };

export type GeometryKind = ShapeGeometry["kind"];

export interface ShapeElement extends BaseElement {
  readonly type: "shape";
  readonly width: number;
  readonly height: number;
  readonly geometry: ShapeGeometry;
  readonly fill: string;
  /** `Swatch.id` the fill follows; null = not linked. */
  readonly fillSwatchId: string | null;
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

/** A point of a line, relative to the line's (x, y). */
export interface LinePoint {
  readonly x: number;
  readonly y: number;
}

/** What a line end draws: nothing, an open head (`>`, stroked) or a filled triangle. */
export type LineArrowhead = "none" | "open" | "triangle";

/** One end of a line. Arrowheads are always solid, whatever the line's dash. */
export interface LineEnd {
  readonly arrowhead: LineArrowhead;
  /** Size factor of the arrowhead (`line-path.ts` turns it into pt with the stroke width). */
  readonly scale: number;
}

/**
 * A line or arrow (v15), defined by its points rather than a box. (x, y) is the top-left corner
 * of the points' bounding box, so the points' smallest x and y are 0 (`withLinePoints`).
 */
export interface LineElement extends BaseElement {
  readonly type: "line";
  /** 2–`MAX_LINE_POINTS` points, relative to (x, y). */
  readonly points: readonly LinePoint[];
  /** straight: segments from point to point (2 points = a straight line); smooth: a curve through every point. */
  readonly path: "straight" | "smooth";
  /** double: two parallel thin lines, total width = the stroke width (straight lines only; drawn single when smooth). */
  readonly compound: "single" | "double";
  /** Lines always have a stroke. */
  readonly stroke: Stroke;
  /** End at the first point. */
  readonly start: LineEnd;
  /** End at the last point. */
  readonly end: LineEnd;
}

export type CanvasElement = TextElement | ShapeElement | ImageElement | LineElement;

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
  /** `Swatch.id` the background follows; null = not linked. */
  readonly backgroundSwatchId: string | null;
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
/** Page numbers keep the default line height and no letter spacing (vertical ones are one character per line). */
export interface PageNumberStyle extends Omit<TextStyle, "align" | "lineHeight" | "letterSpacing"> {
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

/**
 * A named document color（文件色票, v12）. Swatches are opaque; every use keeps its own copy of the
 * color (with its own alpha) plus the swatch id, so drawing and export never read the swatch list.
 */
export interface Swatch {
  /** Unique among the swatches. */
  readonly id: string;
  /** Trimmed, unique among the swatches. */
  readonly name: string;
  /** `#rrggbb`, lowercase. */
  readonly color: string;
}

/** `OS/2.fsType` embedding permission of a font file (restricted / bitmap-only fonts are refused). */
export type FontEmbedding = "installable" | "editable" | "previewAndPrint";

/** One imported font file and what was read from it at import (Rust `FontFile`). */
export interface FontFile {
  /** `assets/fonts/<hash>.ttf|otf`. */
  readonly src: string;
  /** Family and style names inside the file (display only). */
  readonly fileFamily: string;
  readonly fileStyle: string;
  /** `OS/2` weight class (display only). */
  readonly weight: number;
  readonly embedding: FontEmbedding;
  /** Metrics the canvas (Windows engines) uses, in em; written as `ascent-override` / `descent-override`. */
  readonly ascent: number;
  readonly descent: number;
  /** First-baseline shift (em, positive = down) in engines that ignore the overrides (Apple). */
  readonly appleBaselineShift: number;
}

/**
 * A font imported into the project（專案字型, v13）. Its CSS / Typst family is
 * `project-font-<id>`, whatever the files call themselves; texts store that family in `fontFamily`.
 */
export interface ProjectFont {
  /** Unique; letters, digits, `-` and `_` only (it becomes part of a CSS family name). */
  readonly id: string;
  /** Shown in the font menu; trimmed, unique among the project fonts. */
  readonly name: string;
  readonly generic: "serif" | "sans-serif";
  readonly regular: FontFile;
  /** Face drawn for `fontStyle: "bold"` (any weight); null → bold draws the regular file. */
  readonly bold: FontFile | null;
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
  /** Document colors in display order; ids and names unique. */
  readonly swatches: readonly Swatch[];
  /** Project fonts in menu order; ids and names unique. */
  readonly fonts: readonly ProjectFont[];
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
