/**
 * 線條（`LineElement`）的幾何：外接框、點的正規化、長度 / 角度。
 *
 * 線條以點定義；(x, y) 一律是點的外接框左上角，所以和其他物件一樣能用外框做框選、捲動範圍、
 * 跨頁與尺規。計畫：`docs/06-Plans-繪圖/03-自由繪圖-實作.md`。
 */
import type { Bounds, LineElement, LinePoint } from "./types";

/**
 * Bounding box of points (in the points' own coordinates).
 *
 * Args:
 *   points: At least one point.
 *
 * Returns:
 *   The smallest box containing every point; zero width / height for horizontal / vertical lines.
 */
export function linePointBounds(points: readonly LinePoint[]): Bounds {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { x, y } of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Splits points given on the page into a line position and points relative to it, so the
 * position is the top-left corner of the points' bounding box (for unrotated lines).
 *
 * Args:
 *   pagePoints: At least one point, in page coordinates.
 *
 * Returns:
 *   `x` / `y` and the points relative to them.
 */
export function normalizeLinePoints(pagePoints: readonly LinePoint[]): {
  readonly x: number;
  readonly y: number;
  readonly points: readonly LinePoint[];
} {
  const { minX, minY } = linePointBounds(pagePoints);
  return { x: minX, y: minY, points: pagePoints.map((point) => ({ x: point.x - minX, y: point.y - minY })) };
}

// 繞原點順時針轉 deg 度（y 向下，和 Konva 的 rotation 相同）
function rotate({ x, y }: LinePoint, deg: number): LinePoint {
  if (deg === 0) return { x, y };
  const rad = (deg * Math.PI) / 180;
  const [cos, sin] = [Math.cos(rad), Math.sin(rad)];
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

/**
 * Where a line's points are on the page (its rotation applied around (x, y)).
 *
 * Args:
 *   line: Line element.
 *
 * Returns:
 *   The points in page coordinates.
 */
export function linePagePoints(line: Pick<LineElement, "x" | "y" | "rotation" | "points">): LinePoint[] {
  return line.points.map((point) => {
    const turned = rotate(point, line.rotation);
    return { x: line.x + turned.x, y: line.y + turned.y };
  });
}

/**
 * Patch that moves a line's points to new page positions (dragging a point, typing a length),
 * keeping its rotation and keeping (x, y) at the top-left corner of the points' bounding box in
 * the line's own (rotated) frame.
 *
 * Args:
 *   line: Line element (position and rotation are used).
 *   pagePoints: New points in page coordinates, as many as the line should have.
 *
 * Returns:
 *   `{ x, y, points }` for `element/update`.
 */
export function withLinePoints(
  line: Pick<LineElement, "x" | "y" | "rotation">,
  pagePoints: readonly LinePoint[],
): { readonly x: number; readonly y: number; readonly points: readonly LinePoint[] } {
  // 換回線條自己的座標（反向旋轉），再把外框左上角移到原點
  const local = pagePoints.map((point) => rotate({ x: point.x - line.x, y: point.y - line.y }, -line.rotation));
  const { minX, minY } = linePointBounds(local);
  const origin = rotate({ x: minX, y: minY }, line.rotation);
  return {
    x: line.x + origin.x,
    y: line.y + origin.y,
    points: local.map((point) => ({ x: point.x - minX, y: point.y - minY })),
  };
}

/**
 * Length of a line along its points (pt; a smooth line is measured along its points too).
 *
 * Args:
 *   points: Line points.
 *
 * Returns:
 *   Sum of the segment lengths.
 */
export function lineLength(points: readonly LinePoint[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return length;
}

/**
 * Angle of a straight line from its first to its last point on the page: degrees, 0 = to the
 * right, clockwise (y down, like rotation), in (−180, 180].
 *
 * Args:
 *   line: Line element.
 *
 * Returns:
 *   The angle, 0 when both ends coincide.
 */
export function lineAngle(line: Pick<LineElement, "x" | "y" | "rotation" | "points">): number {
  const page = linePagePoints(line);
  const [first, last] = [page[0], page[page.length - 1]];
  const deg = (Math.atan2(last.y - first.y, last.x - first.x) * 180) / Math.PI;
  // −180 與 180 是同一個方向，統一成 180；−0 也統一成 0
  return deg === -180 ? 180 : deg + 0;
}

// 90° 的倍數給精確值（Math.cos(π/2) 不是 0）：輸入 90° 的線要剛好垂直，「填滿高度」才認得
function unitDirection(deg: number): readonly [number, number] {
  const quarter = deg / 90;
  if (Number.isInteger(quarter)) {
    const exact = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ] as const;
    return exact[((quarter % 4) + 4) % 4];
  }
  const rad = (deg * Math.PI) / 180;
  return [Math.cos(rad), Math.sin(rad)];
}

/**
 * Patch that gives a two-point line a new length and / or angle, keeping its first point where it
 * is (the property panel's 長度 / 角度).
 *
 * Args:
 *   line: Two-point line.
 *   change: New length (pt, > 0) and / or angle (degrees, see `lineAngle`).
 *
 * Returns:
 *   `{ x, y, points }` for `element/update`.
 */
export function withLengthAngle(
  line: Pick<LineElement, "x" | "y" | "rotation" | "points">,
  change: { readonly length?: number; readonly angle?: number },
): { readonly x: number; readonly y: number; readonly points: readonly LinePoint[] } {
  const [first] = linePagePoints(line);
  const length = change.length ?? lineLength(line.points);
  const [cos, sin] = unitDirection(change.angle ?? lineAngle(line));
  return withLinePoints(line, [first, { x: first.x + length * cos, y: first.y + length * sin }]);
}

/**
 * Moves a point so the segment from `anchor` runs at a multiple of 45° (Shift while drawing or
 * dragging a point), keeping its length along that direction.
 *
 * Args:
 *   anchor: The fixed end of the segment.
 *   point: Where the pointer is.
 *
 * Returns:
 *   The constrained point.
 */
export function constrainAngle(anchor: LinePoint, point: LinePoint): LinePoint {
  const [dx, dy] = [point.x - anchor.x, point.y - anchor.y];
  const step = Math.PI / 4;
  const rad = Math.round(Math.atan2(dy, dx) / step) * step;
  // 投影到 45° 方向上；水平 / 垂直時把另一軸精確歸零
  const [cos, sin] = [Math.round(Math.cos(rad) * 1e12) / 1e12, Math.round(Math.sin(rad) * 1e12) / 1e12];
  const length = dx * cos + dy * sin;
  return { x: anchor.x + length * cos, y: anchor.y + length * sin };
}
