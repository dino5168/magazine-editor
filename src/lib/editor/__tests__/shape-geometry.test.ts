import { describe, expect, it } from "vitest";
import { naturalAspect, shapePoints, vertexBounds } from "../shape-geometry";

const pairs = (flat: readonly number[]): [number, number][] =>
  Array.from({ length: flat.length / 2 }, (_, i) => [flat[2 * i], flat[2 * i + 1]]);

describe("shapePoints", () => {
  it("has no vertices for rectangles and ellipses", () => {
    expect(shapePoints({ kind: "rect", cornerRadius: 0 }, 10, 10)).toBeNull();
    expect(shapePoints({ kind: "ellipse" }, 10, 10)).toBeNull();
  });

  it("stretches the vertices to touch every edge of the box", () => {
    const points = pairs(shapePoints({ kind: "star", numPoints: 5, innerRatio: 0.4 }, 200, 100)!);
    expect(points).toHaveLength(10);
    expect(vertexBounds(points)).toEqual({ minX: 0, minY: 0, maxX: 200, maxY: 100 });
  });

  it("matches the vertices Rust exports for the fixture star", () => {
    // tests/fixtures/sample.magproj 的星形；數字取自 EPUB 匯出的 <polygon points>（4 位小數）
    const points = pairs(
      shapePoints({ kind: "star", numPoints: 5, innerRatio: 30 / 70 }, 133.1479122813215, 126.63118960624632)!,
    );
    const expected = [
      [66.574, 0], [84.2075, 45.7295], [133.1479, 48.3688], [95.1057, 79.2705], [107.7189, 126.6312],
      [66.574, 100], [25.429, 126.6312], [38.0423, 79.2705], [0, 48.3688], [48.9404, 45.7295],
    ];
    points.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(expected[i][0], 3);
      expect(y).toBeCloseTo(expected[i][1], 3);
    });
  });

  it("puts the triangle's apex at the top centre", () => {
    const [apexX, apexY] = shapePoints({ kind: "polygon", sides: 3 }, 120, 90)!;
    expect(apexX).toBeCloseTo(60);
    expect(apexY).toBeCloseTo(0);
  });
});

describe("naturalAspect", () => {
  it("is √3 : 1.5 for an equilateral triangle and 1 for boxes", () => {
    expect(naturalAspect({ kind: "polygon", sides: 3 })).toBeCloseTo(Math.sqrt(3) / 1.5);
    expect(naturalAspect({ kind: "ellipse" })).toBe(1);
  });
});
