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
 * Args:
 *   document: Document to export.
 *   measure: Lays out one text element (`measureTextLayout` in the app; a fake in tests).
 *
 * Returns:
 *   Export request.
 */
export function buildExportRequest(
  document: EditorDocument,
  measure: (element: TextElement) => TextLayout,
): ExportRequest {
  const textLayouts: Record<string, TextLayout> = {};
  for (const page of document.pages) {
    for (const element of page.elements) {
      if (element.type === "text") textLayouts[element.id] = measure(element);
    }
  }
  return { document, textLayouts };
}
