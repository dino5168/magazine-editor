import { useLayoutEffect, useRef, type Ref } from "react";
import { rulerTicks, type RulerSpan, type RulerTickLevel } from "@/lib/editor/ruler";
import { cn } from "@/lib/utils";

/** Thickness of the rulers (px). */
export const RULER_SIZE_PX = 20;

// 刻度長度（px），從尺規靠畫布的那一邊量起
const TICK_LENGTH: { readonly [K in RulerTickLevel]: number } = { major: RULER_SIZE_PX, half: 8, minor: 4 };
const LABEL_GAP_PX = 3;

interface CanvasRulerProps {
  readonly orientation: "horizontal" | "vertical";
  /** Screen position of 0 mm along the ruler (px, from the ruler's start). */
  readonly originPx: number;
  /** Ruler length (px): the canvas viewport's width or height. */
  readonly lengthPx: number;
  readonly zoom: number;
  /** Where the selection lies on this ruler, or null. */
  readonly span: RulerSpan | null;
  /** Pointer marker line; the canvas moves it directly on pointer move (see `moveRulerMarker`). */
  readonly markerRef: Ref<HTMLDivElement>;
}

/**
 * Shows the pointer marker at a ruler position, or hides it. Changes the DOM directly:
 * a pointer move must not re-render the canvas.
 *
 * Args:
 *   marker: Marker element (null while the rulers are hidden).
 *   orientation: Ruler the marker belongs to.
 *   px: Position along the ruler, or null to hide.
 */
export function moveRulerMarker(marker: HTMLDivElement | null, orientation: "horizontal" | "vertical", px: number | null) {
  if (!marker) return;
  marker.hidden = px === null;
  if (px !== null) marker.style.transform = orientation === "horizontal" ? `translateX(${px}px)` : `translateY(${px}px)`;
}

/**
 * One mm ruler beside the canvas, drawn on a plain 2D canvas (not Konva: nothing on it is editable).
 * Colors and font come from the element's CSS (design tokens), so they follow the app theme.
 *
 * Args:
 *   props.orientation: Above the canvas (horizontal) or to its left (vertical; numbers turned 90°).
 *   props.originPx: Where 0 is.
 *   props.lengthPx: Length to draw.
 *   props.zoom: Canvas zoom.
 *   props.span: Selection extent, drawn as a tinted band under the ticks.
 *   props.markerRef: Receives the pointer marker element.
 *
 * Returns:
 *   Ruler strip.
 */
export function CanvasRuler({ orientation, originPx, lengthPx, zoom, span, markerRef }: CanvasRulerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const horizontal = orientation === "horizontal";

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const length = Math.max(0, Math.floor(lengthPx));
    const dpr = window.devicePixelRatio || 1;
    const width = horizontal ? length : RULER_SIZE_PX;
    const height = horizontal ? RULER_SIZE_PX : length;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const style = getComputedStyle(canvas);
    context.strokeStyle = style.color;
    context.fillStyle = style.color;
    context.lineWidth = 1;
    context.font = `${style.fontSize} ${style.fontFamily}`;
    context.textBaseline = "top";

    const ticks = rulerTicks(originPx, length, zoom);
    context.beginPath();
    for (const tick of ticks) {
      // +0.5：1 px 的線落在像素中間才清楚
      const at = Math.round(tick.px) + 0.5;
      const tickLength = TICK_LENGTH[tick.level];
      if (horizontal) {
        context.moveTo(at, RULER_SIZE_PX);
        context.lineTo(at, RULER_SIZE_PX - tickLength);
      } else {
        context.moveTo(RULER_SIZE_PX, at);
        context.lineTo(RULER_SIZE_PX - tickLength, at);
      }
    }
    context.stroke();

    // 數字在主刻度之後（水平：右邊；垂直：下面，轉 90° 由下往上讀）
    for (const tick of ticks) {
      if (tick.label === undefined) continue;
      const text = String(tick.label);
      const at = Math.round(tick.px) + LABEL_GAP_PX;
      if (horizontal) {
        context.fillText(text, at, 2);
      } else {
        context.save();
        context.translate(2, at + context.measureText(text).width);
        context.rotate(-Math.PI / 2);
        context.fillText(text, 0, 0);
        context.restore();
      }
    }
  }, [horizontal, originPx, lengthPx, zoom]);

  return (
    // 靠畫布那一邊的分隔線用 inset shadow：CSS border 會佔掉 1 px、蓋住刻度底端；canvas 透明，線在刻度之下
    <div
      aria-hidden
      className={cn(
        "relative overflow-hidden bg-muted text-muted-foreground",
        horizontal ? "shadow-[inset_0_-1px_0_var(--border)]" : "shadow-[inset_-1px_0_0_var(--border)]",
      )}
    >
      {/* 色帶與標示線用選取框（Transformer）的靛藍色，看得出和選取的物件對應；主題的 primary 是近黑色 */}
      {span && (
        <div
          className={cn("absolute bg-indigo-500/20", horizontal ? "inset-y-0" : "inset-x-0")}
          style={
            horizontal
              ? { left: span.start, width: Math.max(1, span.end - span.start) }
              : { top: span.start, height: Math.max(1, span.end - span.start) }
          }
        />
      )}
      {/* relative：canvas 疊在選取範圍色帶之上，刻度不會被蓋住 */}
      <canvas ref={canvasRef} className="relative block text-[10px] leading-none" />
      <div
        ref={markerRef}
        hidden
        className={cn("absolute top-0 left-0 bg-indigo-500", horizontal ? "h-full w-px" : "h-px w-full")}
      />
    </div>
  );
}

/**
 * Corner square where the two rulers meet, showing the unit.
 *
 * Returns:
 *   Corner box.
 */
export function RulerCorner() {
  return (
    <div
      aria-hidden
      className="flex items-center justify-center bg-muted shadow-[inset_-1px_-1px_0_var(--border)] text-[10px] leading-none text-muted-foreground select-none"
    >
      mm
    </div>
  );
}
