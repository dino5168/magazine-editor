import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import {
  DOCK_WIDTH,
  DOCK_WIDTH_STEP,
  CANVAS_MIN_WIDTH,
  resizeDockWidth,
  type DockSide,
} from "@/lib/dock/dock-layout";
import { cn } from "@/lib/utils";

/** Spread onto the canvas column so a splitter can measure how much room is left. */
export const DOCK_CENTER_PROPS = { "data-dock-center": "" } as const;

interface DockSplitterProps {
  readonly side: DockSide;
  /** Current dock width in CSS px. */
  readonly width: number;
  /** Called on every pointer move while dragging; only local state should change. */
  readonly onPreview: (px: number) => void;
  /** Called once when the width is settled (drag end, key press, double-click reset). */
  readonly onCommit: (px: number) => void;
}

interface DragState {
  readonly pointerId: number;
  readonly startX: number;
  readonly startWidth: number;
  readonly maxGrow: number;
  width: number;
}

// 畫布欄最少保留 CANVAS_MIN_WIDTH；量不到（理論上不會發生）時不限制
function measureMaxGrow(splitter: HTMLElement): number {
  const center = splitter.parentElement?.parentElement?.querySelector(":scope > [data-dock-center]");
  return center ? center.clientWidth - CANVAS_MIN_WIDTH : Number.POSITIVE_INFINITY;
}

/**
 * Size control bar on the inner edge of a dock: drag to resize, arrow keys to nudge,
 * double-click to reset to the default width.
 *
 * Args:
 *   props.side: Dock side (decides the drag direction and which edge it sits on).
 *   props.width: Current dock width.
 *   props.onPreview: Live width while dragging.
 *   props.onCommit: Final width.
 *
 * Returns:
 *   Vertical separator element, absolutely positioned inside the dock.
 */
export function DockSplitter({ side, width, onPreview, onCommit }: DockSplitterProps) {
  const dragRef = useRef<DragState | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    // 阻止拖曳時選取頁面文字
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: width,
      maxGrow: measureMaxGrow(event.currentTarget),
      width,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = resizeDockWidth(drag.startWidth, event.clientX - drag.startX, side, drag.maxGrow);
    if (next === drag.width) return;
    drag.width = next;
    onPreview(next);
  };

  // pointerup 與取消（例如視窗失去焦點）都會觸發 lostpointercapture，在這裡統一結束拖曳
  const endDrag = (): void => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    onCommit(drag.width);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const deltaX = event.key === "ArrowRight" ? DOCK_WIDTH_STEP : -DOCK_WIDTH_STEP;
    onCommit(resizeDockWidth(width, deltaX, side, measureMaxGrow(event.currentTarget)));
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={side === "left" ? "調整左側工具面板寬度" : "調整右側工具面板寬度"}
      aria-valuemin={DOCK_WIDTH.min}
      aria-valuemax={DOCK_WIDTH.max}
      aria-valuenow={width}
      tabIndex={0}
      title="拖曳調整寬度，雙擊還原"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onLostPointerCapture={endDrag}
      onDoubleClick={() => onCommit(DOCK_WIDTH.default)}
      onKeyDown={onKeyDown}
      className={cn(
        // 感應區 8px 跨在停靠區邊框上，中間 2px 的線在 hover / 拖曳 / 鍵盤焦點時顯示
        "group absolute inset-y-0 z-20 flex w-2 cursor-col-resize touch-none justify-center outline-none",
        side === "left" ? "-right-1" : "-left-1",
      )}
    >
      <div className="h-full w-0.5 transition-colors group-hover:bg-primary/40 group-focus-visible:bg-primary group-active:bg-primary" />
    </div>
  );
}
