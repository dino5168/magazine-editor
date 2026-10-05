import { describe, expect, it } from "vitest";
import { TEXT_LINE_HEIGHT } from "../geometry";
import {
  createPageNumberRule,
  describePageNumberRule,
  describePageRange,
  findPageNumberRule,
  nextPageNumberRange,
  pageNumberRuleError,
  isPageNumberRule,
  isPageNumberRules,
  pageNumberShape,
  pageNumberShapeId,
  pageNumberText,
  PAGE_NUMBER_FALLBACK_INSET_PT,
  rulesOverlap,
  sortPageNumberRules,
  withPageNumbers,
  type MeasureTextWidth,
} from "../page-numbers";
import { LABEL_PADDING_PT } from "../shape-label";
import type { Margins, Page, PageNumberPosition, PageNumberRule } from "../types";

// 假的量測：每個字寬 = 字級的一半
const measure: MeasureTextWidth = (text, style) => Array.from(text).length * style.fontSize * 0.5;

const page = (id: string): Page => ({ id, name: id, width: 600, height: 800, background: "#ffffff", elements: [] });
const margins: Margins = { top: 60, right: 50, bottom: 40, left: 30 };

function ruleAt(position: PageNumberPosition, from = 1, to = 10): PageNumberRule {
  const rule = createPageNumberRule("r", from, to);
  return { ...rule, odd: { ...rule.odd, position }, even: { ...rule.even, position } };
}

describe("findPageNumberRule / pageNumberText", () => {
  const front = createPageNumberRule("front", 1, 2);
  const body = { ...createPageNumberRule("body", 3, 6), start: 1 };

  it("finds the rule covering a page; pages outside every rule have none", () => {
    expect(findPageNumberRule([front, body], 0)).toBe(front);
    expect(findPageNumberRule([front, body], 2)).toBe(body);
    expect(findPageNumberRule([front, body], 5)).toBe(body);
    expect(findPageNumberRule([front, body], 6)).toBeNull();
  });

  it("counts from the start value and uses the odd / even prefix and suffix", () => {
    const rule: PageNumberRule = {
      ...body,
      odd: { position: "bottomRight", prefix: "第 ", suffix: " 頁" },
      even: { position: "bottomLeft", prefix: "- ", suffix: " -" },
    };
    expect(pageNumberText(rule, 2)).toBe("第 1 頁"); // 第 3 頁是奇數頁，顯示 1
    expect(pageNumberText(rule, 3)).toBe("- 2 -");
    expect(pageNumberText(createPageNumberRule("x", 1, 9), 4)).toBe("5");
  });

  it("puts every character on its own line at the middle positions", () => {
    const rule = { ...ruleAt("middleLeft", 1, 20), odd: { position: "middleLeft" as const, prefix: "第", suffix: "頁" } };
    expect(pageNumberText(rule, 11)).toBe("1\n2");
    expect(pageNumberText(rule, 10)).toBe("第\n1\n1\n頁");
  });
});

describe("pageNumberShape", () => {
  const fontSize = 10;
  const lineHeight = fontSize * TEXT_LINE_HEIGHT + 2 * LABEL_PADDING_PT;

  it("returns null for pages without a rule", () => {
    expect(pageNumberShape(page("p"), 0, [], margins, measure)).toBeNull();
  });

  it("builds a transparent box holding the number as its label", () => {
    const shape = pageNumberShape(page("p"), 0, [ruleAt("bottomCenter")], margins, measure)!;
    expect(shape.id).toBe(pageNumberShapeId("p"));
    expect(shape.fill).toBe("#00000000");
    expect(shape.stroke).toBeNull();
    expect(shape.rotation).toBe(0);
    expect(shape.label).toMatchObject({ text: "1", align: "center", verticalAlign: "middle", fontSize });
    expect(shape.height).toBeCloseTo(lineHeight);
    // 文字寬 5 + 防止換行的 1 pt + 兩側內距
    expect(shape.width).toBeCloseTo(5 + 1 + 2 * LABEL_PADDING_PT);
  });

  it("centres top / bottom numbers in the margin band and aligns their text with the content edge", () => {
    const at = (position: PageNumberPosition) => pageNumberShape(page("p"), 0, [ruleAt(position)], margins, measure)!;
    const topLeft = at("topLeft");
    expect(topLeft.y + topLeft.height / 2).toBeCloseTo(30); // 上邊界 60 的正中
    expect(topLeft.x + LABEL_PADDING_PT).toBeCloseTo(30); // 文字左緣 = 左邊界
    expect(topLeft.label?.align).toBe("left");

    const bottomRight = at("bottomRight");
    expect(bottomRight.y + bottomRight.height / 2).toBeCloseTo(800 - 20);
    expect(bottomRight.x + bottomRight.width - LABEL_PADDING_PT).toBeCloseTo(600 - 50); // 文字右緣 = 右邊界
    expect(bottomRight.label?.align).toBe("right");

    const topCenter = at("topCenter");
    expect(topCenter.x + topCenter.width / 2).toBeCloseTo(300);
  });

  it("writes middle numbers vertically, centred in the side margin band and on the page", () => {
    const rule = ruleAt("middleLeft", 1, 20);
    const left = pageNumberShape(page("p"), 11, [rule], { ...margins, left: 40 }, measure)!;
    expect(left.label).toMatchObject({ text: "1\n2", align: "center" });
    expect(left.height).toBeCloseTo(2 * fontSize * TEXT_LINE_HEIGHT + 2 * LABEL_PADDING_PT);
    expect(left.x + left.width / 2).toBeCloseTo(20);
    expect(left.y + left.height / 2).toBeCloseTo(400);

    const right = pageNumberShape(page("p"), 0, [ruleAt("middleRight")], { ...margins, right: 40 }, measure)!;
    expect(right.x + right.width / 2).toBeCloseTo(600 - 20);
  });

  it("falls back to 10 mm from the edge when the margin is 0 or too small", () => {
    const zero: Margins = { top: 0, right: 0, bottom: 0, left: 0 };
    const bottomLeft = pageNumberShape(page("p"), 0, [ruleAt("bottomLeft")], zero, measure)!;
    expect(bottomLeft.y + bottomLeft.height / 2).toBeCloseTo(800 - PAGE_NUMBER_FALLBACK_INSET_PT);
    expect(bottomLeft.x + LABEL_PADDING_PT).toBeCloseTo(PAGE_NUMBER_FALLBACK_INSET_PT);

    const tooSmall = pageNumberShape(page("p"), 0, [ruleAt("topCenter")], { ...zero, top: 5 }, measure)!;
    expect(tooSmall.y + tooSmall.height / 2).toBeCloseTo(PAGE_NUMBER_FALLBACK_INSET_PT);
  });

  it("uses the odd face on odd pages and the even face on even pages", () => {
    const rule = createPageNumberRule("r", 1, 10); // 奇數右下、偶數左下
    expect(pageNumberShape(page("p"), 0, [rule], margins, measure)!.label?.align).toBe("right");
    expect(pageNumberShape(page("p"), 1, [rule], margins, measure)!.label?.align).toBe("left");
  });

  it("carries the rule's border and text style", () => {
    const base = createPageNumberRule("r", 1, 1);
    const rule: PageNumberRule = {
      ...base,
      style: { ...base.style, fontStyle: "bold", fill: "#ff0000", stroke: { color: "#0000ff", width: 1, dash: "solid" } },
    };
    const shape = pageNumberShape(page("p"), 0, [rule], margins, measure)!;
    expect(shape.stroke).toEqual({ color: "#0000ff", width: 1, dash: "solid" });
    expect(shape.label).toMatchObject({ fontStyle: "bold", fill: "#ff0000" });
  });
});

describe("withPageNumbers", () => {
  it("adds the number on top of each covered page and leaves the others alone", () => {
    const pages = [page("a"), { ...page("b"), elements: [] }, page("c")];
    const result = withPageNumbers(pages, [createPageNumberRule("r", 2, 3)], margins, measure);
    expect(result[0]).toBe(pages[0]);
    expect(result[1].elements.map((e) => e.id)).toEqual([pageNumberShapeId("b")]);
    expect(result[2].elements).toHaveLength(1);
  });

  it("returns the same pages when there are no rules", () => {
    const pages = [page("a")];
    expect(withPageNumbers(pages, [], margins, measure)).toBe(pages);
  });
});

describe("validation", () => {
  const rule = createPageNumberRule("r", 1, 4);

  it("accepts a default rule and rejects bad ranges, positions and styles", () => {
    expect(isPageNumberRule(rule)).toBe(true);
    expect(isPageNumberRule({ ...rule, from: 0 })).toBe(false);
    expect(isPageNumberRule({ ...rule, from: 5, to: 4 })).toBe(false);
    expect(isPageNumberRule({ ...rule, from: 1.5 })).toBe(false);
    expect(isPageNumberRule({ ...rule, start: -1 })).toBe(false);
    expect(isPageNumberRule({ ...rule, start: 0 })).toBe(true);
    expect(isPageNumberRule({ ...rule, odd: { ...rule.odd, position: "center" } })).toBe(false);
    expect(isPageNumberRule({ ...rule, even: { ...rule.even, prefix: "a\nb" } })).toBe(false);
    expect(isPageNumberRule({ ...rule, even: { ...rule.even, suffix: "字".repeat(21) } })).toBe(false);
    expect(isPageNumberRule({ ...rule, style: { ...rule.style, fill: "red" } })).toBe(false);
    expect(isPageNumberRule({ ...rule, style: { ...rule.style, stroke: { color: "#000000", width: 0, dash: "solid" } } })).toBe(false);
    expect(isPageNumberRule({ ...rule, style: { ...rule.style, italic: true, shadow: { color: "#000000", offsetX: 1, offsetY: 1 } } })).toBe(
      true,
    );
    expect(isPageNumberRule({ ...rule, style: { ...rule.style, underline: "no" as never } })).toBe(false);
    expect(isPageNumberRule({ ...rule, style: { ...rule.style, shadow: { color: "#000000", offsetX: 99, offsetY: 0 } } })).toBe(false);
  });

  it("rejects overlapping ranges and duplicate ids", () => {
    const next = createPageNumberRule("s", 5, 8);
    expect(isPageNumberRules([next, rule])).toBe(true);
    expect(isPageNumberRules([rule, { ...next, from: 4 }])).toBe(false);
    expect(isPageNumberRules([rule, { ...next, id: "r" }])).toBe(false);
    expect(isPageNumberRules("nope")).toBe(false);
    expect(rulesOverlap({ from: 1, to: 4 }, { from: 4, to: 6 })).toBe(true);
    expect(rulesOverlap({ from: 1, to: 4 }, { from: 5, to: 6 })).toBe(false);
  });

  it("checks a rule edited in the dialog against the list", () => {
    const next = createPageNumberRule("s", 5, 8);
    expect(pageNumberRuleError([rule], next, null)).toBeNull();
    expect(pageNumberRuleError([rule], { ...next, from: 9 }, null)).toBe("起始頁（9）不能大於結束頁（8）");
    expect(pageNumberRuleError([rule], { ...next, from: 4 }, null)).toBe("和「第 1–4 頁」的設定重疊");
    // 修改自己時不算重疊
    expect(pageNumberRuleError([rule, next], { ...next, from: 6 }, "s")).toBeNull();
    expect(pageNumberRuleError([], { ...next, start: -1 }, null)).toBe("設定不完整或超出範圍");
  });

  it("suggests the range after the last rule", () => {
    expect(nextPageNumberRange([], 6)).toEqual({ from: 1, to: 6 });
    expect(nextPageNumberRange([rule], 6)).toEqual({ from: 5, to: 6 });
    expect(nextPageNumberRange([rule], 2)).toEqual({ from: 5, to: 5 });
  });

  it("describes rules for the list", () => {
    expect(describePageRange(rule)).toBe("第 1–4 頁");
    expect(describePageRange({ from: 3, to: 3 })).toBe("第 3 頁");
    expect(describePageNumberRule(rule)).toBe("奇數頁 右下・偶數頁 左下，從 1 起算");
    expect(describePageNumberRule(ruleAt("bottomCenter"))).toBe("奇偶頁 下中，從 1 起算");
  });

  it("sorts rules by their first page", () => {
    const next = createPageNumberRule("s", 5, 8);
    expect(sortPageNumberRules([next, rule]).map((r) => r.id)).toEqual(["r", "s"]);
  });
});
