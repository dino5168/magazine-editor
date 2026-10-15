import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { useEditorDispatch } from "@/lib/editor/editor-context";
import { createLineElement } from "@/lib/editor/element-factory";
import { snapPointToGrid } from "@/lib/editor/geometry";
import { constrainAngle } from "@/lib/editor/line-geometry";
import { DEFAULT_LINE_LENGTH_PT, lineKindEnds, toolLineStroke, type LineKind } from "@/lib/editor/line-kinds";
import type { ToolId } from "@/lib/editor/tools";
import type { PageId, Point, Swatch } from "@/lib/editor/types";

/** Pointer movement below this (screen px, in either direction) is a click, not a drag. */
const CLICK_TOLERANCE_PX = 4;

interface LineDrag {
  readonly pointerId: number;
  /** Screen position relative to the scroll container. */
  readonly start: Point;
  current: Point;
  shift: boolean;
}

interface UseCanvasLineOptions {
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly tool: ToolId;
  readonly lineKind: LineKind;
  /** The page under a screen point and a converter from screen points to that page's pt (as `useCanvasCreate`). */
  readonly pageAt: (screen: Point) => { readonly pageId: PageId; readonly toPt: (screen: Point) => Point };
  /** Grid spacing (pt) the ends snap to, or null when snapping is off. */
  readonly snapSpacing: number | null;
  /** The document's swatches (the new line's color links to 「文字」 when there is one). */
  readonly swatches: readonly Swatch[];
}

function relative(element: HTMLElement, event: { clientX: number; clientY: number }): Point {
  const rect = element.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

// Shift 在螢幕上鎖角度（預覽與建立都用同一個結果）
function endPoint(drag: LineDrag): Point {
  return drag.shift ? constrainAngle(drag.start, drag.current) : drag.current;
}

/**
 * Draws a line with the line tool: press = first end, release = last end (Shift: a multiple of
 * 45°). A click makes a `DEFAULT_LINE_LENGTH_PT` horizontal line centred on the point. The line
 * goes to the page under the press; one `element/add` on release, then the tool returns to select
 * with the new line selected. The preview is an SVG line moved directly (no re-render per move).
 *
 * Args:
 *   options: See `UseCanvasLineOptions`.
 *
 * Returns:
 *   previewRef: Ref for the preview `<line>` (inside an SVG covering the container).
 *   previewVisible: Whether a drag is in progress.
 *   active: Whether the line tool is on (the container shows a crosshair).
 *   handlers: Pointer handlers to call from the scroll container.
 */
export function useCanvasLine({ scrollRef, tool, lineKind, pageAt, snapSpacing, swatches }: UseCanvasLineOptions) {
  const dispatch = useEditorDispatch();
  const dragRef = useRef<LineDrag | null>(null);
  const previewRef = useRef<SVGLineElement>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const active = tool === "line";

  const cancel = (): void => {
    dragRef.current = null;
    setPreviewVisible(false);
  };

  // 拖曳中按 Esc 取消（同 useCanvasCreate）；Shift 按下 / 放開時立刻更新預覽
  useEffect(() => {
    if (!previewVisible) return;
    const onKey = (event: KeyboardEvent): void => {
      const drag = dragRef.current;
      if (event.key === "Escape" && event.type === "keydown") {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancel();
      } else if (event.key === "Shift" && drag) {
        drag.shift = event.type === "keydown";
        updatePreview(drag);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("keyup", onKey, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("keyup", onKey, { capture: true });
    };
  }, [previewVisible]);

  const updatePreview = (drag: LineDrag): void => {
    const line = previewRef.current;
    if (!line) return;
    const end = endPoint(drag);
    line.setAttribute("x1", `${drag.start.x}`);
    line.setAttribute("y1", `${drag.start.y}`);
    line.setAttribute("x2", `${end.x}`);
    line.setAttribute("y2", `${end.y}`);
  };

  const finish = (drag: LineDrag): void => {
    const end = endPoint(drag);
    const click = Math.abs(end.x - drag.start.x) < CLICK_TOLERANCE_PX && Math.abs(end.y - drag.start.y) < CLICK_TOLERANCE_PX;
    const snap = (point: Point): Point => (snapSpacing === null ? point : snapPointToGrid(point, snapSpacing));
    // 建在按下處的那一頁（跨頁時可能是對頁）：先切成目前頁，element/add 才會落在那一頁
    const { pageId, toPt } = pageAt(drag.start);
    dispatch({ type: "page/select", id: pageId });
    const startPt = toPt(drag.start);
    const half = DEFAULT_LINE_LENGTH_PT / 2;
    // 吸附：兩端各自對齊格線；Shift 鎖住的角度要保留，所以 Shift 時只吸附起點、終點照同樣的位移走
    let points: Point[];
    if (click) {
      const centre = snap(startPt);
      points = [
        { x: centre.x - half, y: centre.y },
        { x: centre.x + half, y: centre.y },
      ];
    } else {
      const first = snap(startPt);
      const endPt = toPt(end);
      const last = drag.shift ? { x: endPt.x + first.x - startPt.x, y: endPt.y + first.y - startPt.y } : snap(endPt);
      // 吸附後兩端重合：當成點擊
      points =
        first.x === last.x && first.y === last.y
          ? [
              { x: first.x - half, y: first.y },
              { x: first.x + half, y: first.y },
            ]
          : [first, last];
    }
    dispatch({ type: "element/add", element: createLineElement(points, { stroke: toolLineStroke(swatches), ...lineKindEnds(lineKind) }) });
    dispatch({ type: "tool/set", tool: "select" });
  };

  const handlers = {
    // capture 階段攔下（同 useCanvasCreate）：線條工具下按在物件上也是畫線，不會選取或拖曳物件
    onPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => {
      const element = scrollRef.current;
      if (!active || event.button !== 0 || !element || event.isPropagationStopped()) return;
      event.preventDefault();
      event.stopPropagation();
      element.setPointerCapture(event.pointerId);
      const start = relative(element, event);
      dragRef.current = { pointerId: event.pointerId, start, current: start, shift: event.shiftKey };
      updatePreview(dragRef.current);
      setPreviewVisible(true);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      const element = scrollRef.current;
      if (!drag || !element || event.pointerId !== drag.pointerId) return;
      drag.current = relative(element, event);
      drag.shift = event.shiftKey;
      updatePreview(drag);
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      const element = scrollRef.current;
      if (!drag || !element || event.pointerId !== drag.pointerId) return;
      drag.current = relative(element, event);
      drag.shift = event.shiftKey;
      cancel();
      finish(drag);
    },
    // 視窗失去焦點等情況：取消，不建立
    onLostPointerCapture: cancel,
  };

  return { previewRef, previewVisible, active, handlers };
}
