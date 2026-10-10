import { DEFAULT_FONT_FAMILY, DEFAULT_TEXT_FILL } from "./element-factory";
import { TEXT_LINE_HEIGHT } from "./geometry";
import { LABEL_PADDING_PT } from "./shape-label";
import type {
  Margins,
  Page,
  PageNumberFace,
  PageNumberPosition,
  PageNumberRule,
  PageNumberStyle,
  ShapeElement,
  Sheet,
  TextStyle,
} from "./types";
import { PLAIN_TEXT_DECORATION } from "./text-style";
import { mmToPt } from "./units";
import { FONT_SIZE_MAX, FONT_SIZE_MIN, hasValidTextDecoration, isElementColor, isStroke } from "./validation";

/**
 * 頁碼管理的純邏輯。頁碼不是文件裡的物件：畫布與匯出時，由規則算出一個「虛擬圖形」
 * （透明矩形 + 框線 + 圖形內文字），沿用既有的圖形繪製與匯出路徑。
 * 驗證規則和 Rust `format.rs` 的 `validate_page_number_rules` 相同。
 */

export const PAGE_NUMBER_POSITIONS = [
  "topLeft",
  "topCenter",
  "topRight",
  "middleLeft",
  "middleRight",
  "bottomLeft",
  "bottomCenter",
  "bottomRight",
] as const satisfies readonly PageNumberPosition[];

/** Names shown in the dialog (same words as the reference picture). */
export const PAGE_NUMBER_POSITION_LABELS: { readonly [P in PageNumberPosition]: string } = {
  topLeft: "左上",
  topCenter: "上中",
  topRight: "右上",
  middleLeft: "左中",
  middleRight: "右中",
  bottomLeft: "左下",
  bottomCenter: "下中",
  bottomRight: "右下",
};

/** Width (pt) of one line of text in a given style; the app measures with Konva, tests use a fake. */
export type MeasureTextWidth = (text: string, style: PageNumberStyle) => number;

/** Largest page number in a rule's range or start value. */
export const PAGE_NUMBER_MAX = 99999;
/** Longest prefix / suffix (characters). */
export const PAGE_NUMBER_AFFIX_MAX_LENGTH = 20;
/** Default font size of a new rule (pt). */
export const PAGE_NUMBER_DEFAULT_FONT_SIZE = 10;
/** Distance from the page edge (pt) to the number's centre / aligned edge when the margin is 0 or too small. */
export const PAGE_NUMBER_FALLBACK_INSET_PT = mmToPt(10);
/** Extra width (pt) so rounding never makes the canvas wrap the number onto two lines. */
const WRAP_SLACK_PT = 1;
/** Fully transparent fill of the page number box. */
const TRANSPARENT = "#00000000";

const PAGE_NUMBER_ID_PREFIX = "page-number:";

/**
 * Creates a rule with the default look: odd pages bottom right, even pages bottom left
 * (the outer corner of a magazine spread), 10 pt default font, no border.
 *
 * Args:
 *   id: Rule id.
 *   from: First page (1-based).
 *   to: Last page (inclusive).
 *
 * Returns:
 *   New rule; its first page shows its own page number.
 */
export function createPageNumberRule(id: string, from: number, to: number): PageNumberRule {
  return {
    id,
    from,
    to,
    start: from,
    odd: { position: "bottomRight", prefix: "", suffix: "" },
    even: { position: "bottomLeft", prefix: "", suffix: "" },
    style: {
      fontSize: PAGE_NUMBER_DEFAULT_FONT_SIZE,
      fontFamily: DEFAULT_FONT_FAMILY,
      fontStyle: "normal",
      ...PLAIN_TEXT_DECORATION,
      fill: DEFAULT_TEXT_FILL,
      stroke: null,
    },
  };
}

/**
 * Finds the rule that numbers a page.
 *
 * Args:
 *   rules: Page number rules (non-overlapping).
 *   pageIndex: 0-based page index in the document.
 *
 * Returns:
 *   The rule covering the page, or null (no page number on that page).
 */
export function findPageNumberRule(rules: readonly PageNumberRule[], pageIndex: number): PageNumberRule | null {
  const pageNumber = pageIndex + 1;
  return rules.find((rule) => rule.from <= pageNumber && pageNumber <= rule.to) ?? null;
}

/**
 * Returns the odd- or even-page settings that apply to a page (the first page is odd).
 *
 * Args:
 *   rule: Rule covering the page.
 *   pageIndex: 0-based page index in the document.
 *
 * Returns:
 *   The rule's odd or even face.
 */
export function pageNumberFace(rule: PageNumberRule, pageIndex: number): PageNumberFace {
  return pageIndex % 2 === 0 ? rule.odd : rule.even;
}

/** Whether a position is written vertically (left / right middle). */
export function isVerticalPosition(position: PageNumberPosition): boolean {
  return position === "middleLeft" || position === "middleRight";
}

/**
 * Returns the text shown as a page's number: prefix + number + suffix. Vertical positions put
 * every character on its own line (「第／1／2／頁」).
 *
 * Args:
 *   rule: Rule covering the page.
 *   pageIndex: 0-based page index in the document.
 *
 * Returns:
 *   Text of the page number.
 */
export function pageNumberText(rule: PageNumberRule, pageIndex: number): string {
  const face = pageNumberFace(rule, pageIndex);
  const text = `${face.prefix}${displayedPageNumber([rule], pageIndex)}${face.suffix}`;
  return isVerticalPosition(face.position) ? Array.from(text).join("\n") : text;
}

/**
 * The number a page shows: counted by the rule covering it (with its start value), or the page's
 * position in the document when no rule covers it. The `{頁碼}` text variable uses it.
 *
 * Args:
 *   rules: Page number rules.
 *   pageIndex: 0-based page index in the document.
 *
 * Returns:
 *   The page number.
 */
export function displayedPageNumber(rules: readonly PageNumberRule[], pageIndex: number): number {
  const rule = findPageNumberRule(rules, pageIndex);
  return rule ? rule.start + (pageIndex + 1 - rule.from) : pageIndex + 1;
}

/** Id of a page's page number shape; never collides with element ids (they are UUIDs). */
export function pageNumberShapeId(pageId: string): string {
  return `${PAGE_NUMBER_ID_PREFIX}${pageId}`;
}

// 邊界區夠放時置中在邊界區，否則以距頁緣 10 mm 為中心
function bandCenter(margin: number, size: number): number {
  return margin >= size ? margin / 2 : PAGE_NUMBER_FALLBACK_INSET_PT;
}

// 靠左 / 靠右對齊內容區的邊；邊界為 0 時改用距頁緣 10 mm
function edgeInset(margin: number): number {
  return margin > 0 ? margin : PAGE_NUMBER_FALLBACK_INSET_PT;
}

function horizontalAlign(position: PageNumberPosition): TextStyle["align"] {
  if (position.endsWith("Left")) return "left";
  if (position.endsWith("Right")) return "right";
  return "center";
}

/**
 * Builds the virtual shape that draws a page's number: a transparent rectangle with the rule's
 * border, holding the number as its label. The box fits the text plus LABEL_PADDING_PT on each
 * side, and the text (not the border) lines up with the content area's edge.
 *
 * Position (see docs/Plans/imp-page-settings.html 4.3):
 * - top / bottom: centred in the top / bottom margin band; left / right aligned to the content
 *   area's edge, centre on the page's centre line.
 * - middle left / right: centred in the left / right margin band and on the page's middle, vertical.
 * A margin of 0 (or too small for the box) falls back to PAGE_NUMBER_FALLBACK_INSET_PT from the edge.
 *
 * Args:
 *   page: The page (a master page passes pageIndex -1 and gets no number).
 *   pageIndex: 0-based index of the page in the document.
 *   rules: Page number rules.
 *   margins: Document margins.
 *   measure: Measures one line of text.
 *
 * Returns:
 *   Shape element in page coordinates, or null when no rule covers the page.
 */
export function pageNumberShape(
  page: Sheet,
  pageIndex: number,
  rules: readonly PageNumberRule[],
  margins: Margins,
  measure: MeasureTextWidth,
): ShapeElement | null {
  const rule = findPageNumberRule(rules, pageIndex);
  if (!rule) return null;
  const { position } = pageNumberFace(rule, pageIndex);
  const text = pageNumberText(rule, pageIndex);
  const { stroke, ...textStyle } = rule.style;
  const lines = text.split("\n");
  const textWidth = Math.max(...lines.map((line) => measure(line, rule.style))) + WRAP_SLACK_PT;
  const width = textWidth + 2 * LABEL_PADDING_PT;
  const height = lines.length * textStyle.fontSize * TEXT_LINE_HEIGHT + 2 * LABEL_PADDING_PT;
  const align = isVerticalPosition(position) ? "center" : horizontalAlign(position);

  let x: number;
  let y: number;
  if (isVerticalPosition(position)) {
    const center = bandCenter(position === "middleLeft" ? margins.left : margins.right, width);
    x = position === "middleLeft" ? center - width / 2 : page.width - center - width / 2;
    y = (page.height - height) / 2;
  } else {
    const top = position.startsWith("top");
    const center = bandCenter(top ? margins.top : margins.bottom, height);
    y = top ? center - height / 2 : page.height - center - height / 2;
    if (align === "left") x = edgeInset(margins.left) - LABEL_PADDING_PT;
    else if (align === "right") x = page.width - edgeInset(margins.right) - width + LABEL_PADDING_PT;
    else x = (page.width - width) / 2;
  }

  return {
    id: pageNumberShapeId(page.id),
    type: "shape",
    x,
    y,
    rotation: 0,
    width,
    height,
    geometry: { kind: "rect", cornerRadius: 0 },
    fill: TRANSPARENT,
    stroke,
    label: { ...textStyle, text, align, verticalAlign: "middle", styleId: null },
  };
}

/**
 * Returns a copy of the pages with each page's number shape added on top. Used only right before
 * exporting; the document itself never stores these shapes.
 *
 * Args:
 *   pages: Document pages.
 *   rules: Page number rules.
 *   margins: Document margins.
 *   measure: Measures one line of text.
 *
 * Returns:
 *   The same array when no page gets a number, otherwise new pages with the shape appended.
 */
export function withPageNumbers(
  pages: readonly Page[],
  rules: readonly PageNumberRule[],
  margins: Margins,
  measure: MeasureTextWidth,
): readonly Page[] {
  if (rules.length === 0) return pages;
  return pages.map((page, index) => {
    const shape = pageNumberShape(page, index, rules, margins, measure);
    return shape ? { ...page, elements: [...page.elements, shape] } : page;
  });
}

const isPageNumber = (n: unknown, min: number): n is number =>
  Number.isInteger(n) && (n as number) >= min && (n as number) <= PAGE_NUMBER_MAX;

const isAffix = (s: unknown): s is string =>
  typeof s === "string" && Array.from(s).length <= PAGE_NUMBER_AFFIX_MAX_LENGTH && !/[\r\n]/.test(s);

function isPageNumberFace(value: unknown): value is PageNumberFace {
  if (typeof value !== "object" || value === null) return false;
  const face = value as Record<string, unknown>;
  return (
    (PAGE_NUMBER_POSITIONS as readonly unknown[]).includes(face.position) && isAffix(face.prefix) && isAffix(face.suffix)
  );
}

function isPageNumberStyle(value: unknown): value is PageNumberStyle {
  if (typeof value !== "object" || value === null) return false;
  const style = value as Record<string, unknown>;
  return (
    typeof style.fontSize === "number" &&
    style.fontSize >= FONT_SIZE_MIN &&
    style.fontSize <= FONT_SIZE_MAX &&
    typeof style.fontFamily === "string" &&
    (style.fontStyle === "normal" || style.fontStyle === "bold") &&
    hasValidTextDecoration(style) &&
    typeof style.fill === "string" &&
    isElementColor(style.fill) &&
    (style.stroke === null || isStroke(style.stroke))
  );
}

/**
 * Checks one rule: 1 ≤ from ≤ to ≤ PAGE_NUMBER_MAX, 0 ≤ start ≤ PAGE_NUMBER_MAX (integers),
 * known positions, single-line prefix / suffix of at most PAGE_NUMBER_AFFIX_MAX_LENGTH characters,
 * and a valid text style and border.
 *
 * Args:
 *   value: Candidate rule.
 *
 * Returns:
 *   True when the value can be stored as a page number rule.
 */
export function isPageNumberRule(value: unknown): value is PageNumberRule {
  if (typeof value !== "object" || value === null) return false;
  const rule = value as Record<string, unknown>;
  return (
    typeof rule.id === "string" &&
    rule.id !== "" &&
    isPageNumber(rule.from, 1) &&
    isPageNumber(rule.to, 1) &&
    (rule.from as number) <= (rule.to as number) &&
    isPageNumber(rule.start, 0) &&
    isPageNumberFace(rule.odd) &&
    isPageNumberFace(rule.even) &&
    isPageNumberStyle(rule.style)
  );
}

/**
 * Whether two rules share at least one page.
 *
 * Args:
 *   a: A rule.
 *   b: Another rule.
 *
 * Returns:
 *   True when their page ranges overlap.
 */
export function rulesOverlap(a: Pick<PageNumberRule, "from" | "to">, b: Pick<PageNumberRule, "from" | "to">): boolean {
  return a.from <= b.to && b.from <= a.to;
}

/**
 * Checks a whole rule list: every rule valid, unique ids, no two ranges overlapping.
 *
 * Args:
 *   value: Candidate rule list.
 *
 * Returns:
 *   True when the value can be stored as the document's page number rules.
 */
export function isPageNumberRules(value: unknown): value is readonly PageNumberRule[] {
  if (!Array.isArray(value) || !value.every(isPageNumberRule)) return false;
  if (new Set(value.map((rule) => rule.id)).size !== value.length) return false;
  const sorted = sortPageNumberRules(value);
  return sorted.every((rule, i) => i === 0 || !rulesOverlap(sorted[i - 1], rule));
}

/**
 * Suggests the page range of a new rule: right after the last rule, up to the last page.
 *
 * Args:
 *   rules: Existing rules.
 *   pageCount: Pages in the document.
 *
 * Returns:
 *   First and last page; `to` is at least `from` even when the rules already reach past the last page.
 */
export function nextPageNumberRange(rules: readonly PageNumberRule[], pageCount: number): { from: number; to: number } {
  const from = Math.min(PAGE_NUMBER_MAX, rules.reduce((last, rule) => Math.max(last, rule.to), 0) + 1);
  return { from, to: Math.max(from, Math.min(pageCount, PAGE_NUMBER_MAX)) };
}

/**
 * Checks a rule edited in the dialog before it is added to (or replaces one in) the list.
 *
 * Args:
 *   rules: Rules currently in the list.
 *   draft: The edited rule.
 *   replacing: Id of the rule being modified (ignored in the overlap check), or null when adding.
 *
 * Returns:
 *   A message for the user, or null when the rule can be stored.
 */
export function pageNumberRuleError(
  rules: readonly PageNumberRule[],
  draft: PageNumberRule,
  replacing: string | null,
): string | null {
  if (draft.from > draft.to) return `起始頁（${draft.from}）不能大於結束頁（${draft.to}）`;
  const overlapping = rules.find((rule) => rule.id !== replacing && rulesOverlap(rule, draft));
  if (overlapping) return `和「${describePageRange(overlapping)}」的設定重疊`;
  if (!isPageNumberRule(draft)) return "設定不完整或超出範圍";
  return null;
}

/** "第 3–12 頁" (or "第 3 頁" for a single page). */
export function describePageRange(rule: Pick<PageNumberRule, "from" | "to">): string {
  return rule.from === rule.to ? `第 ${rule.from} 頁` : `第 ${rule.from}–${rule.to} 頁`;
}

/**
 * One-line summary of a rule for the dialog list, e.g. "奇數頁 右下・偶數頁 左下，從 1 起算".
 *
 * Args:
 *   rule: Rule.
 *
 * Returns:
 *   Summary text.
 */
export function describePageNumberRule(rule: PageNumberRule): string {
  const odd = PAGE_NUMBER_POSITION_LABELS[rule.odd.position];
  const even = PAGE_NUMBER_POSITION_LABELS[rule.even.position];
  const where = odd === even ? `奇偶頁 ${odd}` : `奇數頁 ${odd}・偶數頁 ${even}`;
  return `${where}，從 ${rule.start} 起算`;
}

/**
 * Sorts rules by their first page (the order the dialog lists them in).
 *
 * Args:
 *   rules: Rules.
 *
 * Returns:
 *   New sorted array.
 */
export function sortPageNumberRules(rules: readonly PageNumberRule[]): PageNumberRule[] {
  return [...rules].sort((a, b) => a.from - b.from);
}
