/**
 * 「繪圖」面板的常用線條與箭頭：點一下放到頁面中央（分隔線橫跨內容區）。
 * 計畫：`docs/06-Plans-繪圖/03-自由繪圖-實作.md` 步驟 11。
 */
import { createLineElement, PLAIN_LINE_END } from "./element-factory";
import { toolLineStroke } from "./line-kinds";
import type { Bounds, LineElement, LineEnd, LinePoint, Point, Stroke, Swatch } from "./types";

export interface LinePreset {
  readonly id: string;
  readonly label: string;
  /** Points around (0, 0); placed with (0, 0) on the target point. */
  readonly points: readonly LinePoint[];
  readonly path: LineElement["path"];
  /** Two thin lines (straight presets only); single when omitted. */
  readonly compound?: LineElement["compound"];
  readonly width: number;
  readonly dash: Stroke["dash"];
  readonly start: LineEnd;
  readonly end: LineEnd;
  /** A rule: spans the content area's width (at the target's y) instead of `points`. */
  readonly fitContentWidth?: boolean;
}

const HEAD: LineEnd = { arrowhead: "triangle", scale: 1 };
const OPEN: LineEnd = { arrowhead: "open", scale: 1 };
const HORIZONTAL: readonly LinePoint[] = [
  { x: -80, y: 0 },
  { x: 80, y: 0 },
];

// 迴圈箭頭：半徑 30 的圓上每 60° 一點（螢幕座標，順時針），留一個 60° 的缺口給箭頭
const LOOP: readonly LinePoint[] = [200, 140, 80, 20, -40, -100].map((deg) => ({
  x: Math.round(30 * Math.cos((deg * Math.PI) / 180) * 100) / 100,
  y: Math.round(30 * Math.sin((deg * Math.PI) / 180) * 100) / 100,
}));

/** Presets in panel order. Ids are not stored in documents (a preset only creates a line). */
export const LINE_PRESETS: readonly LinePreset[] = [
  { id: "rule", label: "分隔線", points: HORIZONTAL, path: "straight", width: 1, dash: "solid", start: PLAIN_LINE_END, end: PLAIN_LINE_END, fitContentWidth: true },
  { id: "ruleThick", label: "粗分隔線", points: HORIZONTAL, path: "straight", width: 3, dash: "solid", start: PLAIN_LINE_END, end: PLAIN_LINE_END, fitContentWidth: true },
  { id: "ruleDouble", label: "雙線分隔線", points: HORIZONTAL, path: "straight", compound: "double", width: 3, dash: "solid", start: PLAIN_LINE_END, end: PLAIN_LINE_END, fitContentWidth: true },
  { id: "dashed", label: "虛線", points: HORIZONTAL, path: "straight", width: 1, dash: "dashed", start: PLAIN_LINE_END, end: PLAIN_LINE_END },
  { id: "dotted", label: "點線", points: HORIZONTAL, path: "straight", width: 1.5, dash: "dotted", start: PLAIN_LINE_END, end: PLAIN_LINE_END },
  { id: "dashDot", label: "點劃線", points: HORIZONTAL, path: "straight", width: 1, dash: "dashDot", start: PLAIN_LINE_END, end: PLAIN_LINE_END },
  { id: "arrow", label: "箭頭", points: HORIZONTAL, path: "straight", width: 1.5, dash: "solid", start: PLAIN_LINE_END, end: HEAD },
  { id: "doubleArrow", label: "雙向箭頭", points: HORIZONTAL, path: "straight", width: 1.5, dash: "solid", start: HEAD, end: HEAD },
  { id: "openArrow", label: "開放箭頭", points: HORIZONTAL, path: "straight", width: 1.5, dash: "solid", start: PLAIN_LINE_END, end: OPEN },
  { id: "dashedArrow", label: "虛線箭頭", points: HORIZONTAL, path: "straight", width: 1.5, dash: "dashed", start: PLAIN_LINE_END, end: HEAD },
  {
    id: "elbowArrow",
    label: "折線箭頭",
    points: [
      { x: -60, y: -30 },
      { x: 50, y: -30 },
      { x: 50, y: 40 },
    ],
    path: "straight",
    width: 1.5,
    dash: "solid",
    start: PLAIN_LINE_END,
    end: HEAD,
  },
  {
    id: "curvedArrow",
    label: "曲線箭頭",
    points: [
      { x: -70, y: 25 },
      { x: 0, y: -20 },
      { x: 70, y: 25 },
    ],
    path: "smooth",
    width: 1.5,
    dash: "solid",
    start: PLAIN_LINE_END,
    end: HEAD,
  },
  { id: "loopArrow", label: "循環箭頭", points: LOOP, path: "smooth", width: 1.5, dash: "solid", start: PLAIN_LINE_END, end: HEAD },
];

/**
 * Creates the line of a preset around a point (a rule spans the content area instead).
 *
 * Args:
 *   preset: Panel preset.
 *   at: Page point to place the preset's (0, 0) on (the page centre).
 *   swatches: The document's swatches (the color links to 「文字」 like the line tool's lines).
 *   contentArea: The page's content area (for rules); null = use `points`.
 *
 * Returns:
 *   New line element.
 */
export function createPresetLine(preset: LinePreset, at: Point, swatches: readonly Swatch[], contentArea: Bounds | null): LineElement {
  const points =
    preset.fitContentWidth && contentArea
      ? [
          { x: contentArea.minX, y: at.y },
          { x: contentArea.maxX, y: at.y },
        ]
      : preset.points.map((point) => ({ x: at.x + point.x, y: at.y + point.y }));
  return createLineElement(points, {
    path: preset.path,
    compound: preset.compound ?? "single",
    stroke: { ...toolLineStroke(swatches), width: preset.width, dash: preset.dash },
    start: preset.start,
    end: preset.end,
  });
}
