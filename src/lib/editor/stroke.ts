import type { GuideLineStyle } from "@/lib/preferences/preferences";
import type { ContentGuideLine } from "./geometry";
import { colorAlpha, withAlpha } from "./palette";
import type { Stroke } from "./types";

/** Dash pattern in pt. */
export interface DashPattern {
  /** Dash, gap, dash, gap… lengths (Konva `dash`, SVG `stroke-dasharray`, Typst `dash.array`). */
  readonly segments: readonly number[];
  /** Round caps turn the zero-length dashes of a dotted line into dots. */
  readonly roundCap: boolean;
}

/** Stroke added when the outline is switched on in the property panel. */
export const DEFAULT_STROKE: Stroke = { color: "#171717", swatchId: null, width: 1, dash: "solid" };

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
      return { segments: [3 * width, 3 * width], roundCap: false };
    case "dotted":
      return { segments: [0, 2 * width], roundCap: true };
    // 點劃線：長劃、空、短劃（平頭，長度 = 線寬，看起來是方點）、空
    case "dashDot":
      return { segments: [4 * width, 2 * width, width, 2 * width], roundCap: false };
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
    dash: pattern ? [...pattern.segments] : undefined,
    dashEnabled: pattern !== null,
    lineCap: pattern?.roundCap ? "round" : "butt",
    lineJoin: "miter",
  } as const;
}

/** How much a content guide line differs from its style: the 1/2 lines stand out, 1/4 and 3/4 are lighter. */
export interface GuideLineEmphasis {
  readonly widthScale: number;
  readonly alphaScale: number;
}

// 加入樣式設定前的外觀：1/2 線 1.5 px、不透明度 0.85；1/4 線 1 px、0.55（≈ 0.85 × 0.65）
export const CONTENT_GUIDE_EMPHASIS = {
  half: { widthScale: 1.5, alphaScale: 1 },
  quarter: { widthScale: 1, alphaScale: 0.65 },
} as const satisfies Record<ContentGuideLine["emphasis"], GuideLineEmphasis>;

const NO_EMPHASIS: GuideLineEmphasis = { widthScale: 1, alphaScale: 1 };

/**
 * Konva attributes for a canvas guide line (grid, content guide, margin guide). The style's width
 * and dashes are screen px, so they are divided by the zoom to look the same at every zoom level;
 * the dash pattern is the one of element outlines (`dashPattern`).
 *
 * Args:
 *   style: Line style from the preferences.
 *   zoom: Canvas zoom.
 *   emphasis: Width and opacity factors (content guides); none by default.
 *
 * Returns:
 *   Attributes to spread onto a Konva shape.
 */
export function guideLineAttrs(style: GuideLineStyle, zoom: number, emphasis: GuideLineEmphasis = NO_EMPHASIS) {
  const width = style.width * emphasis.widthScale;
  const pattern = dashPattern(style.dash, width);
  const color = emphasis.alphaScale === 1 ? style.color : withAlpha(style.color, colorAlpha(style.color) * emphasis.alphaScale);
  return {
    stroke: color,
    strokeWidth: width / zoom,
    dash: pattern ? pattern.segments.map((length) => length / zoom) : undefined,
    dashEnabled: pattern !== null,
    lineCap: pattern?.roundCap ? "round" : "butt",
  } as const;
}
