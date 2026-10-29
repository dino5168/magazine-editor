/**
 * 換行與避頭點（計畫 `docs/05-Plans-字型/04-避頭點換行-實作.md`）。取代 Konva 的 `wrap: "word"`：
 * 中日韓字元之間都可以斷，行首不放「，。」）」等、行尾不放「（「」等（放不下時把前面的字一起推到
 * 下一行，不懸掛），英文照 Konva 在空白與 `-` 處斷。量字由呼叫端注入（畫布用 Konva 量），
 * 這裡只有規則，畫布與匯出共用同一份結果。
 */

/** Characters that may not start a line (行首禁則). */
const NO_LINE_START = new Set(
  Array.from(
    "，。、；：？！）」』】〕〉》｝］〗〙…‥％‰℃°’”" +
      ",.;:!?)]}%" +
      "ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶー々ゝゞヽヾ",
  ),
);

/** Characters that may not end a line (行尾禁則). */
const NO_LINE_END = new Set(Array.from("（「『【〔〈《｛［〖〘‘“([{"));

/** Characters whose runs (`……`, `——`) are never split. */
const NO_SPLIT = new Set(["…", "‥", "—"]);

/** Punctuation outside the CJK blocks that Chinese text uses as full-width marks. */
const CJK_PUNCTUATION = new Set(Array.from("‘’“”…‥—·"));

function isSpace(char: string): boolean {
  return char === " " || char === "\t" || char === "　";
}

/**
 * Whether a character is CJK: ideographs, kana, hangul, CJK punctuation and full-width forms.
 *
 * Args:
 *   char: One code point.
 *
 * Returns:
 *   Whether a line may break next to it (subject to the line-start / line-end rules).
 */
export function isCjk(char: string): boolean {
  if (CJK_PUNCTUATION.has(char)) return true;
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x2e80 && code <= 0x9fff) || // 部首、CJK 標點、假名、注音、漢字
    (code >= 0xac00 && code <= 0xd7af) || // 諺文
    (code >= 0xf900 && code <= 0xfaff) || // 相容漢字
    (code >= 0xfe30 && code <= 0xfe4f) || // 相容形式（直排標點）
    (code >= 0xff00 && code <= 0xffef) || // 全形英數與標點
    (code >= 0x20000 && code <= 0x3ffff) // 擴充漢字
  );
}

/**
 * Whether a line may break between `chars[index - 1]` and `chars[index]`.
 *
 * Args:
 *   chars: The paragraph's code points.
 *   index: Position of the first character of the would-be next line (0 < index < length).
 *
 * Returns:
 *   Whether the break is allowed.
 */
export function canBreakBefore(chars: readonly string[], index: number): boolean {
  const before = chars[index - 1];
  const after = chars[index];
  // 空白留在行尾（換行時去掉），所以空白之前一定可以斷
  if (isSpace(after)) return true;
  if (NO_LINE_START.has(after) || NO_LINE_END.has(before)) return false;
  if (isSpace(before)) return true;
  if (before === after && NO_SPLIT.has(before)) return false;
  if (before === "-") return true;
  return isCjk(before) || isCjk(after);
}

/**
 * Wraps one paragraph (no `\n`) at a width: as much as fits, back to the nearest allowed break;
 * a forced break where nothing is allowed (a word longer than the line). Trailing spaces are
 * dropped from wrapped lines and leading spaces from the lines after them, as Konva does.
 *
 * Args:
 *   paragraph: Text without line breaks.
 *   width: Line width (pt).
 *   measure: Drawn width (pt) of a piece of text.
 *
 * Returns:
 *   The lines (at least one).
 */
export function wrapParagraph(paragraph: string, width: number, measure: (text: string) => number): string[] {
  const chars = Array.from(paragraph);
  const piece = (start: number, end: number) => chars.slice(start, end).join("");
  const fits = (start: number, end: number) => measure(piece(start, end).trimEnd()) <= width;
  const lines: string[] = [];
  let start = 0;
  for (;;) {
    if (fits(start, chars.length)) {
      lines.push(piece(start, chars.length));
      return lines;
    }
    // 放得下的最長前綴（至少一個字）
    let low = start + 1;
    let high = chars.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >>> 1;
      if (fits(start, mid)) low = mid;
      else high = mid - 1;
    }
    let end = low;
    while (end > start && !canBreakBefore(chars, end)) end--;
    if (end === start) end = low; // 沒有可斷點：硬斷
    lines.push(piece(start, end).trimEnd());
    start = end;
    while (start < chars.length && isSpace(chars[start])) start++;
    if (start === chars.length) return lines;
  }
}

/**
 * Wraps text paragraph by paragraph (`wrapParagraph`).
 *
 * Args:
 *   text: Text (paragraphs separated by `\n`).
 *   width: Line width (pt).
 *   measure: Drawn width (pt) of a piece of text.
 *
 * Returns:
 *   Every line, paragraphs in order.
 */
export function wrapText(text: string, width: number, measure: (text: string) => number): string[] {
  return text.split("\n").flatMap((paragraph) => wrapParagraph(paragraph, width, measure));
}
