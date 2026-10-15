/**
 * 線條與箭頭的路徑：畫布、工具列 / 面板的圖示、匯出都用這一份（所見即所得）。
 *
 * 路徑相對於線條的 (x, y)，單位 pt，只有 M / L / C / Z（三端畫法一致，見 `shape-path.ts`）。
 * 計畫：`docs/06-Plans-繪圖/03-自由繪圖-實作.md` §1.2。
 *
 * 規則：
 * - 箭頭的尖端剛好在端點上，方向 = 端點那一段的方向（重合的點略過）。
 * - 實心三角：線在那一端縮短，線頭藏在三角形裡（尖端不冒出線頭、不留接縫）。
 * - 開放箭頭 `>`：兩撇描邊，尖端往回退，描邊的 miter 尖角剛好落在端點；線縮短到被兩撇蓋住。
 * - 箭頭永遠是實線：虛線只套在線本身。
 */
import { PathBuilder, type PathCommand } from "./shape-path";
import type { LineElement, LineEnd, LinePoint } from "./types";

/** Arrowheads are drawn for lines at least this wide (pt), so thin lines still get visible heads. */
export const ARROWHEAD_MIN_LINE_WIDTH = 1.5;
/** Arrowhead length and width, in (effective) line widths at scale 1. */
export const ARROWHEAD_LENGTH = 4;
export const ARROWHEAD_WIDTH = 3.5;

/** Paths of one line, relative to its (x, y). */
export interface LinePaths {
  /** The line itself: open subpaths, stroked with the line's stroke (dashes included). */
  readonly stroke: readonly PathCommand[];
  /** Filled arrowheads (closed, filled with the line's color, not stroked). */
  readonly fills: readonly PathCommand[];
  /** Open arrowheads (stroked with the line's color and width, always solid). */
  readonly outlines: readonly PathCommand[];
}

/** Size of an arrowhead at one end (pt). */
export interface ArrowheadSize {
  readonly length: number;
  readonly width: number;
}

/**
 * Size of an arrowhead for a line width and an end's scale.
 *
 * Args:
 *   lineWidth: Stroke width (pt).
 *   scale: The end's size factor.
 *
 * Returns:
 *   Length (along the line) and width (across it) in pt.
 */
export function arrowheadSize(lineWidth: number, scale: number): ArrowheadSize {
  const unit = Math.max(lineWidth, ARROWHEAD_MIN_LINE_WIDTH) * scale;
  return { length: ARROWHEAD_LENGTH * unit, width: ARROWHEAD_WIDTH * unit };
}

interface Vec {
  readonly x: number;
  readonly y: number;
}

// 端點與往線內的方向（單位向量）；整條線的點都重合時沒有方向
function endDirection(points: readonly LinePoint[], atStart: boolean): { tip: LinePoint; back: Vec } | null {
  const ordered = atStart ? points : [...points].reverse();
  const tip = ordered[0];
  for (const point of ordered.slice(1)) {
    const length = Math.hypot(point.x - tip.x, point.y - tip.y);
    if (length > 1e-9) return { tip, back: { x: (point.x - tip.x) / length, y: (point.y - tip.y) / length } };
  }
  return null;
}

/** How one end is drawn: the head's subpaths and how much of the line it hides. */
interface EndShape {
  readonly fill: PathCommand[];
  readonly outline: PathCommand[];
  /** Distance the line stops short of the end point (pt). */
  readonly trim: number;
}

const NO_END: EndShape = { fill: [], outline: [], trim: 0 };

function endShape(points: readonly LinePoint[], end: LineEnd, lineWidth: number, atStart: boolean): EndShape {
  if (end.arrowhead === "none") return NO_END;
  const direction = endDirection(points, atStart);
  if (!direction) return NO_END;
  const { tip, back } = direction;
  const { length, width } = arrowheadSize(lineWidth, end.scale);
  const half = width / 2;
  // 垂直方向（左手邊）
  const normal = { x: -back.y, y: back.x };
  const at = (along: number, across: number) => ({
    x: tip.x + back.x * along + normal.x * across,
    y: tip.y + back.y * along + normal.y * across,
  });
  // 兩撇和線的夾角
  const tan = half / length;
  if (end.arrowhead === "triangle") {
    const [a, b] = [at(length, half), at(length, -half)];
    const fill = new PathBuilder().moveTo(tip.x, tip.y).lineTo(a.x, a.y).lineTo(b.x, b.y).close().build();
    // 線頭的兩個角要在三角形裡：三角形在距尖端 s 處的半寬是 s × tan，要 ≥ 半個線寬；至少縮到一半長
    return { fill, outline: [], trim: Math.min(length, Math.max(length / 2, lineWidth / 2 / tan)) };
  }
  // 開放箭頭：描邊的 miter 尖角超出折點 (w/2) / sin(θ)，所以折點往回退這麼多，尖角剛好在端點
  const sin = half / Math.hypot(half, length);
  const pullBack = lineWidth / 2 / sin;
  const apex = at(pullBack, 0);
  const [a, b] = [at(pullBack + length, half), at(pullBack + length, -half)];
  const outline = new PathBuilder().moveTo(a.x, a.y).lineTo(apex.x, apex.y).lineTo(b.x, b.y).build();
  // 線頭的兩個角要被兩撇的外緣蓋住：外緣通過端點、斜率 tan
  return { fill: [], outline, trim: lineWidth / 2 / tan };
}

// 從一端沿著折線往內剪掉 distance；剪完不夠長時回傳 null（整條線被箭頭蓋住）
function trimPoints(points: readonly LinePoint[], distance: number, atStart: boolean): LinePoint[] | null {
  const ordered = atStart ? [...points] : [...points].reverse();
  let left = distance;
  while (ordered.length >= 2) {
    const [a, b] = [ordered[0], ordered[1]];
    const segment = Math.hypot(b.x - a.x, b.y - a.y);
    if (segment > left) {
      const t = left / segment;
      ordered[0] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      return atStart ? ordered : ordered.reverse();
    }
    left -= segment;
    ordered.shift();
  }
  return null;
}

function polyline(points: readonly LinePoint[]): PathCommand[] {
  const builder = new PathBuilder().moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) builder.lineTo(point.x, point.y);
  return builder.build();
}

/**
 * Paths of a line and its arrowheads. Straight lines and polylines for now; smooth lines are drawn
 * through their points with straight segments until the curve step, and double lines as one line
 * until the double-line step (`03-自由繪圖-實作.md` steps 9 and 12).
 *
 * Args:
 *   line: Line element (points, stroke width and ends are used).
 *
 * Returns:
 *   The line, filled heads and open heads, relative to (x, y).
 */
export function linePaths(line: Pick<LineElement, "points" | "stroke" | "start" | "end">): LinePaths {
  const width = line.stroke.width;
  const start = endShape(line.points, line.start, width, true);
  const end = endShape(line.points, line.end, width, false);
  let points: LinePoint[] | null = [...line.points];
  if (start.trim > 0) points = trimPoints(points, start.trim, true);
  if (points && end.trim > 0) points = trimPoints(points, end.trim, false);
  return {
    stroke: points ? polyline(points) : [],
    fills: [...start.fill, ...end.fill],
    outlines: [...start.outline, ...end.outline],
  };
}
