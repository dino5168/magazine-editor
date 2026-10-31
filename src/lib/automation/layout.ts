/**
 * Text sizes as the canvas lays them out, for the MCP tools (`list_elements` heights, `check_layout`).
 *
 * The tools never estimate text: they use the same layout as the canvas and the exports
 * (`measureTextLayout` in the app, a fake in tests). Plan: `docs/14-Plan-ClaudeCode看見畫面/1-看見畫面-實作.md`.
 */
import { textBlockHeight } from "@/lib/editor/shape-label";
import type { TextElement } from "@/lib/editor/types";
import type { TextLayout } from "@/lib/export/export-request";

/** Lays out one text element like the canvas (`measureTextLayout`). */
export type MeasureText = (element: TextElement) => TextLayout;

/**
 * Height of a text element as drawn: its wrapped lines times the line height.
 *
 * Args:
 *   element: Text element (fonts loaded, as they are once the editor is shown).
 *   measure: Canvas layout.
 *
 * Returns:
 *   Height in pt.
 */
export function measuredTextHeight(element: TextElement, measure: MeasureText): number {
  return textBlockHeight(measure(element).lines.length, element.fontSize, element.lineHeight);
}
