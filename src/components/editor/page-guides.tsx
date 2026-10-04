import type { Context } from "konva/lib/Context";
import type { Shape as KonvaShape } from "konva/lib/Shape";
import { Rect, Shape } from "react-konva";
import { contentGuides, drawnGridSpacing, marginBounds, type ContentGuideLine } from "@/lib/editor/geometry";
import type { Bounds, Margins, Size } from "@/lib/editor/types";

const GRID_COLOR = "#94a3b8";
const GRID_OPACITY = 0.45;
/** Dash and gap of the grid lines, in screen px. */
const GRID_DASH_PX = [2, 3];
const MARGIN_COLOR = "#ec4899";
const GUIDE_COLOR = "#6366f1";

// 1/2 比 1/4 更明顯：線寬、透明度與虛線長度都較大（數字是螢幕像素，畫的時候除以 zoom）
const GUIDE_STYLES = {
  half: { width: 1.5, opacity: 0.85, dash: [6, 3] },
  quarter: { width: 1, opacity: 0.55, dash: [4, 3] },
} as const satisfies Record<ContentGuideLine["emphasis"], { width: number; opacity: number; dash: number[] }>;

interface PageGridProps {
  readonly page: Size;
  readonly margins: Margins;
  /** Grid spacing in pt. */
  readonly spacing: number;
  readonly zoom: number;
}

/**
 * Grid over the page (below the elements): dashed lines at the grid spacing, plus stronger dashed
 * lines at 1/4, 1/2 and 3/4 of the content area (inside the margins) as alignment aids. Each set is
 * one Konva shape drawing every line, instead of a node per line; none listen to events, so clicks
 * and marquee selection go through.
 *
 * Args:
 *   props.page: Page size in pt.
 *   props.margins: Document margins in pt (they define the content area).
 *   props.spacing: Grid spacing in pt.
 *   props.zoom: Canvas zoom, to keep lines and dashes the same size on screen and skip lines when zoomed out.
 *
 * Returns:
 *   Konva shapes.
 */
export function PageGrid({ page, margins, spacing, zoom }: PageGridProps) {
  const step = drawnGridSpacing(spacing, zoom);
  const gridFunc = (context: Context, shape: KonvaShape) => {
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
  const guides = contentGuides(page, margins);
  return (
    <>
      <Shape
        sceneFunc={gridFunc}
        stroke={GRID_COLOR}
        opacity={GRID_OPACITY}
        strokeWidth={1 / zoom}
        dash={GRID_DASH_PX.map((px) => px / zoom)}
        listening={false}
        perfectDrawEnabled={false}
      />
      {(["quarter", "half"] as const).map((emphasis) => (
        <ContentGuideLines
          key={emphasis}
          area={guides.area}
          vertical={guides.vertical.filter((line) => line.emphasis === emphasis)}
          horizontal={guides.horizontal.filter((line) => line.emphasis === emphasis)}
          style={GUIDE_STYLES[emphasis]}
          zoom={zoom}
        />
      ))}
    </>
  );
}

interface ContentGuideLinesProps {
  readonly area: Bounds;
  readonly vertical: readonly ContentGuideLine[];
  readonly horizontal: readonly ContentGuideLine[];
  readonly style: (typeof GUIDE_STYLES)[keyof typeof GUIDE_STYLES];
  readonly zoom: number;
}

/** Alignment lines of one emphasis, spanning the content area. */
function ContentGuideLines({ area, vertical, horizontal, style, zoom }: ContentGuideLinesProps) {
  const sceneFunc = (context: Context, shape: KonvaShape) => {
    context.beginPath();
    for (const { position } of vertical) {
      context.moveTo(position, area.minY);
      context.lineTo(position, area.maxY);
    }
    for (const { position } of horizontal) {
      context.moveTo(area.minX, position);
      context.lineTo(area.maxX, position);
    }
    context.strokeShape(shape);
  };
  return (
    <Shape
      sceneFunc={sceneFunc}
      stroke={GUIDE_COLOR}
      opacity={style.opacity}
      strokeWidth={style.width / zoom}
      dash={style.dash.map((px) => px / zoom)}
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
