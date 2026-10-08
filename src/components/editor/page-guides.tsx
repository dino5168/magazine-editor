import type { Context } from "konva/lib/Context";
import type { Shape as KonvaShape } from "konva/lib/Shape";
import { Rect, Shape } from "react-konva";
import { contentGuides, drawnGridSpacing, marginBounds, type ContentGuideLine } from "@/lib/editor/geometry";
import { CONTENT_GUIDE_EMPHASIS, guideLineAttrs } from "@/lib/editor/stroke";
import type { Bounds, Margins, Size } from "@/lib/editor/types";
import type { GuideLineStyle } from "@/lib/preferences/preferences";

// 線的顏色、線型、粗細來自偏好（格線與參考線對話框）；粗細與虛線是螢幕像素，guideLineAttrs 換算成 ÷ zoom

interface PageGridProps {
  readonly page: Size;
  /** Grid spacing in pt. */
  readonly spacing: number;
  readonly style: GuideLineStyle;
  readonly zoom: number;
}

/**
 * Grid over the page (below the elements): lines at the grid spacing, drawn by one Konva shape
 * instead of a node per line. It does not listen to events, so clicks and marquee selection go through.
 *
 * Args:
 *   props.page: Page size in pt.
 *   props.spacing: Grid spacing in pt.
 *   props.style: Line style from the preferences.
 *   props.zoom: Canvas zoom, to keep lines the same size on screen and skip lines when zoomed out.
 *
 * Returns:
 *   Konva shape.
 */
export function PageGrid({ page, spacing, style, zoom }: PageGridProps) {
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
  return <Shape sceneFunc={sceneFunc} {...guideLineAttrs(style, zoom)} listening={false} perfectDrawEnabled={false} />;
}

interface ContentGuidesProps {
  readonly page: Size;
  /** Document margins in pt (they define the content area). */
  readonly margins: Margins;
  readonly style: GuideLineStyle;
  readonly zoom: number;
}

/**
 * Alignment lines at 1/4, 1/2 and 3/4 of the content area (inside the margins; the whole page when
 * the margins are 0). The 1/2 lines are drawn stronger than the 1/4 and 3/4 ones.
 *
 * Args:
 *   props: Page size, margins, line style and zoom.
 *
 * Returns:
 *   Konva shapes, one per emphasis.
 */
export function ContentGuides({ page, margins, style, zoom }: ContentGuidesProps) {
  const guides = contentGuides(page, margins);
  return (
    <>
      {(["quarter", "half"] as const).map((emphasis) => (
        <ContentGuideLines
          key={emphasis}
          area={guides.area}
          vertical={guides.vertical.filter((line) => line.emphasis === emphasis)}
          horizontal={guides.horizontal.filter((line) => line.emphasis === emphasis)}
          attrs={guideLineAttrs(style, zoom, CONTENT_GUIDE_EMPHASIS[emphasis])}
        />
      ))}
    </>
  );
}

interface ContentGuideLinesProps {
  readonly area: Bounds;
  readonly vertical: readonly ContentGuideLine[];
  readonly horizontal: readonly ContentGuideLine[];
  readonly attrs: ReturnType<typeof guideLineAttrs>;
}

/** Alignment lines of one emphasis, spanning the content area. */
function ContentGuideLines({ area, vertical, horizontal, attrs }: ContentGuideLinesProps) {
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
  return <Shape sceneFunc={sceneFunc} {...attrs} listening={false} perfectDrawEnabled={false} />;
}

interface MarginGuideProps {
  readonly page: Size;
  readonly margins: Margins;
  readonly style: GuideLineStyle;
  readonly zoom: number;
}

/**
 * Margin guide (above the elements, like the page edge line). Not drawn when every margin is 0.
 *
 * Args:
 *   props.page: Page size in pt.
 *   props.margins: Document margins in pt.
 *   props.style: Line style from the preferences.
 *   props.zoom: Canvas zoom, to keep the line the same size on screen.
 *
 * Returns:
 *   Konva rect, or null.
 */
export function MarginGuide({ page, margins, style, zoom }: MarginGuideProps) {
  const bounds = marginBounds(page, margins);
  if (!bounds) return null;
  return (
    <Rect
      x={bounds.minX}
      y={bounds.minY}
      width={bounds.maxX - bounds.minX}
      height={bounds.maxY - bounds.minY}
      {...guideLineAttrs(style, zoom)}
      listening={false}
    />
  );
}
