import svgpath from "svgpath";
import type { Bounds } from "./types";

/**
 * One command of a shape-library outline, in pt relative to the shape's box. Only these four:
 * Konva, Typst `curve` and SVG `<path>` draw them the same way (arcs are turned into cubics first).
 * Like SVG, `M` starts a subpath and `Z` closes the current one; a subpath without `Z` stays open.
 */
export type PathCommand =
  | { readonly op: "M"; readonly x: number; readonly y: number }
  | { readonly op: "L"; readonly x: number; readonly y: number }
  | {
      readonly op: "C";
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly x: number;
      readonly y: number;
    }
  | { readonly op: "Z" };

/** Cubic Bézier factor for a quarter circle; same as `KAPPA` in Rust `export/render.rs`. */
export const KAPPA = 0.5522847498307936;

// 單位圓上的點；90° 的倍數給精確值（Math.cos(π/2) 不是 0），弧的端點才剛好落在外框上
function unitPoint(deg: number): readonly [number, number] {
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
 * Collects path commands. Angles are in degrees and, like the canvas, clockwise from +x with y
 * pointing down (90 = straight down).
 */
export class PathBuilder {
  private readonly commands: PathCommand[] = [];

  moveTo(x: number, y: number): this {
    this.commands.push({ op: "M", x, y });
    return this;
  }

  lineTo(x: number, y: number): this {
    this.commands.push({ op: "L", x, y });
    return this;
  }

  cubicTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): this {
    this.commands.push({ op: "C", x1, y1, x2, y2, x, y });
    return this;
  }

  /**
   * Adds an elliptical arc from the current point, which must be where the arc starts: the point
   * at `fromDeg` on the ellipse centred at (cx, cy). Split into pieces of at most 90° so each is a
   * close cubic approximation (a quarter is exactly `KAPPA`).
   *
   * Args:
   *   cx, cy: Centre of the ellipse.
   *   rx, ry: Radii.
   *   fromDeg: Start angle.
   *   toDeg: End angle; smaller than `fromDeg` goes counter-clockwise.
   */
  arc(cx: number, cy: number, rx: number, ry: number, fromDeg: number, toDeg: number): this {
    const pieces = Math.max(1, Math.ceil(Math.abs(toDeg - fromDeg) / 90 - 1e-9));
    const stepDeg = (toDeg - fromDeg) / pieces;
    // 一段弧的控制點長度：4/3 · tan(θ/4)（90° 時就是 KAPPA）
    const k = (4 / 3) * Math.tan((stepDeg * Math.PI) / 720);
    for (let n = 0; n < pieces; n++) {
      const [cos0, sin0] = unitPoint(fromDeg + n * stepDeg);
      const [cos1, sin1] = unitPoint(fromDeg + (n + 1) * stepDeg);
      this.cubicTo(
        cx + rx * (cos0 - k * sin0),
        cy + ry * (sin0 + k * cos0),
        cx + rx * (cos1 + k * sin1),
        cy + ry * (sin1 - k * cos1),
        cx + rx * cos1,
        cy + ry * sin1,
      );
    }
    return this;
  }

  close(): this {
    this.commands.push({ op: "Z" });
    return this;
  }

  build(): PathCommand[] {
    return [...this.commands];
  }
}

/**
 * Turns SVG path data into M / L / C / Z commands (absolute; arcs, quadratics and shorthands
 * become cubics), using `svgpath` instead of a parser of our own.
 *
 * Args:
 *   d: SVG path data, any commands.
 *
 * Returns:
 *   Commands in the same coordinates as `d`.
 */
export function svgPathCommands(d: string): PathCommand[] {
  const commands: PathCommand[] = [];
  // iterate 的 x / y 是這一段開始時的目前點（abs() 之後所有座標都是絕對的）
  svgpath(d)
    .abs()
    .unarc()
    .unshort()
    .iterate((segment, _index, x, y) => {
      const [op, ...n] = segment as [string, ...number[]];
      switch (op) {
        case "M":
          commands.push({ op: "M", x: n[0], y: n[1] });
          break;
        case "L":
          commands.push({ op: "L", x: n[0], y: n[1] });
          break;
        case "H":
          commands.push({ op: "L", x: n[0], y });
          break;
        case "V":
          commands.push({ op: "L", x, y: n[0] });
          break;
        case "C":
          commands.push({ op: "C", x1: n[0], y1: n[1], x2: n[2], y2: n[3], x: n[4], y: n[5] });
          break;
        case "Q": {
          // 二次換成三次：控制點往兩端各取 2/3
          const [qx, qy, ex, ey] = n;
          commands.push({
            op: "C",
            x1: x + (2 / 3) * (qx - x),
            y1: y + (2 / 3) * (qy - y),
            x2: ex + (2 / 3) * (qx - ex),
            y2: ey + (2 / 3) * (qy - ey),
            x: ex,
            y: ey,
          });
          break;
        }
        case "Z":
          commands.push({ op: "Z" });
          break;
        default:
          throw new Error(`unsupported SVG path command ${op}`);
      }
    });
  return commands;
}

// 三次曲線一個軸向的極值位置（t ∈ (0, 1)）：導函數 = 0 的根
function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const roots: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) roots.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sqrt = Math.sqrt(disc);
      roots.push((-b + sqrt) / (2 * a), (-b - sqrt) / (2 * a));
    }
  }
  return roots.filter((t) => t > 0 && t < 1);
}

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/**
 * The exact bounds of what a path draws (curve extremes, not control points).
 *
 * Args:
 *   commands: Path commands.
 *
 * Returns:
 *   Bounds, or null for a path without points.
 */
export function pathBounds(commands: readonly PathCommand[]): Bounds | null {
  const xs: number[] = [];
  const ys: number[] = [];
  let [x, y] = [0, 0];
  let start = { x: 0, y: 0 };
  for (const command of commands) {
    switch (command.op) {
      case "M":
        start = { x: command.x, y: command.y };
        [x, y] = [command.x, command.y];
        xs.push(x);
        ys.push(y);
        break;
      case "L":
        [x, y] = [command.x, command.y];
        xs.push(x);
        ys.push(y);
        break;
      case "C": {
        const { x1, y1, x2, y2 } = command;
        for (const t of cubicExtrema(x, x1, x2, command.x)) xs.push(cubicAt(x, x1, x2, command.x, t));
        for (const t of cubicExtrema(y, y1, y2, command.y)) ys.push(cubicAt(y, y1, y2, command.y, t));
        [x, y] = [command.x, command.y];
        xs.push(x);
        ys.push(y);
        break;
      }
      case "Z":
        [x, y] = [start.x, start.y];
        break;
    }
  }
  if (xs.length === 0) return null;
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/**
 * Maps every point of a path with a function.
 *
 * Args:
 *   commands: Path commands.
 *   map: Point mapping.
 *
 * Returns:
 *   New commands.
 */
export function mapPath(
  commands: readonly PathCommand[],
  map: (x: number, y: number) => readonly [number, number],
): PathCommand[] {
  return commands.map((command) => {
    switch (command.op) {
      case "M":
      case "L": {
        const [x, y] = map(command.x, command.y);
        return { op: command.op, x, y };
      }
      case "C": {
        const [x1, y1] = map(command.x1, command.y1);
        const [x2, y2] = map(command.x2, command.y2);
        const [x, y] = map(command.x, command.y);
        return { op: "C", x1, y1, x2, y2, x, y };
      }
      case "Z":
        return command;
    }
  });
}

/**
 * Stretches paths so that together they touch every edge of a `width` × `height` box, the way
 * polygons and stars are stretched. The bounds come from the first path (the outline); the others
 * (details) move with it.
 *
 * Args:
 *   paths: Outline first, then any details, in the same coordinates.
 *   width, height: Box size in pt.
 *
 * Returns:
 *   The paths in box coordinates.
 */
export function fitPaths(paths: readonly (readonly PathCommand[])[], width: number, height: number): PathCommand[][] {
  const bounds = pathBounds(paths[0] ?? []);
  if (!bounds) return paths.map((path) => [...path]);
  const sx = bounds.maxX > bounds.minX ? width / (bounds.maxX - bounds.minX) : 0;
  const sy = bounds.maxY > bounds.minY ? height / (bounds.maxY - bounds.minY) : 0;
  return paths.map((path) => mapPath(path, (x, y) => [(x - bounds.minX) * sx, (y - bounds.minY) * sy]));
}

// 去掉多餘的 0，最多 3 位小數（pt 的千分之一，畫面與 SVG 圖示都看不出差別）
function num(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/**
 * SVG path data (`d`) of commands, for Konva `Path` and the panel's icons.
 *
 * Args:
 *   commands: Path commands.
 *
 * Returns:
 *   Path data such as `M0 0 L10 0 Z`.
 */
export function pathData(commands: readonly PathCommand[]): string {
  return commands
    .map((command) => {
      switch (command.op) {
        case "M":
        case "L":
          return `${command.op}${num(command.x)} ${num(command.y)}`;
        case "C":
          return `C${[command.x1, command.y1, command.x2, command.y2, command.x, command.y].map(num).join(" ")}`;
        case "Z":
          return "Z";
      }
    })
    .join(" ");
}
