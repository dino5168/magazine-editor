/**
 * 線條與箭頭的路徑：畫布、工具列 / 面板的圖示、匯出都用這一份（所見即所得）。
 *
 * 路徑相對於線條的 (x, y)，單位 pt，只有 M / L / C / Z（三端畫法一致，見 `shape-path.ts`）。
 * 計畫：`docs/06-Plans-繪圖/03-自由繪圖-實作.md` §1.2。
 *
 * 規則：
 * - 箭頭的尖端剛好在端點上，方向 = 端點那一段的方向（曲線是端點的切線；重合的點略過）。
 * - 平滑曲線（`path: "smooth"`）：均勻 Catmull-Rom 換成三次貝茲，穿過每個點；箭頭的縮短沿著曲線量。
 * - 實心三角：線在那一端縮短，線頭藏在三角形裡（尖端不冒出線頭、不留接縫）。
 * - 開放箭頭 `>`：兩撇描邊，尖端往回退，描邊的 miter 尖角剛好落在端點；線縮短到被兩撇蓋住。
 * - 箭頭永遠是實線：虛線只套在線本身。
 */
import { linePointBounds } from "./line-geometry";
import { PathBuilder, pathBounds, type PathCommand } from "./shape-path";
import type { Bounds, LineElement, LineEnd, LinePoint } from "./types";

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

/** One piece of a line: straight from `a` to `b`, or a cubic Bézier when it has control points. */
interface Segment {
  readonly a: LinePoint;
  readonly b: LinePoint;
  readonly c1?: LinePoint;
  readonly c2?: LinePoint;
}

const same = (p: LinePoint, q: LinePoint) => Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9;

// 平滑曲線：均勻 Catmull-Rom（張力 0.5）換成三次貝茲，曲線穿過每個點；兩端重複端點。
// 連續重合的點先去掉（否則會出現長度 0、方向不明的段）
function smoothSegments(points: readonly LinePoint[]): Segment[] {
  const p = points.filter((point, i) => i === 0 || !same(point, points[i - 1]));
  const at = (i: number) => p[Math.min(Math.max(i, 0), p.length - 1)];
  const segments: Segment[] = [];
  for (let i = 0; i + 1 < p.length; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    segments.push({
      a: p1,
      b: p2,
      c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
    });
  }
  return segments;
}

function lineSegments(points: readonly LinePoint[], path: LineElement["path"]): Segment[] {
  if (path === "smooth") return smoothSegments(points);
  return points.slice(1).map((b, i) => ({ a: points[i], b }));
}

function cubicPoint(s: Segment, t: number): LinePoint {
  const { a, b, c1 = a, c2 = b } = s;
  const u = 1 - t;
  const [k0, k1, k2, k3] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return { x: k0 * a.x + k1 * c1.x + k2 * c2.x + k3 * b.x, y: k0 * a.y + k1 * c1.y + k2 * c2.y + k3 * b.y };
}

// 曲線長度用折線近似（每段 64 點，誤差遠小於 0.1 pt）：每個取樣點的累計長度
const SAMPLES = 64;
function cumulativeLengths(s: Segment): number[] {
  const lengths = [0];
  let previous = s.a;
  for (let i = 1; i <= SAMPLES; i++) {
    const point = cubicPoint(s, i / SAMPLES);
    lengths.push(lengths[i - 1] + Math.hypot(point.x - previous.x, point.y - previous.y));
    previous = point;
  }
  return lengths;
}

function segmentLength(s: Segment): number {
  if (!s.c1) return Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
  return cumulativeLengths(s)[SAMPLES];
}

// de Casteljau：只留下 [t, 1] 那一段
function cubicFrom(s: Segment, t: number): Segment {
  const { a, b, c1 = a, c2 = b } = s;
  const lerp = (p: LinePoint, q: LinePoint) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  const [ab, bc, cd] = [lerp(a, c1), lerp(c1, c2), lerp(c2, b)];
  const [abc, bcd] = [lerp(ab, bc), lerp(bc, cd)];
  return { a: lerp(abc, bcd), c1: bcd, c2: cd, b };
}

const reverse = (s: Segment): Segment => (s.c1 ? { a: s.b, b: s.a, c1: s.c2, c2: s.c1 } : { a: s.b, b: s.a });

// 從起點剪掉一段長度 distance（沿著線量）
function trimSegmentStart(s: Segment, distance: number): Segment {
  if (!s.c1) {
    const t = distance / Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    return { a: { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t }, b: s.b };
  }
  const lengths = cumulativeLengths(s);
  const i = Math.max(1, lengths.findIndex((length) => length >= distance));
  const t = (i - 1 + (distance - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1)) / SAMPLES;
  return cubicFrom(s, t);
}

// 從一端沿著線往內剪掉 distance；剪完不夠長時回傳 null（整條線被箭頭蓋住）
function trimSegments(segments: readonly Segment[], distance: number, atStart: boolean): Segment[] | null {
  const ordered = atStart ? [...segments] : [...segments].reverse().map(reverse);
  let left = distance;
  while (ordered.length > 0) {
    const length = segmentLength(ordered[0]);
    if (length > left) {
      ordered[0] = trimSegmentStart(ordered[0], left);
      return atStart ? ordered : ordered.reverse().map(reverse);
    }
    left -= length;
    ordered.shift();
  }
  return null;
}

// 端點與往線內的方向（單位向量）：起點看第一個不重合的控制點 / 下一點（曲線 = 切線），終點反過來；整條線重合時沒有方向
function endDirection(segments: readonly Segment[], atStart: boolean): { tip: LinePoint; back: Vec } | null {
  const ordered = atStart ? segments : [...segments].reverse().map(reverse);
  if (ordered.length === 0) return null;
  const tip = ordered[0].a;
  for (const s of ordered) {
    for (const point of s.c1 && s.c2 ? [s.c1, s.c2, s.b] : [s.b]) {
      const length = Math.hypot(point.x - tip.x, point.y - tip.y);
      if (length > 1e-9) return { tip, back: { x: (point.x - tip.x) / length, y: (point.y - tip.y) / length } };
    }
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

function endShape(segments: readonly Segment[], end: LineEnd, lineWidth: number, atStart: boolean): EndShape {
  if (end.arrowhead === "none") return NO_END;
  const direction = endDirection(segments, atStart);
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

function segmentCommands(segments: readonly Segment[]): PathCommand[] {
  if (segments.length === 0) return [];
  const builder = new PathBuilder().moveTo(segments[0].a.x, segments[0].a.y);
  for (const s of segments) {
    if (s.c1 && s.c2) builder.cubicTo(s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.b.x, s.b.y);
    else builder.lineTo(s.b.x, s.b.y);
  }
  return builder.build();
}

/**
 * The path through a line's points, without arrowheads or trimming: straight segments, or the
 * smooth curve (Catmull-Rom) through every point. The line tool's preview and `lineLocalBounds` use it.
 *
 * Args:
 *   points: At least one point.
 *   path: `straight` or `smooth`.
 *
 * Returns:
 *   Path commands (M, then L or C).
 */
export function linePathCommands(points: readonly LinePoint[], path: LineElement["path"]): PathCommand[] {
  const segments = lineSegments(points, path);
  if (segments.length === 0) return points.length > 0 ? [{ op: "M", x: points[0].x, y: points[0].y }] : [];
  return segmentCommands(segments);
}

/**
 * Bounding box of a line in its own coordinates: its points, and for a smooth line also where the
 * curve bulges past them (Catmull-Rom can overshoot). Line width and arrowheads are not included
 * (like shape borders).
 *
 * Args:
 *   line: Line element.
 *
 * Returns:
 *   Bounds relative to (x, y).
 */
export function lineLocalBounds(line: Pick<LineElement, "points" | "path">): Bounds {
  const points = linePointBounds(line.points);
  if (line.path !== "smooth") return points;
  const curve = pathBounds(linePathCommands(line.points, "smooth"));
  return curve
    ? {
        minX: Math.min(points.minX, curve.minX),
        minY: Math.min(points.minY, curve.minY),
        maxX: Math.max(points.maxX, curve.maxX),
        maxY: Math.max(points.maxY, curve.maxY),
      }
    : points;
}

/** Miter limit of every format (canvas default; `STROKE_MITER_LIMIT` in Rust): past it a corner is bevelled. */
const MITER_LIMIT = 10;

/**
 * Whether a line is drawn as two parallel thin lines: `compound: "double"` on a straight line or
 * polyline (smooth lines are drawn single, offsetting a curve exactly is not supported).
 *
 * Args:
 *   line: Line element.
 *
 * Returns:
 *   True when drawn double.
 */
export function isDoubleLine(line: Pick<LineElement, "compound" | "path">): boolean {
  return line.compound === "double" && line.path === "straight";
}

/**
 * Width (pt) each drawn line has: the stroke width, or a third of it for a double line (two thin
 * lines with a gap of the same width between them, together as wide as the stroke).
 *
 * Args:
 *   line: Line element.
 *
 * Returns:
 *   Width to stroke `LinePaths.stroke` with (arrowheads keep the full width).
 */
export function lineStrokeWidth(line: Pick<LineElement, "compound" | "path" | "stroke">): number {
  return isDoubleLine(line) ? line.stroke.width / 3 : line.stroke.width;
}

// 折線往左手邊（y 向下時的 (−dy, dx)）平移 offset：轉角取兩條平移線段的交點；夾角太尖（miter 比 > 上限）時斜切成兩點
function offsetPolyline(points: readonly LinePoint[], offset: number): LinePoint[] {
  const p = points.filter((point, i) => i === 0 || !same(point, points[i - 1]));
  if (p.length < 2) return [...p];
  const normal = (a: LinePoint, b: LinePoint): Vec => {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
  };
  const shifted = (point: LinePoint, n: Vec) => ({ x: point.x + n.x * offset, y: point.y + n.y * offset });
  const result = [shifted(p[0], normal(p[0], p[1]))];
  for (let i = 1; i + 1 < p.length; i++) {
    const [n1, n2] = [normal(p[i - 1], p[i]), normal(p[i], p[i + 1])];
    const sum = { x: n1.x + n2.x, y: n1.y + n2.y };
    const sumLength = Math.hypot(sum.x, sum.y);
    // 交點在角平分線上，距離 = offset / cos(半角)；cos(半角) = |n1 + n2| / 2
    const cosHalf = sumLength / 2;
    if (cosHalf < 1 / MITER_LIMIT) {
      result.push(shifted(p[i], n1), shifted(p[i], n2));
    } else {
      const scale = offset / cosHalf / sumLength;
      result.push({ x: p[i].x + sum.x * scale, y: p[i].y + sum.y * scale });
    }
  }
  result.push(shifted(p[p.length - 1], normal(p[p.length - 2], p[p.length - 1])));
  return result;
}

function polylineCommands(points: readonly LinePoint[]): PathCommand[] {
  const builder = new PathBuilder().moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) builder.lineTo(point.x, point.y);
  return builder.build();
}

// 雙線：縮短後的折線往兩側各平移 1/3 線寬（兩條細線的中心距 = 2/3 線寬）
function doubleCommands(segments: readonly Segment[], width: number): PathCommand[] {
  if (segments.length === 0) return [];
  const points = [segments[0].a, ...segments.map((s) => s.b)];
  return [...polylineCommands(offsetPolyline(points, width / 3)), ...polylineCommands(offsetPolyline(points, -width / 3))];
}

/**
 * Paths of a line and its arrowheads: straight segments, or the smooth curve through every point.
 * A double line (`isDoubleLine`) is two parallel subpaths, stroked `lineStrokeWidth` wide.
 *
 * Args:
 *   line: Line element (points, path, compound, stroke width and ends are used).
 *
 * Returns:
 *   The line, filled heads and open heads, relative to (x, y).
 */
export function linePaths(line: Pick<LineElement, "points" | "path" | "compound" | "stroke" | "start" | "end">): LinePaths {
  const width = line.stroke.width;
  let segments: Segment[] | null = lineSegments(line.points, line.path);
  const start = endShape(segments, line.start, width, true);
  const end = endShape(segments, line.end, width, false);
  if (start.trim > 0) segments = trimSegments(segments, start.trim, true);
  if (segments && end.trim > 0) segments = trimSegments(segments, end.trim, false);
  const stroke = !segments ? [] : isDoubleLine(line) ? doubleCommands(segments, width) : segmentCommands(segments);
  return {
    stroke,
    fills: [...start.fill, ...end.fill],
    outlines: [...start.outline, ...end.outline],
  };
}
