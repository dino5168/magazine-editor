import Konva from "konva";
import { TEXT_LINE_HEIGHT } from "@/lib/editor/geometry";
import type { PageNumberStyle, TextElement } from "@/lib/editor/types";
import type { TextLayout } from "./export-request";

/**
 * Lays out a text element exactly like the canvas does, using an off-screen `Konva.Text` with the
 * same attributes as the node rendered in `canvas-elements.tsx`.
 *
 * Args:
 *   element: Text element (fonts must already be loaded, as they are once the editor is shown).
 *
 * Returns:
 *   The wrapped lines and the first line's baseline offset.
 */
export function measureTextLayout(element: TextElement): TextLayout {
  const node = new Konva.Text({
    text: element.text,
    width: element.width,
    fontSize: element.fontSize,
    fontFamily: element.fontFamily,
    fontStyle: element.fontStyle,
    align: element.align,
    lineHeight: TEXT_LINE_HEIGHT,
  });
  try {
    const lines = node.textArr.map((line) => line.text);
    // 與 Konva Text 的繪製方式相同（非 legacy 模式）：以 "M" 的字型外框決定 alphabetic 基線
    const metrics = node.measureSize("M");
    const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
    const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
    const lineHeight = element.fontSize * TEXT_LINE_HEIGHT;
    return { lines, baseline: (ascent - descent) / 2 + lineHeight / 2 };
  } finally {
    node.destroy();
  }
}

/**
 * Measures the width of one unwrapped line the way the canvas draws it (`MeasureTextWidth` for
 * page numbers).
 *
 * Args:
 *   text: One line of text.
 *   style: Font size, family and weight.
 *
 * Returns:
 *   Width in pt (fonts must already be loaded).
 */
export function measureLineWidth(text: string, style: Pick<PageNumberStyle, "fontSize" | "fontFamily" | "fontStyle">): number {
  const node = new Konva.Text({ text, fontSize: style.fontSize, fontFamily: style.fontFamily, fontStyle: style.fontStyle });
  try {
    return node.width();
  } finally {
    node.destroy();
  }
}
