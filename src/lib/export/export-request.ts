import { withPageNumbers, type MeasureTextWidth } from "@/lib/editor/page-numbers";
import { labelAsText, labelLayoutKey } from "@/lib/editor/shape-label";
import type { EditorDocument, TextElement } from "@/lib/editor/types";

/** How the editor wrapped one text element; mirrors `TextLayout` in `src-tauri/src/export/mod.rs`. */
export interface TextLayout {
  /** Lines exactly as the canvas wrapped them. */
  readonly lines: readonly string[];
  /** Distance (pt) from the element's top to the first line's baseline. */
  readonly baseline: number;
}

/** Payload of the `export_pdf` command. */
export interface ExportRequest {
  readonly document: EditorDocument;
  /** Keyed by text element id. */
  readonly textLayouts: Readonly<Record<string, TextLayout>>;
}

/**
 * Builds the export payload: the document plus the canvas line breaks of every text element, so
 * the PDF wraps exactly like the editor.
 *
 * Page numbers are added here as ordinary shapes on top of each page (`withPageNumbers`), so the
 * Rust renderers draw them like any other shape with a label. The exported copy is never stored.
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
  const pages = withPageNumbers(source.pages, source.pageNumberRules, source.margins, measureWidth);
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
