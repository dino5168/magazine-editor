import { inheritedElements } from "@/lib/editor/master-pages";
import { withPageNumbers, type MeasureTextWidth } from "@/lib/editor/page-numbers";
import { labelAsText, labelLayoutKey } from "@/lib/editor/shape-label";
import type { EditorDocument, Page, TextElement } from "@/lib/editor/types";
import { resolveElementsVariables, resolveElementVariables, variableValues } from "@/lib/editor/variables";

/** How the editor wrapped one text element; mirrors `TextLayout` in `src-tauri/src/export/mod.rs`. */
export interface TextLayout {
  /** Lines exactly as the canvas wrapped them. */
  readonly lines: readonly string[];
  /** Distance (pt) from the element's top to the first line's baseline. */
  readonly baseline: number;
  /** Width (pt) of each line as Konva measured it; the underline / strikethrough follow it. */
  readonly lineWidths: readonly number[];
}

/** Payload of the `export_pdf` command. */
export interface ExportRequest {
  readonly document: EditorDocument;
  /** Keyed by text element id. */
  readonly textLayouts: Readonly<Record<string, TextLayout>>;
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
 * A page as exported: its master pages' elements (ancestor first) at the bottom, copied with
 * per-page ids, then its own elements; the text variables replaced with the page's values.
 */
function withMasterContent(document: EditorDocument, page: Page, pageIndex: number): Page {
  const values = variableValues(document, page.id);
  if (values === null) return page;
  // 同一個主頁物件會出現在很多頁，而且換完變數每頁的文字不同：textLayouts 以 id 為 key，所以每頁要有自己的 id
  const inherited = inheritedElements(document.masters, page).map((element, index) => ({
    ...resolveElementVariables(element, values),
    id: masterCopyId(pageIndex, index),
  }));
  const own = resolveElementsVariables(page.elements, values);
  if (inherited.length === 0 && own === page.elements) return page;
  return { ...page, elements: [...inherited, ...own] };
}

/**
 * Builds the export payload: the document plus the canvas line breaks of every text element, so
 * the PDF wraps exactly like the editor.
 *
 * Each page gets its master pages' content and its text variables resolved (`withMasterContent`),
 * then its page number as an ordinary shape on top (`withPageNumbers`), so the Rust renderers draw
 * everything as plain elements and never read master pages. The exported copy is never stored.
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
  const expanded = source.pages.map((page, index) => withMasterContent(source, page, index));
  const changed = expanded.some((page, index) => page !== source.pages[index]);
  const pages = withPageNumbers(changed ? expanded : source.pages, source.pageNumberRules, source.margins, measureWidth);
  const document = pages === source.pages ? source : { ...source, pages };
  const textLayouts: Record<string, TextLayout> = {};
  for (const page of document.pages) {
    for (const element of page.elements) {
      if (element.type === "text") textLayouts[element.id] = measure(element);
      // 圖形內文字：以 `<id>#label` 為 key；位置由 Rust 依外框與垂直對齊計算，量測只需要寬度與樣式
      if (element.type === "shape" && element.label && element.label.text !== "") {
        textLayouts[labelLayoutKey(element.id)] = measure(labelAsText(element, element.label, { x: 0, y: 0 }));
      }
    }
  }
  return { document, textLayouts };
}
