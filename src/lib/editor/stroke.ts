import type { Stroke } from "./types";

/** Dash pattern in pt. */
export interface DashPattern {
  readonly dash: number;
  readonly gap: number;
  /** Round caps turn the zero-length dashes of a dotted line into dots. */
  readonly roundCap: boolean;
}

/** Stroke added when the outline is switched on in the property panel. */
export const DEFAULT_STROKE: Stroke = { color: "#171717", width: 1, dash: "solid" };

/**
 * Returns the dash pattern of a stroke style. Same numbers as `dash_pattern` in Rust `render.rs`,
 * so the canvas, the PDF and the EPUB draw the same dashes.
 *
 * Args:
 *   dash: Stroke style.
 *   width: Stroke width in pt.
 *
 * Returns:
 *   The pattern, or null for a solid line.
 */
export function dashPattern(dash: Stroke["dash"], width: number): DashPattern | null {
  switch (dash) {
    case "solid":
      return null;
    case "dashed":
      return { dash: 3 * width, gap: 3 * width, roundCap: false };
    case "dotted":
      return { dash: 0, gap: 2 * width, roundCap: true };
    default: {
      const exhaustive: never = dash;
      return exhaustive;
    }
  }
}

/**
 * Konva attributes for a shape's outline. The stroke is centred on the edge, like Typst and SVG;
 * miter joins use the canvas default limit (10), which the PDF and EPUB set explicitly.
 *
 * Args:
 *   stroke: Stroke, or null for none.
 *
 * Returns:
 *   Attributes to spread onto a Konva shape.
 */
export function konvaStroke(stroke: Stroke | null) {
  if (!stroke) return { strokeEnabled: false } as const;
  const pattern = dashPattern(stroke.dash, stroke.width);
  return {
    stroke: stroke.color,
    strokeWidth: stroke.width,
    dash: pattern ? [pattern.dash, pattern.gap] : undefined,
    dashEnabled: pattern !== null,
    lineCap: pattern?.roundCap ? "round" : "butt",
    lineJoin: "miter",
  } as const;
}
