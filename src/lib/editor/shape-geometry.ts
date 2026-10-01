import type { Bounds, ShapeGeometry } from "./types";

type Vertex = readonly [number, number];

// 與 Rust 的 project/shape.rs 相同公式：Konva 的正多邊形頂點（半徑 1、第一個頂點朝上）
function regularPoints(radii: readonly number[], count: number): Vertex[] {
  return Array.from({ length: count }, (_, n) => {
    const radius = radii[n % radii.length];
    const angle = (n * 2 * Math.PI) / count;
    return [radius * Math.sin(angle), -radius * Math.cos(angle)] as const;
  });
}

/**
 * Returns the unit vertices of a polygon or star geometry (null for rect / ellipse).
 *
 * Args:
 *   geometry: Shape geometry.
 *
 * Returns:
 *   Vertices around the origin with outer radius 1, or null when the shape has no vertices.
 */
export function unitVertices(geometry: ShapeGeometry): Vertex[] | null {
  switch (geometry.kind) {
    case "rect":
    case "ellipse":
      return null;
    case "polygon":
      return regularPoints([1], Math.max(3, Math.floor(geometry.sides)));
    case "star":
      return regularPoints([1, geometry.innerRatio], Math.max(2, Math.floor(geometry.numPoints)) * 2);
    default: {
      const exhaustive: never = geometry;
      return exhaustive;
    }
  }
}

/**
 * Computes the bounds of a vertex list.
 *
 * Args:
 *   points: Vertices.
 *
 * Returns:
 *   Bounds of the vertices.
 */
export function vertexBounds(points: readonly Vertex[]): Bounds {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/**
 * Returns the vertices of a polygon or star stretched to fill a box, as a flat list for Konva.
 *
 * Args:
 *   geometry: Shape geometry.
 *   width: Box width in pt.
 *   height: Box height in pt.
 *
 * Returns:
 *   `[x0, y0, x1, y1, …]` relative to the box's top-left corner (touching every edge), or null for
 *   rect / ellipse.
 */
export function shapePoints(geometry: ShapeGeometry, width: number, height: number): number[] | null {
  const unit = unitVertices(geometry);
  if (!unit) return null;
  const { minX, minY, maxX, maxY } = vertexBounds(unit);
  return unit.flatMap(([x, y]) => [((x - minX) / (maxX - minX)) * width, ((y - minY) / (maxY - minY)) * height]);
}

/**
 * Returns the width / height ratio a shape has when it is not stretched (1 for rect / ellipse).
 *
 * Args:
 *   geometry: Shape geometry.
 *
 * Returns:
 *   Natural aspect ratio.
 */
export function naturalAspect(geometry: ShapeGeometry): number {
  const unit = unitVertices(geometry);
  if (!unit) return 1;
  const { minX, minY, maxX, maxY } = vertexBounds(unit);
  return (maxX - minX) / (maxY - minY);
}
