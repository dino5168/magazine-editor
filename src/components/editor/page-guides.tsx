import type { Context } from "konva/lib/Context";
import type { Shape as KonvaShape } from "konva/lib/Shape";
import { Rect, Shape } from "react-konva";
import { drawnGridSpacing, marginBounds } from "@/lib/editor/geometry";
import type { Margins, Size } from "@/lib/editor/types";

const GRID_COLOR = "#94a3b8";
const GRID_OPACITY = 0.35;
const MARGIN_COLOR = "#ec4899";

interface PageGridProps {
  readonly page: Size;
  /** Grid spacing in pt. */
  readonly spacing: number;
  readonly zoom: number;
}

/**
 * Grid lines over the page (below the elements). One Konva shape draws every line, instead of a
 * node per line; it does not listen to events, so clicks and marquee selection go through.
 *
 * Args:
 *   props.page: Page size in pt.
 *   props.spacing: Grid spacing in pt.
 *   props.zoom: Canvas zoom, to keep lines 1 px wide and skip lines when zoomed out.
 *
 * Returns:
 *   Konva shape.
 */
export function PageGrid({ page, spacing, zoom }: PageGridProps) {
  const step = drawnGridSpacing(spacing, zoom);
  const sceneFunc = (context: Context, shape: KonvaShape) => {
    context.beginPath();
    // 用 i * step 而不是累加，避免浮點誤差讓後面的線慢慢偏離格線
    for (let i = 1; i * step < page.width; i++) {
      context.moveTo(i * step, 0);
      context.lineTo(i * step, page.height);
    }
    for (let i = 1; i * step < page.height; i++) {
      context.moveTo(0, i * step);
      context.lineTo(page.width, i * step);
    }
    context.strokeShape(shape);
  };
  return (
    <Shape
      sceneFunc={sceneFunc}
      stroke={GRID_COLOR}
      opacity={GRID_OPACITY}
      strokeWidth={1 / zoom}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
}

interface MarginGuideProps {
  readonly page: Size;
  readonly margins: Margins;
  readonly zoom: number;
}

/**
 * Dashed margin guide (above the elements, like the page edge line). Not drawn when every margin is 0.
 *
 * Args:
 *   props.page: Page size in pt.
 *   props.margins: Document margins in pt.
 *   props.zoom: Canvas zoom, to keep the line and dashes the same size on screen.
 *
 * Returns:
 *   Konva rect, or null.
 */
export function MarginGuide({ page, margins, zoom }: MarginGuideProps) {
  const bounds = marginBounds(page, margins);
  if (!bounds) return null;
  return (
    <Rect
      x={bounds.minX}
      y={bounds.minY}
      width={bounds.maxX - bounds.minX}
      height={bounds.maxY - bounds.minY}
      stroke={MARGIN_COLOR}
      strokeWidth={1 / zoom}
      dash={[4 / zoom, 3 / zoom]}
      listening={false}
    />
  );
}
