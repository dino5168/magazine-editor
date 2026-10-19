import type Konva from "konva";
import type { Context } from "konva/lib/Context";
import { konvaAlign } from "./text-style";
import { distributeText, type DistributedLine } from "./text-distribute";
import type { LineBox } from "./text-indent";
import type { TextAlign } from "./types";

/**
 * 首尾置中（`align: "distributed"`）在 Konva 上的繪製。換行、命中區、陰影都照 Konva `Text`，
 * 只把繪製函式（`sceneFunc`）換成逐字放在 `distributeText` 算好的位置。
 * 依賴 Konva 10.5.0 `Text._sceneFunc` 的行為（非 legacy 模式的基線、底線 / 刪除線的公式、
 * `_partialText` 逐字填色）：升級 Konva 時重查（見計畫 `13-文字對齊加入首尾置中-實作.md` 步驟 1）。
 */

// 逐字量寬：同一個字型的同一個字只量一次（每次重畫都要量）
const widthCache = new Map<string, number>();
const WIDTH_CACHE_MAX = 20000;

function charWidth(node: Konva.Text, char: string): number {
  const key = `${node.fontStyle()}|${node.fontVariant()}|${node.fontSize()}|${node.fontFamily()}|${char}`;
  let width = widthCache.get(key);
  if (width === undefined) {
    if (widthCache.size >= WIDTH_CACHE_MAX) widthCache.clear();
    // measureSize 和 Konva 有字距時逐字畫用的是同一個字型字串（步驟 1 實測：位置一致）
    width = node.measureSize(char).width;
    widthCache.set(key, width);
  }
  return width;
}

/**
 * Where the characters of every wrapped line of a distributed Konva text go.
 *
 * Args:
 *   node: Konva text laid out with the text's width and style (`align` left).
 *
 * Returns:
 *   One entry per line of `node.textArr`.
 */
export function distributedTextLines(node: Konva.Text): DistributedLine[] {
  const width = node.width();
  // 有段落縮排時每行在自己的行框裡分散（indentAttrs 設的 lineBoxes），沒有時是整個文字框
  const boxes = node.getAttr("lineBoxes") as readonly LineBox[] | undefined;
  return node.textArr.map((line, index) => {
    const box = boxes?.[index] ?? { start: 0, width };
    const distributed = distributeText(line.text, (char) => charWidth(node, char), box.width);
    return box.start === 0 ? distributed : { ...distributed, xs: distributed.xs.map((x) => x + box.start) };
  });
}

/**
 * Distance from the text's top to the first line's baseline, as Konva places it (non-legacy text
 * rendering); `measureTextLayout` uses it too, so the export gets the same baseline.
 *
 * Args:
 *   node: Konva text.
 *
 * Returns:
 *   Baseline offset in pt.
 */
export function firstBaseline(node: Konva.Text): number {
  const metrics = node.measureSize("M");
  const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
  const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
  return (ascent - descent) / 2 + (node.fontSize() * node.lineHeight()) / 2;
}

/** Konva draws one character at a time through these (`Text._fillFunc`). */
interface PartialText {
  _partialText: string;
  _partialTextX: number;
  _partialTextY: number;
}

function drawLine(context: Context, node: Konva.Text, fromX: number, y: number, length: number) {
  context.save();
  context.beginPath();
  context.moveTo(fromX, y);
  context.lineTo(fromX + length, y);
  context.lineWidth = node.fontSize() / 15;
  context.strokeStyle = node.fill() as string;
  context.stroke();
  context.restore();
}

/**
 * Konva `sceneFunc` of distributed text: each line from the box's left edge to its right edge.
 * Underline before the line's characters and strikethrough after them, at Konva's offsets
 * (baseline ± round(size / 4), size / 15 thick), spanning the drawn line.
 *
 * Args:
 *   context: Konva scene context (the shadow is already applied by Konva).
 *   shape: The Konva text being drawn.
 */
export function drawDistributedText(context: Context, shape: Konva.Shape): void {
  const node = shape as Konva.Text;
  const fontSize = node.fontSize();
  const lineHeight = fontSize * node.lineHeight();
  const decoration = node.textDecoration();
  const underline = decoration.includes("underline");
  const strikethrough = decoration.includes("line-through");
  const offset = Math.round(fontSize / 4);
  const baseline = firstBaseline(node);
  const partial = node as unknown as PartialText;

  context.setAttr("font", node._getContextFont());
  context.setAttr("textBaseline", "alphabetic");
  context.setAttr("textAlign", "left");
  distributedTextLines(node).forEach((line, index) => {
    if (line.chars.length === 0) return;
    const y = baseline + index * lineHeight;
    const start = line.xs[0];
    if (underline) drawLine(context, node, start, y + offset, Math.round(line.width));
    line.chars.forEach((char, i) => {
      partial._partialText = char;
      partial._partialTextX = line.xs[i];
      partial._partialTextY = y;
      context.fillStrokeShape(node);
    });
    if (strikethrough) drawLine(context, node, start, y - offset, Math.round(line.width));
  });
}

/**
 * Alignment attributes of a Konva text: distributed text wraps like left-aligned text and is drawn
 * by `drawDistributedText`.
 *
 * Args:
 *   align: Alignment of the text.
 *
 * Returns:
 *   Attributes to spread onto a Konva `Text`.
 */
export function konvaAlignAttrs(align: TextAlign) {
  return { align: konvaAlign(align), sceneFunc: align === "distributed" ? drawDistributedText : undefined };
}
