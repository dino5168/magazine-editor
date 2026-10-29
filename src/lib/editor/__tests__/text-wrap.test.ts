import { describe, expect, it } from "vitest";
import { canBreakBefore, isCjk, wrapParagraph, wrapText } from "../text-wrap";

/** CJK characters are 10 pt wide, everything else (Latin, digits, spaces) 5 pt. */
function measure(text: string): number {
  return Array.from(text).reduce((width, char) => width + (isCjk(char) ? 10 : 5), 0);
}

const wrap = (text: string, width: number) => wrapParagraph(text, width, measure);

describe("canBreakBefore", () => {
  const at = (text: string, index: number) => canBreakBefore(Array.from(text), index);

  it("breaks between CJK characters and next to them", () => {
    expect(at("中文", 1)).toBe(true);
    expect(at("中a", 1)).toBe(true);
    expect(at("a中", 1)).toBe(true);
  });

  it("keeps Latin words and numbers together", () => {
    expect(at("ab", 1)).toBe(false);
    expect(at("12", 1)).toBe(false);
    expect(at("3.14", 2)).toBe(false);
  });

  it("breaks at spaces and after hyphens", () => {
    expect(at("a b", 1)).toBe(true);
    expect(at("a b", 2)).toBe(true);
    expect(at("a-b", 2)).toBe(true);
    expect(at("a-b", 1)).toBe(false);
  });

  it("never starts a line with closing punctuation", () => {
    for (const mark of ["，", "。", "、", "」", "』", "）", "？", "！", "：", "；", "”", ",", ".", ")"]) {
      expect(at(`中${mark}`, 1), mark).toBe(false);
    }
  });

  it("never ends a line with opening punctuation", () => {
    for (const mark of ["「", "『", "（", "《", "“", "("]) {
      expect(at(`${mark}中`, 1), mark).toBe(false);
    }
  });

  it("keeps ellipses and dashes in one piece", () => {
    expect(at("……", 1)).toBe(false);
    expect(at("——", 1)).toBe(false);
    // 刪節號不放行首，之後可以斷
    expect(at("中……", 1)).toBe(false);
    expect(at("……中", 2)).toBe(true);
  });
});

describe("wrapParagraph", () => {
  it("keeps text that fits on one line", () => {
    expect(wrap("中文字", 30)).toEqual(["中文字"]);
    expect(wrap("", 30)).toEqual([""]);
  });

  it("breaks Chinese between any two characters", () => {
    expect(wrap("一二三四五六七", 30)).toEqual(["一二三", "四五六", "七"]);
  });

  it("pushes the character before a closing mark to the next line", () => {
    // 框寬 3 字：「，」不放行首，帶著「三」一起到下一行
    expect(wrap("一二三，四五", 30)).toEqual(["一二", "三，四", "五"]);
    expect(wrap("一二三」。四", 30)).toEqual(["一二", "三」。", "四"]);
  });

  it("moves an opening mark at the end of a line to the next line", () => {
    expect(wrap("一二「三」四", 30)).toEqual(["一二", "「三」", "四"]);
  });

  it("does not fall back to an earlier space in mixed text", () => {
    // Konva 會退回「a」後的空白，把整串中文推到下一行
    expect(wrap("a 一二三四五", 40)).toEqual(["a 一二三", "四五"]);
  });

  it("wraps Latin text at spaces and drops the spaces at the break", () => {
    expect(wrap("ab cd ef", 25)).toEqual(["ab cd", "ef"]);
    expect(wrap("ab   cd", 15)).toEqual(["ab", "cd"]);
  });

  it("lets trailing spaces overhang the line", () => {
    expect(wrap("abc d", 15)).toEqual(["abc", "d"]);
  });

  it("forces a break inside a word longer than the line", () => {
    expect(wrap("abcdefg", 15)).toEqual(["abc", "def", "g"]);
  });

  it("forces a break when no allowed break fits", () => {
    expect(wrap("「「「「", 20)).toEqual(["「「", "「「"]);
  });

  it("puts at least one character on each line", () => {
    expect(wrap("一二", 5)).toEqual(["一", "二"]);
  });

  it("keeps a Latin word before Chinese punctuation together with it", () => {
    expect(wrap("一二 word，", 50)).toEqual(["一二", "word，"]);
  });
});

describe("wrapText", () => {
  it("wraps each paragraph on its own and keeps empty ones", () => {
    expect(wrapText("一二三四\n\n五", 30, measure)).toEqual(["一二三", "四", "", "五"]);
  });
});
