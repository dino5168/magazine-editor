import { describe, expect, it } from "vitest";
import { fitPaths, KAPPA, PathBuilder, pathBounds, pathData, svgPathCommands, type PathCommand } from "../shape-path";

const ops = (commands: readonly PathCommand[]) => commands.map((command) => command.op).join("");

describe("PathBuilder.arc", () => {
  it("draws a quarter with the KAPPA control points used by Rust", () => {
    const [, quarter] = new PathBuilder().moveTo(10, 0).arc(0, 0, 10, 10, 0, 90).build();
    if (quarter.op !== "C") throw new Error("expected a cubic");
    expect([quarter.x, quarter.y]).toEqual([0, 10]);
    expect(quarter.x1).toBeCloseTo(10);
    expect(quarter.y1).toBeCloseTo(10 * KAPPA);
    expect(quarter.x2).toBeCloseTo(10 * KAPPA);
    expect(quarter.y2).toBeCloseTo(10);
  });

  it("splits long arcs into pieces of at most 90° and runs counter-clockwise when asked", () => {
    const full = new PathBuilder().moveTo(10, 0).arc(0, 0, 10, 5, 0, 360).build();
    expect(ops(full)).toBe("MCCCC");
    const last = full[full.length - 1];
    if (last.op !== "C") throw new Error("expected a cubic");
    expect(last.x).toBe(10);
    expect(last.y).toBeCloseTo(0, 12);
    // 180 → 0：經過下方（90°）
    const lower = new PathBuilder().moveTo(-10, 0).arc(0, 0, 10, 10, 180, 0).build();
    expect(pathBounds(lower)).toMatchObject({ minY: expect.closeTo(0), maxY: expect.closeTo(10) });
  });
});

describe("svgPathCommands", () => {
  it("leaves only absolute M / L / C / Z", () => {
    const commands = svgPathCommands("m0 0 h10 v10 q-10 0 -10 -10 z M20 0 A5 5 0 0 1 30 0 s5 5 10 0");
    expect(ops(commands)).toMatch(/^MLLCZMC+$/);
    expect(commands[1]).toEqual({ op: "L", x: 10, y: 0 });
    expect(commands[2]).toEqual({ op: "L", x: 10, y: 10 });
    // 二次曲線換成三次：起點 (10, 10)、控制點 (0, 10)、終點 (0, 0)
    expect(commands[3]).toMatchObject({ op: "C", x1: expect.closeTo(10 / 3), y1: 10, x2: 0, y2: expect.closeTo(20 / 3), x: 0, y: 0 });
    expect(commands[5]).toEqual({ op: "M", x: 20, y: 0 });
  });
});

describe("pathBounds", () => {
  it("uses the curve's extremes, not its control points", () => {
    const circle = new PathBuilder().moveTo(10, 0).arc(0, 0, 10, 10, 0, 360).close().build();
    const bounds = pathBounds(circle)!;
    expect(bounds.minX).toBeCloseTo(-10);
    expect(bounds.maxX).toBeCloseTo(10);
    expect(bounds.minY).toBeCloseTo(-10);
    expect(bounds.maxY).toBeCloseTo(10);
    expect(pathBounds([])).toBeNull();
  });
});

describe("fitPaths", () => {
  it("stretches the outline to touch every edge and moves the details with it", () => {
    const outline = svgPathCommands("M10 10 L30 10 L30 20 L10 20 Z");
    const details = svgPathCommands("M20 10 L20 20");
    const [fitted, fittedDetails] = fitPaths([outline, details], 200, 50);
    expect(pathBounds(fitted)).toEqual({ minX: 0, minY: 0, maxX: 200, maxY: 50 });
    expect(fittedDetails).toEqual([
      { op: "M", x: 100, y: 0 },
      { op: "L", x: 100, y: 50 },
    ]);
  });
});

describe("pathData", () => {
  it("writes compact SVG path data", () => {
    const commands = new PathBuilder().moveTo(0, 0).lineTo(1 / 3, -0).cubicTo(1, 2, 3, 4, 5, 6.00004).close().build();
    expect(pathData(commands)).toBe("M0 0 L0.333 0 C1 2 3 4 5 6 Z");
  });
});
