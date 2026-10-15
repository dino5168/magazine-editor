import { describe, expect, it } from "vitest";
import { createLineElement } from "../element-factory";
import {
  constrainAngle,
  lineAngle,
  lineLength,
  linePagePoints,
  withLengthAngle,
  withLinePoints,
} from "../line-geometry";
import { ARROWHEAD_LENGTH, ARROWHEAD_MIN_LINE_WIDTH, ARROWHEAD_WIDTH, arrowheadSize, linePaths } from "../line-path";
import type { PathCommand } from "../shape-path";
import type { LineArrowhead, LineElement, LinePoint } from "../types";

const end = (arrowhead: LineArrowhead, scale = 1) => ({ arrowhead, scale });

// 水平線 (0, 0) → (100, 0)，線寬 w
function horizontal(width: number, ends: Partial<Pick<LineElement, "start" | "end">> = {}): LineElement {
  return createLineElement(
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    { stroke: { color: "#000000", swatchId: null, width, dash: "dashed" }, ...ends },
  );
}

const points = (commands: readonly PathCommand[]): LinePoint[] =>
  commands.flatMap((command) => (command.op === "Z" ? [] : [{ x: command.x, y: command.y }]));

describe("arrowheadSize", () => {
  it("scales with the line width, with a minimum so thin lines still get visible heads", () => {
    expect(arrowheadSize(4, 1)).toEqual({ length: 4 * ARROWHEAD_LENGTH, width: 4 * ARROWHEAD_WIDTH });
    expect(arrowheadSize(0.5, 1)).toEqual(arrowheadSize(ARROWHEAD_MIN_LINE_WIDTH, 1));
    expect(arrowheadSize(2, 1.5).length).toBe(1.5 * arrowheadSize(2, 1).length);
  });
});

describe("linePaths", () => {
  it("draws a plain line as one open path through its points", () => {
    const line = createLineElement([
      { x: 0, y: 0 },
      { x: 50, y: 40 },
      { x: 100, y: 0 },
    ]);
    const paths = linePaths(line);
    expect(paths.stroke.map((command) => command.op)).toEqual(["M", "L", "L"]);
    expect(points(paths.stroke)).toEqual(line.points);
    expect(paths.fills).toEqual([]);
    expect(paths.outlines).toEqual([]);
  });

  it("puts a filled head's tip on the end point and hides the line's end inside it", () => {
    const width = 4;
    const paths = linePaths(horizontal(width, { end: end("triangle") }));
    const { length, width: headWidth } = arrowheadSize(width, 1);
    expect(points(paths.fills)).toEqual([
      { x: 100, y: 0 },
      { x: 100 - length, y: -headWidth / 2 },
      { x: 100 - length, y: headWidth / 2 },
    ]);
    expect(paths.fills[paths.fills.length - 1]).toEqual({ op: "Z" });
    // 線停在三角形裡：比尖端短、比底邊長，而且線頭的兩個角在三角形內
    const stop = points(paths.stroke)[1].x;
    expect(stop).toBeLessThan(100);
    expect(stop).toBeGreaterThanOrEqual(100 - length);
    const halfWidthThere = ((100 - stop) * headWidth) / 2 / length;
    expect(halfWidthThere).toBeGreaterThanOrEqual(width / 2 - 1e-9);
    // 起點沒有箭頭，不縮
    expect(points(paths.stroke)[0]).toEqual({ x: 0, y: 0 });
  });

  it("pulls an open head back so its mitred tip lands on the end point", () => {
    const width = 2;
    const paths = linePaths(horizontal(width, { start: end("open") }));
    const [a, apex, b] = points(paths.outlines);
    const { length, width: headWidth } = arrowheadSize(width, 1);
    const half = headWidth / 2;
    // miter 尖角超出折點 (w/2) / sin(θ)
    const miter = width / 2 / (half / Math.hypot(half, length));
    expect(apex.x - miter).toBeCloseTo(0);
    expect(apex.y).toBe(0);
    expect(a).toEqual({ x: apex.x + length, y: half });
    expect(b).toEqual({ x: apex.x + length, y: -half });
    expect(paths.outlines.map((command) => command.op)).toEqual(["M", "L", "L"]);
    // 線縮到被兩撇的外緣蓋住
    expect(points(paths.stroke)[0].x).toBeCloseTo(width / 2 / (half / length));
    expect(paths.fills).toEqual([]);
  });

  it("keeps the heads solid however the line is dashed (they are separate paths)", () => {
    const paths = linePaths(horizontal(2, { start: end("open"), end: end("triangle") }));
    expect(paths.outlines.length).toBeGreaterThan(0);
    expect(paths.fills.length).toBeGreaterThan(0);
  });

  it("points heads along the end segment of a polyline, skipping repeated points", () => {
    const line = createLineElement(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 80 },
        { x: 100, y: 80 },
      ],
      { end: end("triangle") },
    );
    const [tip, a, b] = points(linePaths(line).fills);
    expect(tip).toEqual({ x: 100, y: 80 });
    // 最後一段是往下的，所以底邊在尖端上方、左右對稱
    expect(a.y).toBeCloseTo(b.y);
    expect(a.y).toBeLessThan(80);
    expect((a.x + b.x) / 2).toBeCloseTo(100);
  });

  it("trims across segments and drops the line when the heads cover it", () => {
    const short = createLineElement(
      [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
      ],
      { stroke: { color: "#000000", swatchId: null, width: 4, dash: "solid" }, start: end("triangle"), end: end("triangle") },
    );
    const paths = linePaths(short);
    expect(paths.stroke).toEqual([]);
    expect(points(paths.fills)).toHaveLength(6);
    // 折線：縮短跨過一個很短的最後一段，停在前一段上
    const bent = createLineElement(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 101, y: 0 },
      ],
      { end: end("triangle", 2) },
    );
    const stroke = points(linePaths(bent).stroke);
    expect(stroke).toHaveLength(2);
    expect(stroke[1].x).toBeLessThan(100);
  });

  it("draws no heads when every point is the same", () => {
    const dot = createLineElement(
      [
        { x: 5, y: 5 },
        { x: 5, y: 5 },
      ],
      { start: end("open"), end: end("triangle") },
    );
    expect(linePaths(dot)).toMatchObject({ fills: [], outlines: [] });
  });
});

describe("line geometry", () => {
  it("measures length and angle on the page, rotation included", () => {
    const line = createLineElement([
      { x: 10, y: 10 },
      { x: 40, y: 50 },
    ]);
    expect(lineLength(line.points)).toBe(50);
    expect(lineAngle(line)).toBeCloseTo((Math.atan2(40, 30) * 180) / Math.PI);
    expect(lineAngle({ ...horizontal(1), rotation: 90 })).toBeCloseTo(90);
    expect(lineAngle(createLineElement([{ x: 10, y: 0 }, { x: 0, y: 0 }]))).toBe(180);
  });

  it("moves points to page positions and keeps (x, y) at the top-left of the points", () => {
    const line = horizontal(1);
    const moved = withLinePoints(line, [
      { x: 20, y: 30 },
      { x: -10, y: 60 },
    ]);
    expect(moved).toEqual({
      x: -10,
      y: 30,
      points: [
        { x: 30, y: 0 },
        { x: 0, y: 30 },
      ],
    });
    // 旋轉的線：位置換算後，頁面上的點就是給的點
    const rotated = { ...horizontal(1), x: 50, y: 50, rotation: 30 };
    const target = [
      { x: 60, y: 70 },
      { x: 120, y: 40 },
    ];
    const patch = withLinePoints(rotated, target);
    const page = linePagePoints({ ...rotated, ...patch });
    page.forEach((point, i) => {
      expect(point.x).toBeCloseTo(target[i].x);
      expect(point.y).toBeCloseTo(target[i].y);
    });
    expect(Math.min(...patch.points.map((p) => p.x))).toBeCloseTo(0);
    expect(Math.min(...patch.points.map((p) => p.y))).toBeCloseTo(0);
  });

  it("changes length and angle keeping the first point", () => {
    const line = { ...horizontal(1), x: 20, y: 20 };
    const longer = { ...line, ...withLengthAngle(line, { length: 150 }) };
    expect(linePagePoints(longer)).toEqual([
      { x: 20, y: 20 },
      { x: 170, y: 20 },
    ]);
    const down = { ...line, ...withLengthAngle(line, { angle: 90 }) };
    const [first, last] = linePagePoints(down);
    expect(first).toEqual({ x: 20, y: 20 });
    // 90° 的倍數用精確值：線剛好垂直（「填滿高度」才認得）
    expect(last).toEqual({ x: 20, y: 120 });
  });

  it("constrains a segment to multiples of 45°", () => {
    const anchor = { x: 10, y: 10 };
    expect(constrainAngle(anchor, { x: 110, y: 18 })).toEqual({ x: 110, y: 10 });
    expect(constrainAngle(anchor, { x: 13, y: -90 })).toEqual({ x: 10, y: -90 });
    const diagonal = constrainAngle(anchor, { x: 60, y: 64 });
    expect(diagonal.x - anchor.x).toBeCloseTo(diagonal.y - anchor.y);
  });
});
