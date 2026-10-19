/**
 * 段落縮排（左縮排 / 右縮排 / 首行縮排，首行可負 = 首行突排）：每個 `\n` 開始一段，每段第一行的
 * 左緣 = 左縮排 + 首行縮排、其他行 = 左縮排，右緣 = 框寬 − 右縮排。單位是「字」（字級的倍數）。
 *
 * Konva 只能用一個寬度換整段，所以每段換兩次：第一行用首行的寬度，剩下的文字（去掉行首空白，
 * 和 Konva 自己接著換的方式相同）用其他行的寬度。換行規則仍是 Konva 的（由呼叫端注入 `wrap`），
 * 這裡只決定每一行的文字、起點與寬度；畫布與匯出的量測共用同一份結果。
 * 計畫與實測：`docs/07-Plans-物件屬性與事件/01-新增文字框屬性-實作.md`。
 */
import type { TextAlign, TextStyle } from "./types";

/** Paragraph indents of a text style, in multiples of the font size (「字」). */
export type TextIndent = Pick<TextStyle, "indentLeft" | "indentRight" | "indentFirstLine">;

/** No indent: new text, page numbers and files before v16. */
export const NO_TEXT_INDENT: TextIndent = { indentLeft: 0, indentRight: 0, indentFirstLine: 0 };

/** Largest indent (字); the first line ranges from −indentLeft to this. */
export const TEXT_INDENT_MAX = 20;

/**
 * Whether any indent is set (text without one keeps Konva's own wrapping and drawing).
 *
 * Args:
 *   indent: Indents of a text.
 *
 * Returns:
 *   True when an indent is not 0.
 */
export function hasTextIndent(indent: TextIndent): boolean {
  return indent.indentLeft !== 0 || indent.indentRight !== 0 || indent.indentFirstLine !== 0;
}

/**
 * Whether the indent fields of a style are valid: finite, left / right 0–`TEXT_INDENT_MAX`, the
 * first line from −left (not further left than the box) to `TEXT_INDENT_MAX`.
 *
 * Args:
 *   style: Candidate style (a label, a text style, a text element...).
 *
 * Returns:
 *   True when all three fields are valid.
 */
export function hasValidTextIndent(style: object): boolean {
  const { indentLeft: left, indentRight: right, indentFirstLine: first } = style as Record<string, unknown>;
  return (
    isIndentLength(left) &&
    isIndentLength(right) &&
    typeof first === "number" &&
    Number.isFinite(first) &&
    first >= -left &&
    first <= TEXT_INDENT_MAX
  );
}

function isIndentLength(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= TEXT_INDENT_MAX;
}

/**
 * Indents typed in the property panel: each limited to its range, rounded to 0.01 字. The first
 * line is limited after the left indent, so it never ends up left of the box.
 *
 * Args:
 *   indent: Typed indents (may be out of range).
 *
 * Returns:
 *   Valid indents.
 */
export function clampTextIndent(indent: TextIndent): TextIndent {
  // + 0：−0 寫成 0（−0 存進 JSON 是 0，但比對覆寫時 Object.is 會當成不同）
  const round = (value: number) => Math.round(value * 100) / 100 + 0;
  const limit = (value: number, min: number) => round(Math.min(TEXT_INDENT_MAX, Math.max(min, value)));
  const indentLeft = limit(indent.indentLeft, 0);
  return { indentLeft, indentRight: limit(indent.indentRight, 0), indentFirstLine: limit(indent.indentFirstLine, -indentLeft) };
}

/** 屬性面板的「指定方式」（Word 的段落對話框）：無 / 首行縮排 / 首行突排。 */
export type FirstLineMode = "none" | "indent" | "hanging";

/**
 * Indents as the property panel shows them (Word's paragraph dialog): `left` is where the leftmost
 * line starts, `by` how far the first line (首行縮排) or the other lines (首行突排) move in from it.
 */
export interface IndentFields {
  readonly left: number;
  readonly right: number;
  readonly mode: FirstLineMode;
  /** 0 when `mode` is `none`. */
  readonly by: number;
}

/** 位移 set when 指定方式 changes from 無: two characters, as in Word. */
export const DEFAULT_FIRST_LINE_BY = 2;

/**
 * The property panel's view of stored indents.
 *
 * Args:
 *   indent: Stored indents (valid: first line ≥ −left).
 *
 * Returns:
 *   左 / 右 / 指定方式 / 位移.
 */
export function indentFields(indent: TextIndent): IndentFields {
  const { indentLeft, indentRight, indentFirstLine } = indent;
  if (indentFirstLine < 0) {
    // 首行突排：首行在最左邊，其他行再往內 by
    return { left: indentLeft + indentFirstLine, right: indentRight, mode: "hanging", by: -indentFirstLine };
  }
  return { left: indentLeft, right: indentRight, mode: indentFirstLine > 0 ? "indent" : "none", by: indentFirstLine };
}

/**
 * Stored indents from the property panel's fields, limited to the valid range (`clampTextIndent`).
 *
 * Args:
 *   fields: 左 / 右 / 指定方式 / 位移 (may be out of range).
 *
 * Returns:
 *   Valid stored indents.
 */
export function indentFromFields(fields: IndentFields): TextIndent {
  const left = Math.max(0, fields.left);
  const by = fields.mode === "none" ? 0 : Math.max(0, fields.by);
  const indent =
    fields.mode === "hanging"
      ? { indentLeft: left + by, indentRight: fields.right, indentFirstLine: -by }
      : { indentLeft: left, indentRight: fields.right, indentFirstLine: by };
  return clampTextIndent(indent);
}

/**
 * Changes 指定方式, keeping 左 and 位移 (無 → 首行縮排 / 突排 starts at `DEFAULT_FIRST_LINE_BY`).
 *
 * Args:
 *   indent: Stored indents.
 *   mode: New 指定方式.
 *
 * Returns:
 *   Stored indents.
 */
export function withFirstLineMode(indent: TextIndent, mode: FirstLineMode): TextIndent {
  const fields = indentFields(indent);
  const by = fields.mode === "none" ? DEFAULT_FIRST_LINE_BY : fields.by;
  return indentFromFields({ ...fields, mode, by });
}

/** Where a line may go: from `start` (pt from the box's left edge), `width` pt wide. */
export interface LineBox {
  readonly start: number;
  readonly width: number;
}

/**
 * The room for a paragraph's first or following lines. A line keeps at least one font size of
 * width (or the whole box when that is narrower): when the indents leave less, the line keeps
 * that width and moves left, so it stays inside the box (the right indent gives way first).
 *
 * Args:
 *   boxWidth: Width (pt) of the text box.
 *   fontSize: Font size (pt); indents are multiples of it.
 *   indent: Indents of the text.
 *   firstLine: Whether this is the first line of a paragraph.
 *
 * Returns:
 *   Start and width of the line box (pt).
 */
export function indentedLineBox(boxWidth: number, fontSize: number, indent: TextIndent, firstLine: boolean): LineBox {
  const start = (indent.indentLeft + (firstLine ? indent.indentFirstLine : 0)) * fontSize;
  const right = indent.indentRight * fontSize;
  const width = Math.max(boxWidth - start - right, Math.min(fontSize, boxWidth));
  return { start: Math.min(start, Math.max(0, boxWidth - width)), width };
}

/** Wrapped lines of indented text. */
export interface IndentedLayout {
  readonly lines: readonly string[];
  /** Left edge (pt from the box's left edge) of each line's box. */
  readonly lineStarts: readonly number[];
  /** Width (pt) of each line's box. */
  readonly lineBoxWidths: readonly number[];
  /** Whether each line starts a paragraph. */
  readonly firstInParagraph: readonly boolean[];
}

/**
 * Wraps text with paragraph indents, line breaks decided by `wrap` (Konva on the canvas).
 *
 * Args:
 *   text: Text of the element (paragraphs separated by `\n`).
 *   wrap: Wraps one paragraph (no `\n`) at a width (pt), as Konva does; returns at least one line.
 *   boxWidth: Width (pt) of the text box.
 *   fontSize: Font size (pt).
 *   indent: Indents of the text.
 *
 * Returns:
 *   Every line with its box.
 */
export function layoutIndentedText(
  text: string,
  wrap: (paragraph: string, width: number) => readonly string[],
  boxWidth: number,
  fontSize: number,
  indent: TextIndent,
): IndentedLayout {
  const first = indentedLineBox(boxWidth, fontSize, indent, true);
  const rest = indentedLineBox(boxWidth, fontSize, indent, false);
  const lines: string[] = [];
  const lineStarts: number[] = [];
  const lineBoxWidths: number[] = [];
  const firstInParagraph: boolean[] = [];
  const push = (line: string, box: LineBox, starts: boolean) => {
    lines.push(line);
    lineStarts.push(box.start);
    lineBoxWidths.push(box.width);
    firstInParagraph.push(starts);
  };
  for (const paragraph of text.split("\n")) {
    const firstLines = wrap(paragraph, first.width);
    const head = firstLines[0] ?? "";
    push(head, first, true);
    if (firstLines.length < 2) continue;
    if (first.width === rest.width || !paragraph.startsWith(head)) {
      // 寬度一樣時第一次換的結果就是答案；第一行不是段落的前綴（Konva 不會這樣）時也照用
      for (const line of firstLines.slice(1)) push(line, rest, false);
      continue;
    }
    // Konva 接著換下一行時會去掉換行處的空白（步驟 1 實測 156 / 156 相同）
    const remainder = paragraph.slice(head.length).trimStart();
    if (remainder === "") continue;
    for (const line of wrap(remainder, rest.width)) push(line, rest, false);
  }
  return { lines, lineStarts, lineBoxWidths, firstInParagraph };
}

/**
 * Where a drawn line starts in the text box: its box's start plus the alignment within the box
 * (same as `line_start` in Rust `render.rs`, which adds the box start sent by the editor).
 *
 * Args:
 *   lineWidth: Drawn width (pt) of the line (Konva's line width; for distributed text the drawn width).
 *   box: The line's box.
 *   align: Alignment of the text.
 *
 * Returns:
 *   x (pt) from the box's left edge.
 */
export function alignedLineStart(lineWidth: number, box: LineBox, align: TextAlign): number {
  switch (align) {
    case "left":
      return box.start;
    case "right":
      return box.start + box.width - lineWidth;
    case "center":
    // 首尾置中的行寬是畫出來的寬：兩字以上 = 行框寬（起點 = 行框起點），單字置中
    case "distributed":
      return box.start + (box.width - lineWidth) / 2;
  }
}
