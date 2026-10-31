/**
 * Tool `check_layout`: finds layout problems on one page by measuring it the way the canvas draws
 * it (text overflowing its shape, text overlapping other things, elements off the page or outside
 * the margins). Read only. Plan: `docs/14-Plan-ClaudeCode看見畫面/1-看見畫面-實作.md` §4.
 */
import { selectActivePage, type EditorState } from "@/lib/editor/editor-reducer";
import { getElementBounds, marginBounds, rotatedBoxBounds } from "@/lib/editor/geometry";
import { findSheet, inheritedElements } from "@/lib/editor/master-pages";
import { pageNumberShape, type MeasureTextWidth } from "@/lib/editor/page-numbers";
import { labelAsText, labelFrame, labelTextOffset, textBlockHeight } from "@/lib/editor/shape-label";
import { spreadOf } from "@/lib/editor/spreads";
import type { Bounds, CanvasElement, PageId, ShapeElement, Sheet, TextAlign, TextElement } from "@/lib/editor/types";
import type { Result } from "@/lib/editor/validation";
import { pageLayers, type TextLayout } from "@/lib/export/export-request";
import { measuredTextHeight, type MeasureText } from "./layout";

/** Most issues one call reports; the rest are counted in `truncated`. */
export const LAYOUT_ISSUES_MAX = 50;
/** Distances below this (pt) are rounding, not a problem. */
export const LAYOUT_TOLERANCE_PT = 0.5;
/** Overlaps up to this area (pt²) are touching edges (table cells), not a problem. */
export const OVERLAP_MIN_AREA_PT2 = 1;
const SUMMARY_LENGTH = 20;

/** Where an element on the checked page comes from. */
export type LayoutSource = "own" | "master" | "facingPage" | "pageNumber";

/** How far an element sticks out on each side (pt); sides that do not stick out are omitted. */
export type SideOverflow = Partial<Record<"top" | "right" | "bottom" | "left", number>>;

export type LayoutIssue =
  | {
      readonly type: "textOverflow";
      /** "warning": a shape's text only eats into its padding and stays inside the (rectangular) shape. */
      readonly severity: "error" | "warning";
      readonly id: string;
      readonly summary: string;
      /** "height": more lines than the shape holds; "width": a line wider than its box. */
      readonly direction: "height" | "width";
      readonly overflowPt: number;
    }
  | {
      readonly type: "overlap";
      readonly severity: "error";
      readonly ids: readonly [string, string];
      readonly summary: string;
      readonly areaPt2: number;
      /** Present when one of the two is not the page's own element (then its id is the original's). */
      readonly sources?: readonly [LayoutSource, LayoutSource];
    }
  | {
      readonly type: "outOfPage" | "outOfMargin";
      readonly severity: "error" | "warning";
      readonly id: string;
      readonly summary: string;
      readonly overflowPt: SideOverflow;
    };

export interface LayoutReport {
  readonly pageId: PageId;
  readonly pageName: string;
  /** The page's own elements that were checked. */
  readonly checked: number;
  readonly issues: readonly LayoutIssue[];
  /** Issues left out beyond `LAYOUT_ISSUES_MAX`. */
  readonly truncated: number;
}

/** One element as the page shows it, with its outline measured. */
interface Item {
  readonly element: CanvasElement;
  /** The id to report: the element's own (master and facing-page elements keep theirs). */
  readonly id: string;
  readonly source: LayoutSource;
  readonly bounds: Bounds;
}

/**
 * Checks the layout of one page or master page.
 *
 * Args:
 *   state: Editor state.
 *   measure: Canvas text layout.
 *   measureWidth: Width of one unwrapped line (page numbers).
 *   pageId: Page or master page; omitted = the sheet the user is looking at.
 *
 * Returns:
 *   The issues found (empty when none), or an error when the page id is unknown.
 */
export function checkLayout(
  state: EditorState,
  measure: MeasureText,
  measureWidth: MeasureTextWidth,
  pageId?: PageId,
): Result<LayoutReport> {
  const document = state.history.present;
  const sheet = pageId === undefined ? selectActivePage(state) : findSheet(document, pageId);
  if (!sheet) return { data: null, error: new Error(`找不到頁面「${pageId}」，請先用 list_pages 取得 id`) };

  const items = sheetItems(state, sheet, measure, measureWidth);
  const own = items.filter((item) => item.source === "own");
  const issues: LayoutIssue[] = [
    ...own.flatMap((item) => textOverflow(item, measure)),
    ...overlaps(items),
    ...edgeIssues(state, sheet, own),
  ];
  const kept = issues.slice(0, LAYOUT_ISSUES_MAX);
  return {
    data: { pageId: sheet.id, pageName: sheet.name, checked: own.length, issues: kept, truncated: issues.length - kept.length },
    error: null,
  };
}

// 頁面上看得到的全部物件（和匯出相同：主頁、跨頁、本頁、頁碼），由下到上
function sheetItems(state: EditorState, sheet: Sheet, measure: MeasureText, measureWidth: MeasureTextWidth): Item[] {
  const document = state.history.present;
  const item = (element: CanvasElement, source: LayoutSource): Item => ({
    element,
    id: element.id,
    source,
    bounds: measuredBounds(element, measure),
  });
  const pageIndex = document.pages.findIndex((page) => page.id === sheet.id);
  const layers = pageIndex >= 0 ? pageLayers(document, document.pages[pageIndex], pageIndex) : null;
  if (pageIndex < 0 || layers === null) {
    // 主頁：上層主頁的物件 + 自己的（變數照原樣，沒有頁碼）
    return [
      ...inheritedElements(document.masters, sheet).map((element) => item(element, "master")),
      ...sheet.elements.map((element) => item(element, "own")),
    ];
  }
  const numberShape = pageNumberShape(sheet, pageIndex, document.pageNumberRules, document.margins, measureWidth);
  return [
    ...layers.inherited.map((element) => item(element, "master")),
    ...layers.spillover.map(({ element }) => item(element, "facingPage")),
    ...layers.own.map((element) => item(element, "own")),
    ...(numberShape ? [item(numberShape, "pageNumber")] : []),
  ];
}

/**
 * Outline of an element in page coordinates. A text element covers its measured height (not
 * estimated) and, across, only where its lines are drawn: a short centred label in a wide box does
 * not reach the box's edges.
 *
 * Args:
 *   element: Any element.
 *   measure: Canvas text layout.
 *
 * Returns:
 *   Axis-aligned bounds after rotation, in pt.
 */
export function measuredBounds(element: CanvasElement, measure: MeasureText): Bounds {
  if (element.type !== "text") return getElementBounds(element);
  const span = drawnSpan(measure(element), element.align, element.width) ?? { min: 0, max: element.width };
  return rotatedBoxBounds(element, { minX: span.min, minY: 0, maxX: span.max, maxY: measuredTextHeight(element, measure) }, element.rotation);
}

/**
 * Horizontal extent of the drawn lines, from the box's left edge: each line sits in its line box
 * (paragraph indents) or the whole width, placed by the alignment.
 *
 * Args:
 *   layout: Canvas layout of the text.
 *   align: Text alignment.
 *   width: Wrapping width (the text box, or a shape's label frame).
 *
 * Returns:
 *   Leftmost and rightmost x in pt, or null when every line is empty.
 */
export function drawnSpan(layout: TextLayout, align: TextAlign, width: number): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  layout.lineWidths.forEach((lineWidth, index) => {
    if (!(lineWidth > 0)) return;
    const box = layout.lineBoxes?.[index] ?? { start: 0, width };
    const start =
      align === "right" ? box.start + box.width - lineWidth : align === "center" ? box.start + (box.width - lineWidth) / 2 : box.start;
    min = Math.min(min, start);
    max = Math.max(max, start + lineWidth);
  });
  return min <= max ? { min, max } : null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function shortText(text: string): string {
  const characters = Array.from(text.replace(/\s*\r?\n\s*/g, " ").trim());
  return characters.length <= SUMMARY_LENGTH ? characters.join("") : `${characters.slice(0, SUMMARY_LENGTH).join("")}…`;
}

function describe(element: CanvasElement): string {
  switch (element.type) {
    case "text":
      return `文字「${shortText(element.text)}」`;
    case "shape":
      return element.label && element.label.text !== "" ? `圖形「${shortText(element.label.text)}」` : "圖形";
    case "image":
      return "圖片";
    case "line":
      return "線條";
  }
}

function widestOverflow(widths: readonly number[], room: (index: number) => number): number {
  return widths.reduce((worst, width, index) => Math.max(worst, width - room(index)), 0);
}

// 圖形內文字：行數超過文字區的高度、或一行比文字區寬；文字物件：一行比換行寬度寬（放不下的長單字）
function textOverflow(item: Item, measure: MeasureText): LayoutIssue[] {
  const { element } = item;
  const issue = (direction: "height" | "width", overflow: number, severity: "error" | "warning" = "error"): LayoutIssue => ({
    type: "textOverflow",
    severity,
    id: item.id,
    summary: describe(element),
    direction,
    overflowPt: round1(overflow),
  });
  if (element.type === "text") {
    const layout = measure(element);
    const boxes = layout.lineBoxes;
    const overflow = widestOverflow(layout.lineWidths, (index) => boxes?.[index]?.width ?? element.width);
    return overflow > LAYOUT_TOLERANCE_PT ? [issue("width", overflow)] : [];
  }
  if (element.type !== "shape" || !element.label || element.label.text === "") return [];
  return labelOverflow(element, measure).map(({ direction, overflow, insideShape }) =>
    issue(direction, overflow, insideShape ? "warning" : "error"),
  );
}

interface LabelOverflow {
  readonly direction: "height" | "width";
  /** Beyond the label frame (pt). */
  readonly overflow: number;
  /** The text still stays inside the shape (it only eats the padding); rectangles only. */
  readonly insideShape: boolean;
}

// 超出文字區（圖形扣掉內距）；矩形的文字只吃掉內距、還在外框裡時另外標出（警告）
function labelOverflow(shape: ShapeElement, measure: MeasureText): LabelOverflow[] {
  const label = shape.label!;
  const frame = labelFrame(shape);
  const text: TextElement = labelAsText(shape, label, { x: 0, y: 0 });
  const layout = measure(text);
  const t = LAYOUT_TOLERANCE_PT;
  const isRect = shape.geometry.kind === "rect";
  const found: LabelOverflow[] = [];
  const textHeight = textBlockHeight(layout.lines.length, label.fontSize, label.lineHeight);
  const height = textHeight - frame.height;
  if (height > t) {
    const top = frame.y + labelTextOffset(frame, label.verticalAlign, textHeight);
    found.push({ direction: "height", overflow: height, insideShape: isRect && top >= -t && top + textHeight <= shape.height + t });
  }
  const width = widestOverflow(layout.lineWidths, (index) => layout.lineBoxes?.[index]?.width ?? frame.width);
  if (width > t) {
    const span = drawnSpan(layout, label.align, frame.width);
    const inside = span !== null && frame.x + span.min >= -t && frame.x + span.max <= shape.width + t;
    found.push({ direction: "width", overflow: width, insideShape: isRect && inside });
  }
  return found;
}

function hasText(element: CanvasElement): boolean {
  return element.type === "text" || (element.type === "shape" && element.label !== null && element.label.text !== "");
}

function intersectionArea(a: Bounds, b: Bounds): number {
  const width = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const height = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  return width > 0 && height > 0 ? width * height : 0;
}

function contains(outer: Bounds, inner: Bounds): boolean {
  const t = LAYOUT_TOLERANCE_PT;
  return inner.minX >= outer.minX - t && inner.minY >= outer.minY - t && inner.maxX <= outer.maxX + t && inner.maxY <= outer.maxY + t;
}

// 文字完全在圖形 / 圖片裡面：刻意放在色塊或照片上
function isPlacedOn(text: Item, base: Item): boolean {
  return (base.element.type === "shape" || base.element.type === "image") && contains(base.bounds, text.bounds);
}

// 至少一方有文字、沒有線條、至少一方是本頁的物件；相鄰（面積 ≤ 1 pt²）與放在底框上的不算
function overlaps(items: readonly Item[]): LayoutIssue[] {
  const found: LayoutIssue[] = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      if (a.source !== "own" && b.source !== "own") continue;
      if (a.element.type === "line" || b.element.type === "line") continue;
      if (!hasText(a.element) && !hasText(b.element)) continue;
      const area = intersectionArea(a.bounds, b.bounds);
      if (area <= OVERLAP_MIN_AREA_PT2) continue;
      if ((hasText(a.element) && isPlacedOn(a, b)) || (hasText(b.element) && isPlacedOn(b, a))) continue;
      found.push({
        type: "overlap",
        severity: "error",
        ids: [a.id, b.id],
        summary: `${describe(a.element)}和${describe(b.element)}重疊`,
        areaPt2: round1(area),
        ...(a.source !== "own" || b.source !== "own" ? { sources: [a.source, b.source] as const } : {}),
      });
    }
  }
  return found;
}

function sideOverflow(bounds: Bounds, area: Bounds): SideOverflow {
  const sides: SideOverflow = {};
  const t = LAYOUT_TOLERANCE_PT;
  if (area.minY - bounds.minY > t) sides.top = round1(area.minY - bounds.minY);
  if (bounds.maxX - area.maxX > t) sides.right = round1(bounds.maxX - area.maxX);
  if (bounds.maxY - area.maxY > t) sides.bottom = round1(bounds.maxY - area.maxY);
  if (area.minX - bounds.minX > t) sides.left = round1(area.minX - bounds.minX);
  return sides;
}

function touchesEdge(bounds: Bounds, page: Bounds): boolean {
  const t = LAYOUT_TOLERANCE_PT;
  return bounds.minX <= page.minX + t || bounds.minY <= page.minY + t || bounds.maxX >= page.maxX - t || bounds.maxY >= page.maxY - t;
}

// 超出頁面（雙頁的中縫那一側可以越過：跨頁物件）；超出邊界只是警告，碰到頁緣的（出血、滿版色帶）不算
function edgeIssues(state: EditorState, sheet: Sheet, own: readonly Item[]): LayoutIssue[] {
  const document = state.history.present;
  const page: Bounds = { minX: 0, minY: 0, maxX: sheet.width, maxY: sheet.height };
  const allowed = { ...page };
  const spread = spreadOf(document.pages, sheet.id);
  if (spread && spread.slots.length === 2) {
    const [left, right] = spread.slots;
    if (left.page.id === sheet.id) allowed.maxX = sheet.width + right.page.width;
    else allowed.minX = -left.page.width;
  }
  const margins = marginBounds(sheet, document.margins);
  const found: LayoutIssue[] = [];
  for (const item of own) {
    // 蓋滿整頁的背景
    if (contains(item.bounds, page)) continue;
    const outside = sideOverflow(item.bounds, allowed);
    const summary = describe(item.element);
    if (Object.keys(outside).length > 0) {
      found.push({ type: "outOfPage", severity: "error", id: item.id, summary, overflowPt: outside });
      continue;
    }
    if (!margins || touchesEdge(item.bounds, page)) continue;
    const outsideMargins = sideOverflow(item.bounds, margins);
    if (Object.keys(outsideMargins).length > 0) {
      found.push({ type: "outOfMargin", severity: "warning", id: item.id, summary, overflowPt: outsideMargins });
    }
  }
  return found;
}
