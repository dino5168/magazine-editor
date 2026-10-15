import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { useEditorDispatch } from "@/lib/editor/editor-context";
import { createLineElement } from "@/lib/editor/element-factory";
import { snapPointToGrid } from "@/lib/editor/geometry";
import { constrainAngle, linePointBounds, simplifyPoints } from "@/lib/editor/line-geometry";
import { MAX_LINE_POINTS } from "@/lib/editor/validation";
import { DEFAULT_LINE_LENGTH_PT, isPointByPoint, lineKindEnds, lineKindPath, toolLineStroke, type LineKind } from "@/lib/editor/line-kinds";
import { linePathCommands } from "@/lib/editor/line-path";
import { pathData } from "@/lib/editor/shape-path";
import type { ToolId } from "@/lib/editor/tools";
import type { PageId, Point, Swatch } from "@/lib/editor/types";

/** Pointer movement below this (screen px, in either direction) is a click, not a drag. */
const CLICK_TOLERANCE_PX = 4;

/** Drag mode (straight line / arrows): press = first end, release = last end. */
interface LineDrag {
  readonly kind: "drag";
  readonly pointerId: number;
  /** Screen position relative to the scroll container. */
  readonly start: Point;
  current: Point;
  shift: boolean;
}

/** Point-by-point mode (polyline): each click adds a point; double-click / Enter finishes. */
interface LinePath {
  readonly kind: "points";
  /** The page the first click was on, and its converter from screen points. */
  readonly pageId: PageId;
  readonly toPt: (screen: Point) => Point;
  /** Points so far: screen (preview) and page pt (the line), the latter already snapped / constrained. */
  readonly screen: Point[];
  readonly page: Point[];
  /** Where the pointer is (the rubber band to the next point). */
  pointer: Point;
  shift: boolean;
}

/** Pencil: the pointer's trail while the button is held; simplified into a smooth line on release. */
interface PencilStroke {
  readonly kind: "pencil";
  readonly pointerId: number;
  /** Screen positions relative to the scroll container. */
  readonly trail: Point[];
  shift: boolean;
}

type LineSession = LineDrag | LinePath | PencilStroke;

/** Pencil strokes are simplified to within this many screen pixels of the recorded trail. */
const PENCIL_TOLERANCE_PX = 1.5;

interface UseCanvasLineOptions {
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly tool: ToolId;
  readonly lineKind: LineKind;
  /** The page under a screen point and a converter from screen points to that page's pt (as `useCanvasCreate`). */
  readonly pageAt: (screen: Point) => { readonly pageId: PageId; readonly toPt: (screen: Point) => Point };
  /** Grid spacing (pt) the points snap to, or null when snapping is off. */
  readonly snapSpacing: number | null;
  /** The document's swatches (the new line's color links to 「文字」 when there is one). */
  readonly swatches: readonly Swatch[];
}

function relative(element: HTMLElement, event: { clientX: number; clientY: number }): Point {
  const rect = element.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

const near = (a: Point, b: Point) => Math.abs(a.x - b.x) < CLICK_TOLERANCE_PX && Math.abs(a.y - b.y) < CLICK_TOLERANCE_PX;

// 拖曳模式的終點：Shift 在螢幕上鎖角度（預覽與建立都用同一個結果）
function dragEnd(drag: LineDrag): Point {
  return drag.shift ? constrainAngle(drag.start, drag.current) : drag.current;
}

// 逐點模式下一個點（螢幕）：Shift 以上一點為基準鎖 45°
function nextScreenPoint(path: LinePath): Point {
  const last = path.screen[path.screen.length - 1];
  return path.shift ? constrainAngle(last, path.pointer) : path.pointer;
}

/**
 * Draws lines with the line tool. Straight line / arrows: press = first end, release = last end
 * (Shift: a multiple of 45°); a click makes a `DEFAULT_LINE_LENGTH_PT` horizontal line centred on
 * the point. Polyline: each click adds a point (Shift: 45° from the previous one), a click on the
 * last point (double-click) or Enter finishes, Backspace removes the last point, Esc cancels.
 * Pencil (the pencil tool): the trail while the button is held, simplified on release into a smooth
 * line without arrowheads (`simplifyPoints`, at most `MAX_LINE_POINTS` points).
 * The line goes to the page under the first press; one `element/add`, then the tool returns to
 * select with the new line selected. The preview is an SVG polyline moved directly (no re-render
 * per move).
 *
 * Args:
 *   options: See `UseCanvasLineOptions`.
 *
 * Returns:
 *   previewRef: Ref for the preview `<path>` (inside an SVG covering the container).
 *   previewVisible: Whether a line is being drawn.
 *   active: Whether the line tool is on (the container shows a crosshair).
 *   handlers: Pointer handlers to call from the scroll container.
 */
export function useCanvasLine({ scrollRef, tool, lineKind, pageAt, snapSpacing, swatches }: UseCanvasLineOptions) {
  const dispatch = useEditorDispatch();
  const sessionRef = useRef<LineSession | null>(null);
  const previewRef = useRef<SVGPathElement>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const active = tool === "line" || tool === "pencil";
  const pencil = tool === "pencil";
  const snap = (point: Point): Point => (snapSpacing === null ? point : snapPointToGrid(point, snapSpacing));

  const cancel = (): void => {
    sessionRef.current = null;
    setPreviewVisible(false);
  };

  const add = (pagePoints: Point[], pageId: PageId, byPencil = false): void => {
    // 建在第一次按下的那一頁（跨頁時可能是對頁）：先切成目前頁，element/add 才會落在那一頁
    dispatch({ type: "page/select", id: pageId });
    // 鉛筆 = 沒有箭頭的平滑曲線
    const shape = byPencil ? { path: "smooth" as const, ...lineKindEnds("straight") } : { path: lineKindPath(lineKind), ...lineKindEnds(lineKind) };
    const line = createLineElement(pagePoints, { stroke: toolLineStroke(swatches), ...shape });
    dispatch({ type: "element/add", element: line });
    dispatch({ type: "tool/set", tool: "select" });
  };

  const updatePreview = (session: LineSession): void => {
    const preview = previewRef.current;
    if (!preview) return;
    if (session.kind === "pencil") {
      // 鉛筆畫的時候照原始軌跡畫，放開才簡化成平滑曲線
      preview.setAttribute("d", pathData(linePathCommands(session.trail, "straight")));
      return;
    }
    const points = session.kind === "drag" ? [session.start, dragEnd(session)] : [...session.screen, nextScreenPoint(session)];
    // 曲線的預覽和建立後一樣平滑（同一個 linePathCommands，在螢幕座標上算）
    preview.setAttribute("d", pathData(linePathCommands(points, session.kind === "drag" ? "straight" : lineKindPath(lineKind))));
  };

  const finishPath = (path: LinePath): void => {
    cancel();
    if (path.page.length >= 2) add(path.page, path.pageId);
  };

  // 換工具（按 V 等）時放棄畫到一半的線
  useEffect(() => {
    if (!active) cancel();
  }, [active]);

  // 畫線中的按鍵：capture + stopImmediatePropagation，不讓編輯器的 Esc（回到選取工具）/ Backspace（刪除選取）也觸發
  useEffect(() => {
    if (!previewVisible) return;
    const onKey = (event: KeyboardEvent): void => {
      const session = sessionRef.current;
      if (!session) return;
      if (event.key === "Shift") {
        session.shift = event.type === "keydown";
        updatePreview(session);
        return;
      }
      if (event.type !== "keydown") return;
      const consume = () => {
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      if (event.key === "Escape") {
        consume();
        cancel();
      } else if (session.kind === "points" && event.key === "Enter") {
        consume();
        finishPath(session);
      } else if (session.kind === "points" && event.key === "Backspace") {
        consume();
        session.screen.pop();
        session.page.pop();
        if (session.screen.length === 0) cancel();
        else updatePreview(session);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("keyup", onKey, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("keyup", onKey, { capture: true });
    };
  }, [previewVisible]);

  const finishDrag = (drag: LineDrag): void => {
    const end = dragEnd(drag);
    const { pageId, toPt } = pageAt(drag.start);
    const startPt = toPt(drag.start);
    const half = DEFAULT_LINE_LENGTH_PT / 2;
    const clickLine = (centre: Point) => [
      { x: centre.x - half, y: centre.y },
      { x: centre.x + half, y: centre.y },
    ];
    // 吸附：兩端各自對齊格線；Shift 鎖住的角度要保留，所以 Shift 時只吸附起點、終點照同樣的位移走
    let points: Point[];
    if (near(end, drag.start)) points = clickLine(snap(startPt));
    else {
      const first = snap(startPt);
      const endPt = toPt(end);
      const last = drag.shift ? { x: endPt.x + first.x - startPt.x, y: endPt.y + first.y - startPt.y } : snap(endPt);
      // 吸附後兩端重合：當成點擊
      points = first.x === last.x && first.y === last.y ? clickLine(first) : [first, last];
    }
    add(points, pageId);
  };

  // 鉛筆：軌跡在螢幕上簡化（容差 PENCIL_TOLERANCE_PX、點數上限 MAX_LINE_POINTS），再換成第一點那一頁的座標；
  // 幾乎沒移動（點一下）不建立。鉛筆不吸附格線（隨手畫）
  const finishPencil = (stroke: PencilStroke): void => {
    const bounds = linePointBounds(stroke.trail);
    if (bounds.maxX - bounds.minX < CLICK_TOLERANCE_PX && bounds.maxY - bounds.minY < CLICK_TOLERANCE_PX) return;
    const { pageId, toPt } = pageAt(stroke.trail[0]);
    const simple = simplifyPoints(stroke.trail, PENCIL_TOLERANCE_PX, MAX_LINE_POINTS);
    add(simple.map(toPt), pageId, true);
  };

  // 逐點模式：按一下加一點；按在最後一點上（雙擊的第二下）= 完成
  const clickPoint = (screen: Point, shift: boolean): void => {
    const session = sessionRef.current;
    if (!session || session.kind !== "points") {
      const { pageId, toPt } = pageAt(screen);
      const path: LinePath = { kind: "points", pageId, toPt, screen: [screen], page: [snap(toPt(screen))], pointer: screen, shift };
      sessionRef.current = path;
      updatePreview(path);
      setPreviewVisible(true);
      return;
    }
    session.pointer = screen;
    session.shift = shift;
    const point = nextScreenPoint(session);
    if (near(point, session.screen[session.screen.length - 1])) {
      finishPath(session);
      return;
    }
    const previous = session.page[session.page.length - 1];
    // Shift：在頁面座標上以前一點為基準鎖角度（不吸附，角度才準）；否則對齊格線
    const pagePoint = shift ? constrainAngle(previous, session.toPt(screen)) : snap(session.toPt(point));
    session.screen.push(point);
    session.page.push(pagePoint);
    updatePreview(session);
  };

  const handlers = {
    // capture 階段攔下（同 useCanvasCreate）：線條工具下按在物件上也是畫線，不會選取或拖曳物件
    onPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => {
      const element = scrollRef.current;
      if (!active || event.button !== 0 || !element || event.isPropagationStopped()) return;
      event.preventDefault();
      event.stopPropagation();
      const screen = relative(element, event);
      if (pencil) {
        element.setPointerCapture(event.pointerId);
        const stroke: PencilStroke = { kind: "pencil", pointerId: event.pointerId, trail: [screen], shift: false };
        sessionRef.current = stroke;
        updatePreview(stroke);
        setPreviewVisible(true);
        return;
      }
      if (isPointByPoint(lineKind)) {
        clickPoint(screen, event.shiftKey);
        return;
      }
      element.setPointerCapture(event.pointerId);
      const drag: LineDrag = { kind: "drag", pointerId: event.pointerId, start: screen, current: screen, shift: event.shiftKey };
      sessionRef.current = drag;
      updatePreview(drag);
      setPreviewVisible(true);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      const session = sessionRef.current;
      const element = scrollRef.current;
      if (!session || !element) return;
      if (session.kind === "pencil") {
        if (event.pointerId !== session.pointerId) return;
        const point = relative(element, event);
        const last = session.trail[session.trail.length - 1];
        // 不到 1 px 的移動不記（點數少一點，簡化也快）
        if (Math.hypot(point.x - last.x, point.y - last.y) >= 1) session.trail.push(point);
        updatePreview(session);
        return;
      }
      if (session.kind === "drag") {
        if (event.pointerId !== session.pointerId) return;
        session.current = relative(element, event);
      } else session.pointer = relative(element, event);
      session.shift = event.shiftKey;
      updatePreview(session);
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
      const session = sessionRef.current;
      const element = scrollRef.current;
      if (!session || session.kind === "points" || !element || event.pointerId !== session.pointerId) return;
      if (session.kind === "pencil") {
        session.trail.push(relative(element, event));
        cancel();
        finishPencil(session);
        return;
      }
      session.current = relative(element, event);
      session.shift = event.shiftKey;
      cancel();
      finishDrag(session);
    },
    // 拖曳 / 鉛筆中視窗失去焦點等情況：取消，不建立（逐點模式沒有抓住指標，不受影響）
    onLostPointerCapture: () => {
      if (sessionRef.current && sessionRef.current.kind !== "points") cancel();
    },
  };

  return { previewRef, previewVisible, active, handlers };
}
