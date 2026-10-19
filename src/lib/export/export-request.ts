import { inheritedElements } from "@/lib/editor/master-pages";
import { spilloverInto } from "@/lib/editor/spreads";
import { withPageNumbers, type MeasureTextWidth } from "@/lib/editor/page-numbers";
import { labelAsText, labelLayoutKey } from "@/lib/editor/shape-label";
import { photoPlacement, type PhotoPlacement } from "@/lib/editor/shape-image";
import type { PathCommand } from "@/lib/editor/shape-path";
import { detailStroke, presetPath } from "@/lib/editor/shape-presets";
import type { LineBox } from "@/lib/editor/text-indent";
import type { EditorDocument, Page, Stroke, TextElement } from "@/lib/editor/types";
import { resolveElementsVariables, resolveElementVariables, variableValues } from "@/lib/editor/variables";
import { exportedLinePieces } from "./line-export";

/** How the editor wrapped one text element; mirrors `TextLayout` in `src-tauri/src/export/mod.rs`. */
export interface TextLayout {
  /** Lines exactly as the canvas wrapped them. */
  readonly lines: readonly string[];
  /** Distance (pt) from the element's top to the first line's baseline. */
  readonly baseline: number;
  /**
   * Width (pt) of each line as the canvas draws it; the underline / strikethrough follow it. For
   * distributed text: from the first character's left edge to the last one's right edge.
   */
  readonly lineWidths: readonly number[];
  /**
   * Distributed text only: distance (pt) between neighbouring characters of each line
   * (`distributeText`), letter spacing included.
   */
  readonly lineGaps?: readonly number[];
  /**
   * Indented text only (paragraph indents): where each line may go, pt from the text box's left
   * edge (`layoutIndentedText`); the line is aligned within its box.
   */
  readonly lineBoxes?: readonly LineBox[];
}

/**
 * The outline of one shape-library shape, computed by the editor; mirrors `ShapePath` in
 * `src-tauri/src/export/mod.rs`. Rust does not know the library, it only draws these paths.
 */
export interface ExportShapePath {
  /** pt relative to the shape's box; filled and stroked. */
  readonly outline: readonly PathCommand[];
  /** Stroked only; may be empty. */
  readonly details: readonly PathCommand[];
  /** The details' line (`detailStroke`); null when there are no details. */
  readonly detailStroke: Stroke | null;
}

/** Payload of the export commands. */
export interface ExportRequest {
  readonly document: EditorDocument;
  /** Keyed by text element id. */
  readonly textLayouts: Readonly<Record<string, TextLayout>>;
  /**
   * Keyed by shape element id (after master pages and spread copies are expanded). A shape-library
   * shape this version does not know has no entry; the export skips it.
   */
  readonly shapePaths: Readonly<Record<string, ExportShapePath>>;
  /**
   * Keyed by shape element id (after expansion): where each image frame's photo goes, from the same
   * `photoPlacement` the canvas uses (Rust `PhotoPlacement`; Rust does not repeat the formula).
   */
  readonly shapePhotos: Readonly<Record<string, PhotoPlacement>>;
}

/**
 * Id of the copy of a master page element on the page at `pageIndex`. Short on purpose: Rust
 * accepts ids of at most 64 characters, so `<pageId>/<elementId>` (73) would not fit. Element ids
 * are UUIDs (hex digits only), so they never start with `master:`.
 */
export function masterCopyId(pageIndex: number, index: number): string {
  return `master:${pageIndex}:${index}`;
}

/**
 * Id of the copy, on the page at `pageIndex`, of a facing-page element crossing the spine (see
 * `spilloverInto`). Short for the same reason as `masterCopyId`.
 */
export function spilloverCopyId(pageIndex: number, index: number): string {
  return `spill:${pageIndex}:${index}`;
}

/**
 * A page as exported, bottom to top: its master pages' elements (ancestor first), the facing page's
 * elements crossing the spine (shifted into this page; the paper crops them, so the two pages join
 * up), then its own elements. Copies get per-page ids; text variables take the values of the page
 * each element belongs to (a running footer crossing the spine keeps its own page number).
 */
function exportedPage(document: EditorDocument, page: Page, pageIndex: number): Page {
  const values = variableValues(document, page.id);
  if (values === null) return page;
  // 同一個主頁物件會出現在很多頁，而且換完變數每頁的文字不同：textLayouts 以 id 為 key，所以每頁要有自己的 id
  const inherited = inheritedElements(document.masters, page).map((element, index) => ({
    ...resolveElementVariables(element, values),
    id: masterCopyId(pageIndex, index),
  }));
  const spillover = spilloverInto(document.pages, pageIndex).map(({ element, sourceIndex, dx }, index) => {
    const sourceValues = variableValues(document, document.pages[sourceIndex].id);
    const resolved = sourceValues ? resolveElementVariables(element, sourceValues) : element;
    return { ...resolved, id: spilloverCopyId(pageIndex, index), x: element.x + dx };
  });
  const own = resolveElementsVariables(page.elements, values);
  if (inherited.length === 0 && spillover.length === 0 && own === page.elements) return page;
  return { ...page, elements: [...inherited, ...spillover, ...own] };
}

/**
 * Builds the export payload: the document plus the canvas line breaks of every text element, so
 * the PDF wraps exactly like the editor.
 *
 * Each page gets its master pages' content, the facing page's elements crossing the spine and its
 * text variables resolved (`exportedPage`),
 * then its page number as an ordinary shape on top (`withPageNumbers`); lines become path shapes
 * (`exportedLinePieces`). So the Rust renderers draw everything as plain elements and never read
 * master pages or lines. The exported copy is never stored.
 *
 * Args:
 *   source: Document to export.
 *   measure: Lays out one text element (`measureTextLayout` in the app; a fake in tests).
 *   measureWidth: Measures one line for the page number boxes (`measureLineWidth` in the app).
 *
 * Returns:
 *   Export request.
 */
export function buildExportRequest(
  source: EditorDocument,
  measure: (element: TextElement) => TextLayout,
  measureWidth: MeasureTextWidth,
): ExportRequest {
  const expanded = source.pages.map((page, index) => exportedPage(source, page, index));
  const changed = expanded.some((page, index) => page !== source.pages[index]);
  const numbered = withPageNumbers(changed ? expanded : source.pages, source.pageNumberRules, source.margins, measureWidth);
  // 線條換成路徑圖形（主頁與跨頁的複本也是）；路徑先放進 shapePaths，下面的圖形庫迴圈不認得它們的 id、不會覆蓋
  const shapePaths: Record<string, ExportShapePath> = {};
  const pages = numbered.map((page) => {
    if (!page.elements.some((element) => element.type === "line")) return page;
    const elements = page.elements.flatMap((element) => {
      if (element.type !== "line") return [element];
      return exportedLinePieces(element).map(({ shape, path }) => {
        shapePaths[shape.id] = path;
        return shape;
      });
    });
    return { ...page, elements };
  });
  const document = pages.every((page, index) => page === source.pages[index]) && pages.length === source.pages.length ? source : { ...source, pages };
  const textLayouts: Record<string, TextLayout> = {};
  const shapePhotos: Record<string, PhotoPlacement> = {};
  for (const page of document.pages) {
    for (const element of page.elements) {
      if (element.type === "text") textLayouts[element.id] = measure(element);
      // 圖形內文字：以 `<id>#label` 為 key；位置由 Rust 依外框與垂直對齊計算，量測只需要寬度與樣式
      if (element.type === "shape" && element.label && element.label.text !== "") {
        textLayouts[labelLayoutKey(element.id)] = measure(labelAsText(element, element.label, { x: 0, y: 0 }));
      }
      // 圖片框的照片位置（主頁與跨頁的複本也有自己的 id）
      if (element.type === "shape" && element.image) {
        shapePhotos[element.id] = photoPlacement(element.width, element.height, element.image);
      }
      // 圖形庫的圖形：路徑由編輯器算好交給 Rust（和畫布同一個 presetPath）；不認得的不放，匯出略過
      if (element.type === "shape" && element.geometry.kind === "preset") {
        const path = presetPath(element.geometry, element.width, element.height);
        if (path) {
          shapePaths[element.id] = {
            outline: path.outline,
            details: path.details,
            detailStroke: path.details.length > 0 ? detailStroke(element.stroke, element.fill) : null,
          };
        }
      }
    }
  }
  return { document, textLayouts, shapePaths, shapePhotos };
}

/**
 * How many shape-library shapes the export skips because this version does not know them (a file
 * from a newer version, or a shape removed from the library).
 *
 * Args:
 *   request: Export request from `buildExportRequest`.
 *
 * Returns:
 *   Number of skipped shapes, counted on every page (master and spread copies included).
 */
export function skippedShapeCount(request: ExportRequest): number {
  return request.document.pages
    .flatMap((page) => page.elements)
    .filter((element) => element.type === "shape" && element.geometry.kind === "preset" && !(element.id in request.shapePaths)).length;
}
