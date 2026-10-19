import { describe, expect, it } from "vitest";
import {
  DEFAULT_FIRST_LINE_BY,
  NO_TEXT_INDENT,
  alignedLineStart,
  clampTextIndent,
  hasTextIndent,
  hasValidTextIndent,
  indentFields,
  indentFromFields,
  indentedLineBox,
  layoutIndentedText,
  withFirstLineMode,
  type TextIndent,
} from "../text-indent";

const CHAR = 10;

/**
 * Wraps like Konva's word wrapping with every character 10 pt wide: as many characters as fit, back
 * to the last space when the next character is not one, trailing spaces dropped, the next line
 * without its leading spaces.
 */
function fakeWrap(paragraph: string, width: number): string[] {
  const fit = Math.max(1, Math.floor(width / CHAR));
  const lines: string[] = [];
  let rest = paragraph;
  while (rest.length > fit) {
    let end = fit;
    if (rest[end] !== " ") {
      const space = rest.lastIndexOf(" ", end - 1);
      if (space > 0) end = space + 1;
    }
    lines.push(rest.slice(0, end).trimEnd());
    rest = rest.slice(end).trimStart();
  }
  lines.push(rest);
  return lines;
}

const indent = (indentLeft: number, indentFirstLine: number, indentRight = 0): TextIndent => ({ indentLeft, indentRight, indentFirstLine });

describe("layoutIndentedText", () => {
  it("wraps every paragraph like Konva when there is no indent", () => {
    const text = "aaaa bbbb cccc dddd\nee ff gg hh ii jj";
    const layout = layoutIndentedText(text, fakeWrap, 100, CHAR, NO_TEXT_INDENT);
    expect(layout.lines).toEqual(text.split("\n").flatMap((paragraph) => fakeWrap(paragraph, 100)));
    expect(new Set(layout.lineStarts)).toEqual(new Set([0]));
    expect(new Set(layout.lineBoxWidths)).toEqual(new Set([100]));
    expect(layout.firstInParagraph).toEqual([true, false, true, false]);
  });

  it("indents the first line of every paragraph", () => {
    // 首行縮排兩字：第一行 80 pt 放 8 個字，其他行 100 pt 放 10 個字
    const layout = layoutIndentedText("一二三四五六七八九十一二三四五六七八九十\n甲乙", fakeWrap, 100, CHAR, indent(0, 2));
    expect(layout.lines).toEqual(["一二三四五六七八", "九十一二三四五六七八", "九十", "甲乙"]);
    expect(layout.lineStarts).toEqual([20, 0, 0, 20]);
    expect(layout.lineBoxWidths).toEqual([80, 100, 100, 80]);
    expect(layout.firstInParagraph).toEqual([true, false, false, true]);
  });

  it("hangs the first line out of the following ones", () => {
    // 首行突排兩字 = 左縮排 2、首行 −2
    const layout = layoutIndentedText("1. aaaa bbb ccc dddd", fakeWrap, 100, CHAR, indent(2, -2));
    expect(layout.lines).toEqual(["1. aaaa", "bbb ccc", "dddd"]);
    expect(layout.lineStarts).toEqual([0, 20, 20]);
    expect(layout.lineBoxWidths).toEqual([100, 80, 80]);
  });

  it("matches wrapping the whole paragraph when the widths are equal", () => {
    // 首行 + 左縮排與其他行同寬（右縮排）：第一次換的結果就是答案
    const text = "aaaa bbbb cccc dddd eeee";
    const layout = layoutIndentedText(text, fakeWrap, 100, CHAR, indent(1, 0, 2));
    expect(layout.lines).toEqual(fakeWrap(text, 70));
    expect(new Set(layout.lineStarts)).toEqual(new Set([10]));
  });

  it("drops the spaces where the first line wraps, like Konva", () => {
    const layout = layoutIndentedText("aaaaaaaa    bbbb", fakeWrap, 100, CHAR, indent(0, 2));
    expect(layout.lines).toEqual(["aaaaaaaa", "bbbb"]);
    // 只剩空白時不多一行
    expect(layoutIndentedText("aaaaaaaa      ", fakeWrap, 100, CHAR, indent(0, 2)).lines).toEqual(["aaaaaaaa"]);
  });

  it("keeps empty paragraphs as empty lines", () => {
    const layout = layoutIndentedText("a\n\nb", fakeWrap, 100, CHAR, indent(1, 1));
    expect(layout.lines).toEqual(["a", "", "b"]);
    expect(layout.firstInParagraph).toEqual([true, true, true]);
    expect(layoutIndentedText("", fakeWrap, 100, CHAR, indent(1, 1)).lines).toEqual([""]);
  });
});

describe("indentedLineBox", () => {
  it("places the first and the following lines", () => {
    expect(indentedLineBox(100, 10, indent(2, 1, 3), true)).toEqual({ start: 30, width: 40 });
    expect(indentedLineBox(100, 10, indent(2, 1, 3), false)).toEqual({ start: 20, width: 50 });
    expect(indentedLineBox(100, 10, indent(2, -2), true)).toEqual({ start: 0, width: 100 });
  });

  it("keeps at least one font size inside the box when the indents leave less", () => {
    // 左 8 字 + 右 4 字 > 框寬 100：寬度留一個字級，往左移到框內
    expect(indentedLineBox(100, 10, indent(8, 0, 4), false)).toEqual({ start: 80, width: 10 });
    expect(indentedLineBox(100, 10, indent(20, 0), false)).toEqual({ start: 90, width: 10 });
    // 框比一個字級還窄：整個框
    expect(indentedLineBox(6, 10, indent(1, 0), false)).toEqual({ start: 0, width: 6 });
  });
});

describe("alignedLineStart", () => {
  const box = { start: 20, width: 80 };
  it("aligns within the line's box", () => {
    expect(alignedLineStart(30, box, "left")).toBe(20);
    expect(alignedLineStart(30, box, "center")).toBe(45);
    expect(alignedLineStart(30, box, "right")).toBe(70);
    // 首尾置中：兩字以上行寬 = 行框寬、單字置中
    expect(alignedLineStart(80, box, "distributed")).toBe(20);
    expect(alignedLineStart(10, box, "distributed")).toBe(55);
  });
});

describe("indent fields (Word's paragraph dialog)", () => {
  it("shows the leftmost line as 左 and the first line's offset as 位移", () => {
    expect(indentFields(NO_TEXT_INDENT)).toEqual({ left: 0, right: 0, mode: "none", by: 0 });
    expect(indentFields(indent(1, 2, 0.5))).toEqual({ left: 1, right: 0.5, mode: "indent", by: 2 });
    // 首行突排兩字（左 2、首行 −2）：首行在 0，其他行往內 2
    expect(indentFields(indent(2, -2))).toEqual({ left: 0, right: 0, mode: "hanging", by: 2 });
    expect(indentFields(indent(3, -2))).toEqual({ left: 1, right: 0, mode: "hanging", by: 2 });
  });

  it("stores the fields back, never left of the box", () => {
    for (const stored of [NO_TEXT_INDENT, indent(1, 2, 0.5), indent(2, -2), indent(3, -2, 1)]) {
      expect(indentFromFields(indentFields(stored))).toEqual(stored);
    }
    expect(indentFromFields({ left: 1, right: 0, mode: "hanging", by: 2 })).toEqual(indent(3, -2));
    // 無：位移不算
    expect(indentFromFields({ left: 1, right: 0, mode: "none", by: 2 })).toEqual(indent(1, 0));
    // 負的輸入夾成 0；左 + 位移超過上限時左縮排夾在 20，首行仍不超出框
    expect(indentFromFields({ left: -1, right: -1, mode: "indent", by: -3 })).toEqual(NO_TEXT_INDENT);
    expect(indentFromFields({ left: 15, right: 0, mode: "hanging", by: 10 })).toEqual(indent(20, -10));
  });

  it("changes 指定方式 keeping 左 and 位移", () => {
    expect(withFirstLineMode(NO_TEXT_INDENT, "indent")).toEqual(indent(0, DEFAULT_FIRST_LINE_BY));
    expect(withFirstLineMode(indent(1, 0), "hanging")).toEqual(indent(1 + DEFAULT_FIRST_LINE_BY, -DEFAULT_FIRST_LINE_BY));
    expect(withFirstLineMode(indent(1, 3), "hanging")).toEqual(indent(4, -3));
    expect(withFirstLineMode(indent(4, -3), "indent")).toEqual(indent(1, 3));
    expect(withFirstLineMode(indent(4, -3), "none")).toEqual(indent(1, 0));
  });
});

describe("indent values", () => {
  it("tells whether any indent is set", () => {
    expect(hasTextIndent(NO_TEXT_INDENT)).toBe(false);
    expect(hasTextIndent(indent(0, 0, 1))).toBe(true);
    expect(hasTextIndent(indent(2, -2))).toBe(true);
  });

  it("validates the ranges", () => {
    expect(hasValidTextIndent({ ...NO_TEXT_INDENT })).toBe(true);
    expect(hasValidTextIndent({ ...indent(2, -2, 20) })).toBe(true);
    expect(hasValidTextIndent({ ...indent(2, -2.5) })).toBe(false);
    expect(hasValidTextIndent({ ...indent(-1, 0) })).toBe(false);
    expect(hasValidTextIndent({ ...indent(0, 0, 20.5) })).toBe(false);
    expect(hasValidTextIndent({ ...indent(0, Number.NaN) })).toBe(false);
    expect(hasValidTextIndent({ indentLeft: 0, indentRight: 0 })).toBe(false);
  });

  it("clamps typed values", () => {
    expect(clampTextIndent(indent(-3, -5, 25))).toEqual(indent(0, 0, 20));
    expect(clampTextIndent(indent(2, -5))).toEqual(indent(2, -2));
    expect(clampTextIndent(indent(1.234, 2.345))).toEqual(indent(1.23, 2.35));
  });
});
