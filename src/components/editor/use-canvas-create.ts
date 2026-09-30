import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { useEditorDispatch } from "@/lib/editor/editor-context";
import {
  boundsFromPoints,
  createShapeElement,
  createShapeInBox,
  createToolText,
  type ShapeKind,
} from "@/lib/editor/element-factory";
import type { ToolId } from "@/lib/editor/tools";
import type { Point, TextElement } from "@/lib/editor/types";

/** Pointer movement below this (screen px, in either direction) is a click, not a drag. */
const CLICK_TOLERANCE_PX = 4;

interface CreateDrag {
  readonly pointerId: number;
  /** Screen position relative to the scroll container. */
  readonly start: Point;
  current: Point;
}

interface UseCanvasCreateOptions {
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly tool: ToolId;
  readonly shapeKind: ShapeKind;
  /** Converts a container-relative screen point to page pt with the current zoom and scroll. */
  readonly toPt: (screen: Point) => Point;
  /** Receives the empty text the text tool creates; the canvas edits it before adding it. */
  readonly onTextDraft: (draft: TextElement) => void;
}

function relative(element: HTMLElement, event: { clientX: number; clientY: number }): Point {
  const rect = element.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

/**
 * Creates shapes and text by clicking or dragging on the canvas with the shape / text tool.
 *
 * A click makes a default-sized shape centred on the point, or text starting there; a drag makes the
 * shape fill the box, or text wrapping at the box width. Only one `element/add` is dispatched, on
 * release (text: once the user has typed something), then the tool returns to select.
 *
 * Args:
 *   options: See `UseCanvasCreateOptions`.
 *
 * Returns:
 *   previewRef: Ref for the dashed preview box (positioned directly, no re-render per move).
 *   previewVisible: Whether a drag is in progress.
 *   cursor: CSS cursor for the container, or undefined.
 *   handlers: Props to spread on the scroll container.
 */
export function useCanvasCreate({ scrollRef, tool, shapeKind, toPt, onTextDraft }: UseCanvasCreateOptions) {
  const dispatch = useEditorDispatch();
  const dragRef = useRef<CreateDrag | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const creating = tool === "text" || tool === "shape";

  const cancel = (): void => {
    dragRef.current = null;
    setPreviewVisible(false);
  };

  // 拖曳中按 Esc 取消；capture + stopImmediatePropagation，不讓編輯器的 Esc（回到選取工具）也觸發
  useEffect(() => {
    if (!previewVisible) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel();
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [previewVisible]);

  const updatePreview = (drag: CreateDrag): void => {
    const box = previewRef.current;
    if (!box) return;
    box.style.left = `${Math.min(drag.start.x, drag.current.x)}px`;
    box.style.top = `${Math.min(drag.start.y, drag.current.y)}px`;
    box.style.width = `${Math.abs(drag.current.x - drag.start.x)}px`;
    // 文字只有寬度有意義，預覽畫成一行高的框
    box.style.height = tool === "text" ? "0px" : `${Math.abs(drag.current.y - drag.start.y)}px`;
  };

  const finish = (drag: CreateDrag): void => {
    const dx = Math.abs(drag.current.x - drag.start.x);
    const dy = Math.abs(drag.current.y - drag.start.y);
    const startPt = toPt(drag.start);
    const box = boundsFromPoints(startPt, toPt(drag.current));
    if (tool === "text") {
      onTextDraft(createToolText(startPt, dx < CLICK_TOLERANCE_PX ? null : box));
    } else {
      // 其中一邊太短時當成點擊：避免建立出一條線一樣、選不到的圖形
      const click = dx < CLICK_TOLERANCE_PX || dy < CLICK_TOLERANCE_PX;
      const element = click ? createShapeElement(shapeKind, startPt) : createShapeInBox(shapeKind, box);
      dispatch({ type: "element/add", element });
    }
    dispatch({ type: "tool/set", tool: "select" });
  };

  const handlers = {
    // capture 階段攔下（同 use-canvas-pan）：建立工具下按在物件上也是建立，不會選取或拖曳物件
    onPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => {
      const element = scrollRef.current;
      if (!creating || event.button !== 0 || !element || event.isPropagationStopped()) return;
      event.preventDefault();
      event.stopPropagation();
      element.setPointerCapture(event.pointerId);
      const start = relative(element, event);
      dragRef.current = { pointerId: event.pointerId, start, current: start };
      updatePreview(dragRef.current);
      setPreviewVisible(true);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      const element = scrollRef.current;
      if (!drag || !element || event.pointerId !== drag.pointerId) return;
      drag.current = relative(element, event);
      updatePreview(drag);
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      const element = scrollRef.current;
      if (!drag || !element || event.pointerId !== drag.pointerId) return;
      drag.current = relative(element, event);
      cancel();
      finish(drag);
    },
    // 視窗失去焦點等情況：取消，不建立
    onLostPointerCapture: cancel,
  };

  return { previewRef, previewVisible, cursor: creating ? "crosshair" : undefined, handlers };
}
