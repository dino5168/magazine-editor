/**
 * 首尾置中（分散對齊，`align: "distributed"`）：每一行的第一個字貼齊文字框左緣、最後一個字貼齊右緣，
 * 字與字之間平分剩下的空間。換行照靠左（Konva 決定），這裡只決定每一行裡每個字的位置；
 * 畫布的繪製與匯出的量測（`measureTextLayout`）共用，PDF / EPUB 拿到的數字和畫布畫的相同。
 */

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * Splits text into the characters the canvas draws one by one (grapheme clusters, like Konva and
 * Typst `clusters()`: an emoji with a skin tone, or a letter with a combining accent, is one).
 *
 * Args:
 *   text: One line of text.
 *
 * Returns:
 *   The characters, in order.
 */
export function splitGraphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), (part) => part.segment);
}

/** Where one line's characters go when distributed across the box. */
export interface DistributedLine {
  /** Characters to draw (trailing white space dropped). */
  readonly chars: readonly string[];
  /** Left edge of each character (pt from the box's left edge). */
  readonly xs: readonly number[];
  /** From the first character's left edge to the last one's right edge: the box width with two or more characters. */
  readonly width: number;
  /**
   * Distance (pt) between one character's right edge and the next one's left edge; 0 with fewer
   * than two characters. Letter spacing is already in it (it only changes where lines wrap).
   */
  readonly gap: number;
}

/**
 * Positions of one line's characters, distributed across the box. With two or more characters the
 * first touches the left edge and the last the right edge; a single character is centred. The
 * gap is negative when the characters are wider than the box (they then overlap to fit).
 *
 * Args:
 *   chars: Characters of the line (`splitGraphemes`).
 *   widths: Width (pt) of each character measured alone, as the canvas draws them.
 *   boxWidth: Width (pt) of the text box.
 *
 * Returns:
 *   Character positions, the line's drawn width and the gap.
 */
export function distributeLine(chars: readonly string[], widths: readonly number[], boxWidth: number): DistributedLine {
  // 行尾的空白不算（Word 的分散對齊也忽略行尾空白），最後一個看得到的字才會貼齊右緣
  let count = chars.length;
  while (count > 0 && chars[count - 1].trim() === "") count--;
  const kept = chars.slice(0, count);
  const keptWidths = widths.slice(0, count);
  const total = keptWidths.reduce((sum, width) => sum + width, 0);
  if (count === 0) return { chars: kept, xs: [], width: 0, gap: 0 };
  if (count === 1) return { chars: kept, xs: [(boxWidth - total) / 2], width: total, gap: 0 };
  const gap = (boxWidth - total) / (count - 1);
  const xs: number[] = [];
  let x = 0;
  for (const width of keptWidths) {
    xs.push(x);
    x += width + gap;
  }
  return { chars: kept, xs, width: boxWidth, gap };
}

/**
 * Distributes one line of text, measuring each character with `measure`.
 *
 * Args:
 *   line: One wrapped line.
 *   measure: Width (pt) of one character drawn alone in the text's font.
 *   boxWidth: Width (pt) of the text box.
 *
 * Returns:
 *   Character positions, the line's drawn width and the gap.
 */
export function distributeText(line: string, measure: (char: string) => number, boxWidth: number): DistributedLine {
  const chars = splitGraphemes(line);
  return distributeLine(chars, chars.map(measure), boxWidth);
}
