import Konva from "konva";
import { konvaFontStyle, konvaTextStyle } from "@/lib/editor/text-style";
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
 *   The wrapped lines, the first line's baseline offset and each line's width.
 */
export function measureTextLayout(element: TextElement): TextLayout {
  const node = new Konva.Text({
    text: element.text,
    width: element.width,
    fontSize: element.fontSize,
    fontFamily: element.fontFamily,
    ...konvaTextStyle(element),
    align: element.align,
  });
  try {
    const lines = node.textArr.map((line) => line.text);
    // 與 Konva Text 的繪製方式相同（非 legacy 模式）：以 "M" 的字型外框決定 alphabetic 基線
    const metrics = node.measureSize("M");
    const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
    const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
    const lineHeight = element.fontSize * element.lineHeight;
    return { lines, baseline: (ascent - descent) / 2 + lineHeight / 2, lineWidths: node.textArr.map((line) => line.width) };
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
 *   style: Font size, family, weight and italic (italic is a slant and keeps the width, but the
 *     node is set up like the drawn one anyway).
 *
 * Returns:
 *   Width in pt (fonts must already be loaded).
 */
export function measureLineWidth(
  text: string,
  style: Pick<PageNumberStyle, "fontSize" | "fontFamily" | "fontStyle" | "italic">,
): number {
  const node = new Konva.Text({ text, fontSize: style.fontSize, fontFamily: style.fontFamily, fontStyle: konvaFontStyle(style) });
  try {
    return node.width();
  } finally {
    node.destroy();
  }
}
