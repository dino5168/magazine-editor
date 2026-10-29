import Konva from "konva";
import type { Context } from "konva/lib/Context";
import { drawDistributedText } from "./distributed-text";
import { alignedLineStart, hasTextIndent, layoutIndentedText, type IndentedLayout, type LineBox } from "./text-indent";
import { konvaTextStyle } from "./text-style";
import { wrapParagraph } from "./text-wrap";
import type { TextAlign, TextStyle } from "./types";

/**
 * 段落縮排在 Konva 上的換行與繪製（計畫 `docs/07-Plans-物件屬性與事件/01-新增文字框屬性-實作.md`）。
 * Konva 只能用一個寬度換整段，所以由 `layoutIndentedText` 每段換兩次（換行仍是 Konva 的），節點收
 * **已經換好的文字**（`wrap: "none"`，`textArr` 就是這些行），自訂的 `sceneFunc` 把每行平移到自己的
 * 起點，再交給 Konva 自己的 `_sceneFunc` 畫（底線、字距、陰影、buffer canvas 都照 Konva）。
 * 依賴 Konva 10.5.0 的內部行為（`textArr`、`_sceneFunc`）：升級 Konva 時重測（步驟 1 的實測）。
 */

/** What decides where a text wraps: its style, text and width. */
export type WrappedText = Pick<
  TextStyle,
  | "fontSize"
  | "fontFamily"
  | "fontStyle"
  | "italic"
  | "underline"
  | "strikethrough"
  | "shadow"
  | "lineHeight"
  | "letterSpacing"
  | "indentLeft"
  | "indentRight"
  | "indentFirstLine"
  | "align"
> & { readonly text: string };

// 量字用的離畫面節點（共用一個；設定屬性只會重新算行寬，不會畫）
let measurer: Konva.Text | null = null;

// 換行由 `wrapParagraph` 決定（避頭點，計畫 `docs/05-Plans-字型/04-避頭點換行-實作.md`），
// 行寬照 Konva 量：`wrap: "none"` 時 `textArr[0].width` 就是 Konva 自己的行寬（含字距）
function konvaWrap(style: WrappedText): (paragraph: string, width: number) => string[] {
  return (paragraph, width) => {
    measurer ??= new Konva.Text();
    const node = measurer;
    node.setAttrs({
      fontSize: style.fontSize,
      fontFamily: style.fontFamily,
      ...konvaTextStyle(style),
      align: "left",
      wrap: "none",
      width: undefined,
    });
    return wrapParagraph(paragraph, width, (text) => {
      node.text(text);
      return node.textArr[0]?.width ?? 0;
    });
  };
}

// 同一個物件（文件裡的物件不可變）、同樣的文字與寬度只換一次行：每次重畫都會呼叫
const layoutCache = new WeakMap<object, { readonly text: string; readonly width: number; readonly layout: IndentedLayout }>();
const linesCache = new WeakMap<object, { readonly text: string; readonly width: number; readonly lines: readonly string[] }>();

/**
 * Lines of text without indents as the canvas wraps them (fonts must be loaded).
 *
 * Args:
 *   style: Text element, shape label (as a text) or style with its text.
 *   width: Width (pt) of the text box.
 *
 * Returns:
 *   Every line, paragraphs in order.
 */
export function wrappedTextLines(style: WrappedText, width: number): readonly string[] {
  const cached = linesCache.get(style);
  if (cached && cached.text === style.text && cached.width === width) return cached.lines;
  const wrap = konvaWrap(style);
  const lines = style.text.split("\n").flatMap((paragraph) => wrap(paragraph, width));
  linesCache.set(style, { text: style.text, width, lines });
  return lines;
}

/**
 * Lines of indented text as the canvas wraps them (fonts must be loaded).
 *
 * Args:
 *   style: Text element, shape label (as a text) or style with its text.
 *   width: Width (pt) of the text box.
 *
 * Returns:
 *   Every line with its box (`layoutIndentedText`).
 */
export function indentedTextLayout(style: WrappedText, width: number): IndentedLayout {
  const cached = layoutCache.get(style);
  if (cached && cached.text === style.text && cached.width === width) return cached.layout;
  const layout = layoutIndentedText(style.text, konvaWrap(style), width, style.fontSize, style);
  layoutCache.set(style, { text: style.text, width, layout });
  return layout;
}

/** Custom attributes of an indented Konva text, read by the scene functions. */
interface IndentAttrs {
  /** Box of each line (`textArr` order). */
  readonly lineBoxes: readonly LineBox[];
  /** The text's own alignment (the node itself is left aligned). */
  readonly indentAlign: TextAlign;
}

/**
 * Box of each line of a Konva text drawn by these functions; undefined without indents.
 *
 * Args:
 *   node: Konva text.
 *
 * Returns:
 *   The boxes, in `textArr` order.
 */
export function lineBoxesOf(node: Konva.Text): readonly LineBox[] | undefined {
  return node.getAttr("lineBoxes") as IndentAttrs["lineBoxes"] | undefined;
}

/** Konva draws a text's lines through this (`Text._sceneFunc`, not in the typings). */
interface KonvaTextScene {
  _sceneFunc(context: Context): void;
}

/**
 * Konva `sceneFunc` of indented text (not distributed): each line moved to its own start
 * (`alignedLineStart`), then drawn by Konva itself with only that line in `textArr`.
 *
 * Args:
 *   context: Konva scene context (the shadow is already applied by Konva).
 *   shape: The Konva text being drawn.
 */
export function drawIndentedText(context: Context, shape: Konva.Shape): void {
  const node = shape as Konva.Text;
  const boxes = lineBoxesOf(node) ?? [];
  const align = (node.getAttr("indentAlign") as TextAlign | undefined) ?? "left";
  const lineHeight = node.fontSize() * node.lineHeight();
  const draw = (Konva.Text.prototype as unknown as KonvaTextScene)._sceneFunc;
  const lines = node.textArr;
  try {
    lines.forEach((line, index) => {
      const box = boxes[index] ?? { start: 0, width: node.width() };
      context.save();
      context.translate(alignedLineStart(line.width, box, align), index * lineHeight);
      node.textArr = [line];
      draw.call(node, context);
      context.restore();
    });
  } finally {
    node.textArr = lines;
  }
}

/**
 * Attributes that make a Konva text draw our line breaks (avoiding punctuation at line starts and
 * ends) and paragraph indents: the text wrapped beforehand, no wrapping of its own, each indented
 * line drawn at its start. Without indents Konva still aligns the lines (and `konvaAlignAttrs`
 * draws distributed ones); spread them after `konvaAlignAttrs` so they win.
 *
 * Args:
 *   style: Text element or shape label (as a text) with its text.
 *   width: Width (pt) of the text box (the node's width).
 *
 * Returns:
 *   Attributes to spread onto a Konva `Text`.
 */
export function indentAttrs(style: WrappedText, width: number) {
  if (!hasTextIndent(style)) {
    return { text: wrappedTextLines(style, width).join("\n"), wrap: "none", lineBoxes: undefined, indentAlign: undefined };
  }
  const layout = indentedTextLayout(style, width);
  const boxes = layout.lines.map((_, index) => ({ start: layout.lineStarts[index], width: layout.lineBoxWidths[index] }));
  return {
    text: layout.lines.join("\n"),
    wrap: "none",
    align: "left",
    lineBoxes: boxes,
    indentAlign: style.align,
    sceneFunc: style.align === "distributed" ? drawDistributedText : drawIndentedText,
  };
}
