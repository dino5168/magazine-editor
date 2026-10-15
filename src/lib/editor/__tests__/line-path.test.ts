import { describe, expect, it } from "vitest";
import { createLineElement } from "../element-factory";
import {
  constrainAngle,
  insertLinePoint,
  removeLinePoint,
  simplifyPoints,
  lineAngle,
  lineLength,
  linePagePoints,
  withLengthAngle,
  withLinePoints,
} from "../line-geometry";
import {
  ARROWHEAD_LENGTH,
  ARROWHEAD_MIN_LINE_WIDTH,
  ARROWHEAD_WIDTH,
  arrowheadSize,
  isDoubleLine,
  lineLocalBounds,
  lineStrokeWidth,
  linePathCommands,
  linePaths,
} from "../line-path";
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

describe("adding and removing points", () => {
  const zigzag = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it("adds a point on the closest segment, at the spot closest to the click", () => {
    expect(insertLinePoint(zigzag, { x: 40, y: 5 })).toEqual({
      points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
      index: 1,
    });
    expect(insertLinePoint(zigzag, { x: 96, y: 70 })).toMatchObject({ index: 2, points: [zigzag[0], zigzag[1], { x: 100, y: 70 }, zigzag[2]] });
    // 線段外面：夾在端點
    expect(insertLinePoint(zigzag, { x: -30, y: 0 }).points[1]).toEqual({ x: 0, y: 0 });
  });

  it("removes a point but keeps at least two", () => {
    expect(removeLinePoint(zigzag, 1)).toEqual([zigzag[0], zigzag[2]]);
    expect(removeLinePoint(zigzag.slice(0, 2), 0)).toBeNull();
    expect(removeLinePoint(zigzag, 5)).toBeNull();
  });
});

describe("smooth lines", () => {
  const wave = [
    { x: 0, y: 50 },
    { x: 60, y: 0 },
    { x: 120, y: 50 },
    { x: 180, y: 0 },
  ];
  const curve = (ends: Partial<Pick<LineElement, "start" | "end">> = {}, points = wave) =>
    ({ ...createLineElement(points, { path: "smooth", ...ends }), points }) as LineElement;

  it("goes through every point with cubic segments", () => {
    const { stroke } = linePaths(curve());
    expect(stroke.map((command) => command.op)).toEqual(["M", "C", "C", "C"]);
    // C 的終點就是下一個點
    expect(points(stroke)).toEqual(wave);
    // 和 linePathCommands（工具的預覽、外框用）是同一條
    expect(stroke).toEqual(linePathCommands(wave, "smooth"));
  });

  it("drops repeated points instead of making zero-length pieces", () => {
    const repeated = [wave[0], wave[1], wave[1], wave[2]];
    expect(linePaths(curve({}, repeated)).stroke.map((command) => command.op)).toEqual(["M", "C", "C"]);
  });

  it("points arrowheads along the curve's tangent and trims the curve under a filled head", () => {
    const line = curve({ end: { arrowhead: "triangle", scale: 1 } });
    const paths = linePaths(line);
    const [tip, a, b] = points(paths.fills);
    expect(tip).toEqual(wave[3]);
    // 終點的切線方向 = 最後一段的第二個控制點 → 終點
    const last = linePathCommands(wave, "smooth")[3] as Extract<PathCommand, { op: "C" }>;
    const tangent = Math.atan2(last.y - last.y2, last.x - last.x2);
    const base = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    expect(Math.atan2(tip.y - base.y, tip.x - base.x)).toBeCloseTo(tangent);
    // 縮短後的終點在原本的曲線上（沿曲線剪，不是剪直線）、離尖端 = 縮短的長度
    const trimmed = points(paths.stroke);
    const end = trimmed[trimmed.length - 1];
    expect(Math.hypot(end.x - tip.x, end.y - tip.y)).toBeGreaterThan(0);
    expect(Math.hypot(end.x - tip.x, end.y - tip.y)).toBeLessThanOrEqual(arrowheadSize(line.stroke.width, 1).length + 1e-6);
    expect(paths.stroke.map((command) => command.op)).toEqual(["M", "C", "C", "C"]);
  });

  it("bounds include where the curve bulges past its points", () => {
    // 轉直角：曲線在 (100, 0) 的切線斜向右下，會鼓出 x = 100 外面
    const corner = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    const line = curve({}, corner);
    expect(lineLocalBounds(line).maxX).toBeGreaterThan(100);
    // 直線的外框就是點的外框
    expect(lineLocalBounds({ ...line, path: "straight" })).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
  });
});

describe("simplifyPoints", () => {
  it("keeps both ends and the corners, drops points along straight runs", () => {
    const run = [
      ...Array.from({ length: 50 }, (_, i) => ({ x: i * 2, y: 0.3 * Math.sin(i) })),
      ...Array.from({ length: 50 }, (_, i) => ({ x: 100, y: i * 2 })),
    ];
    const simple = simplifyPoints(run, 1, 500);
    expect(simple[0]).toEqual(run[0]);
    expect(simple[simple.length - 1]).toEqual(run[run.length - 1]);
    expect(simple.length).toBeLessThanOrEqual(4);
    // 轉角那一點留著
    expect(simple.some((p) => Math.hypot(p.x - 98, p.y) < 3)).toBe(true);
  });

  it("raises the tolerance until the stroke fits the point limit", () => {
    const scribble = Array.from({ length: 3000 }, (_, i) => ({ x: i * 0.5, y: 20 * Math.sin(i / 5) }));
    const simple = simplifyPoints(scribble, 0.5, 100);
    expect(simple.length).toBeLessThanOrEqual(100);
    expect(simple.length).toBeGreaterThanOrEqual(2);
  });

  it("returns a closed loop as its start, farthest point and end", () => {
    const loop = Array.from({ length: 41 }, (_, i) => ({ x: Math.cos((i / 40) * 2 * Math.PI) * 50, y: Math.sin((i / 40) * 2 * Math.PI) * 50 }));
    expect(simplifyPoints(loop, 1, 500).length).toBeGreaterThan(3);
  });
});

describe("double lines", () => {
  const double = (pts: LinePoint[], width = 3, extra: Partial<LineElement> = {}) =>
    ({ ...createLineElement(pts, { compound: "double", stroke: { color: "#000000", swatchId: null, width, dash: "solid" } }), points: pts, ...extra }) as LineElement;
  const subpaths = (commands: readonly PathCommand[]) =>
    commands.reduce<LinePoint[][]>((all, command) => {
      if (command.op === "M") all.push([{ x: command.x, y: command.y }]);
      else if (command.op === "L") all[all.length - 1].push({ x: command.x, y: command.y });
      return all;
    }, []);

  it("draws two parallel lines a third of the width each, 2/3 of the width apart", () => {
    const line = double([
      { x: 0, y: 0 },
      { x: 90, y: 0 },
    ]);
    expect(lineStrokeWidth(line)).toBe(1);
    expect(subpaths(linePaths(line).stroke)).toEqual([
      [{ x: 0, y: 1 }, { x: 90, y: 1 }],
      [{ x: 0, y: -1 }, { x: 90, y: -1 }],
    ]);
  });

  it("meets at a mitred corner, and bevels corners sharper than the miter limit", () => {
    const corner = double([
      { x: 0, y: 0 },
      { x: 90, y: 0 },
      { x: 90, y: 90 },
    ]);
    const [left, right] = subpaths(linePaths(corner).stroke);
    // 直角：兩條平移線段的交點
    expect(left[1].x).toBeCloseTo(89);
    expect(left[1].y).toBeCloseTo(1);
    expect(right[1].x).toBeCloseTo(91);
    expect(right[1].y).toBeCloseTo(-1);
    // 原路折返（0°）：斜切成兩點
    const folded = double([
      { x: 0, y: 0 },
      { x: 90, y: 0 },
      { x: 0, y: 0.5 },
    ]);
    expect(subpaths(linePaths(folded).stroke)[0]).toHaveLength(4);
  });

  it("is single for smooth lines and keeps the arrowheads at the full width", () => {
    const smooth = double(
      [
        { x: 0, y: 0 },
        { x: 50, y: 30 },
        { x: 100, y: 0 },
      ],
      3,
      { path: "smooth" },
    );
    expect(isDoubleLine(smooth)).toBe(false);
    expect(lineStrokeWidth(smooth)).toBe(3);
    const arrow = double([{ x: 0, y: 0 }, { x: 90, y: 0 }], 3, { end: { arrowhead: "triangle", scale: 1 } });
    const [tip, a] = points(linePaths(arrow).fills);
    expect(tip).toEqual({ x: 90, y: 0 });
    expect(Math.abs(a.y)).toBeCloseTo(arrowheadSize(3, 1).width / 2);
  });
});
