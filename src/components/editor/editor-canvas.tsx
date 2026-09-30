import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Layer, Rect, Stage, Transformer } from "react-konva";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { selectActivePage, selectSelectedElement } from "@/lib/editor/editor-reducer";
import {
  boundsCenter,
  boundsIntersect,
  expandBounds,
  getContentBounds,
  getElementBounds,
  pageCenter,
} from "@/lib/editor/geometry";
import type { ElementId, ElementPatch, ElementType, Point, Size, TextElement } from "@/lib/editor/types";
import {
  clampZoom,
  computeLayout,
  fitZoom,
  screenToPt,
  scrollForAnchor,
  type ViewportLayout,
} from "@/lib/editor/viewport";
import { cn } from "@/lib/utils";
import { ElementNode } from "./canvas-elements";
import { TextEditorOverlay } from "./text-editor-overlay";
import { useCanvasCreate } from "./use-canvas-create";
import { useCanvasPan } from "./use-canvas-pan";

/** Extra scrollable space around the page and all elements, in screen pixels. */
const WORKSPACE_MARGIN_PX = 200;
const FIT_PADDING_PX = 40;
const WHEEL_ZOOM_SENSITIVITY = 0.0015;
const PAGE_BACKGROUND_NAME = "page-background";

type Anchor = { readonly pt: Point; readonly screen: Point };
type AnchorName = NonNullable<Konva.TransformerConfig["enabledAnchors"]>[number];

const ALL_ANCHORS: readonly AnchorName[] = [
  "top-left", "top-center", "top-right", "middle-right",
  "bottom-right", "bottom-center", "bottom-left", "middle-left",
];
const CORNER_ANCHORS: readonly AnchorName[] = ["top-left", "top-right", "bottom-right", "bottom-left"];

const TRANSFORMER_OPTIONS: {
  readonly [K in ElementType]: { readonly anchors: readonly AnchorName[]; readonly keepRatio: boolean };
} = {
  text: { anchors: ["middle-left", "middle-right"], keepRatio: false },
  rect: { anchors: ALL_ANCHORS, keepRatio: false },
  image: { anchors: ALL_ANCHORS, keepRatio: false },
  ellipse: { anchors: ALL_ANCHORS, keepRatio: false },
  // 正多邊形與星形只有單一 radius，只能等比例縮放
  polygon: { anchors: CORNER_ANCHORS, keepRatio: true },
  star: { anchors: CORNER_ANCHORS, keepRatio: true },
};

function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    // canvas 量字寬需字型已載入，否則首次繪製會用 fallback 字型的寬度換行。
    // 中文字型也要等：一份中文雜誌的換行幾乎都由 Noto Sans TC 決定。
    // load() 只在字型實際被用到時才抓檔案，所以要帶一個該字型涵蓋的字當樣本。
    Promise.all([
      document.fonts.load('16px "Geist"'),
      document.fonts.load('bold 16px "Geist"'),
      document.fonts.load('16px "Noto Sans TC"', '中'),
      document.fonts.load('bold 16px "Noto Sans TC"', '中'),
    ])
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return ready;
}

/**
 * Konva editing surface: scrollable workspace, page, elements, selection and in-place text editing.
 *
 * Returns:
 *   Canvas area filling its container.
 */
export function EditorCanvas() {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const page = selectActivePage(state);
  const selected = selectSelectedElement(state);
  const { zoom, fitRequest } = state.view;
  const fontsReady = useFontsReady();

  const scrollRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  const [scroll, setScroll] = useState<Point>({ x: 0, y: 0 });
  const [editingId, setEditingId] = useState<ElementId | null>(null);
  // 文字工具剛建立、還沒輸入內容的文字：不在文件裡，輸入完成才 element/add（復原一次就撤銷）
  const [draftText, setDraftText] = useState<TextElement | null>(null);
  const pan = useCanvasPan(scrollRef, state.tool === "hand");

  // 物件可拖出頁面：捲動範圍涵蓋頁面與所有物件，確保拖到遠處的物件仍拿得回來
  const bounds = useMemo(() => expandBounds(getContentBounds(page), WORKSPACE_MARGIN_PX / zoom), [page, zoom]);
  const layout = useMemo(() => computeLayout(bounds, zoom, viewport), [bounds, zoom, viewport]);

  // 原生事件 handler 與 layout effect 需要讀到最新值
  const latest = useRef({ layout, zoom, scroll, viewport, selected });
  latest.current = { layout, zoom, scroll, viewport, selected };
  const create = useCanvasCreate({
    scrollRef,
    tool: state.tool,
    shapeKind: state.shapeKind,
    toPt: (screen) => screenToPt(latest.current.layout, latest.current.zoom, latest.current.scroll, screen),
    onTextDraft: setDraftText,
  });
  const anchorRef = useRef<Anchor | null>(null);
  const prevLayoutRef = useRef<{ layout: ViewportLayout; zoom: number } | null>(null);
  const handledFitRef = useRef(0);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const update = (): void => {
      setViewport((prev) =>
        prev.width === element.clientWidth && prev.height === element.clientHeight
          ? prev
          : { width: element.clientWidth, height: element.clientHeight },
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const applyScroll = useCallback((target: Point) => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollLeft = target.x;
    element.scrollTop = target.y;
    setScroll({ x: element.scrollLeft, y: element.scrollTop });
  }, []);

  const zoomAt = useCallback(
    (requested: number, anchor: Anchor) => {
      const next = clampZoom(requested);
      if (next === latest.current.zoom) {
        applyScroll(scrollForAnchor(latest.current.layout, next, anchor.pt, anchor.screen));
        return;
      }
      anchorRef.current = anchor;
      dispatch({ type: "view/setZoom", zoom: next });
    },
    [applyScroll, dispatch],
  );

  // 縮放或內容範圍改變後調整捲動位置，讓錨點（游標或畫面中心）下的內容保持不動。
  // 必須宣告在 fit effect 之前：同一次 commit 中先處理舊的變化，fit 設定的錨點留給下一次 commit。
  useLayoutEffect(() => {
    if (viewport.width === 0) return;
    const prev = prevLayoutRef.current;
    prevLayoutRef.current = { layout, zoom };
    const anchor = anchorRef.current;
    anchorRef.current = null;
    if (anchor) {
      applyScroll(scrollForAnchor(layout, zoom, anchor.pt, anchor.screen));
      return;
    }
    if (!prev || (prev.zoom === zoom && prev.layout.offsetX === layout.offsetX && prev.layout.offsetY === layout.offsetY)) {
      return;
    }
    const center = { x: viewport.width / 2, y: viewport.height / 2 };
    const pt = screenToPt(prev.layout, prev.zoom, latest.current.scroll, center);
    applyScroll(scrollForAnchor(layout, zoom, pt, center));
  }, [layout, zoom, viewport, applyScroll]);

  useLayoutEffect(() => {
    if (viewport.width === 0 || handledFitRef.current === fitRequest) return;
    handledFitRef.current = fitRequest;
    zoomAt(fitZoom(page, viewport, FIT_PADDING_PX), {
      pt: pageCenter(page),
      screen: { x: viewport.width / 2, y: viewport.height / 2 },
    });
  }, [fitRequest, viewport, page, zoomAt]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const current = latest.current;
      const pt = screenToPt(current.layout, current.zoom, current.scroll, screen);
      zoomAt(current.zoom * Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY), { pt, screen });
    };
    // passive: false 才能 preventDefault，阻止 WebView 本身的頁面縮放
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // 從圖層面板選到畫面外的物件時，捲動到該物件
  useEffect(() => {
    const { selected: target, layout: currentLayout, zoom: currentZoom, scroll: currentScroll, viewport: size } =
      latest.current;
    if (!target || size.width === 0) return;
    const topLeft = screenToPt(currentLayout, currentZoom, currentScroll, { x: 0, y: 0 });
    const bottomRight = screenToPt(currentLayout, currentZoom, currentScroll, { x: size.width, y: size.height });
    const visible = { minX: topLeft.x, minY: topLeft.y, maxX: bottomRight.x, maxY: bottomRight.y };
    const elementBounds = getElementBounds(target);
    if (boundsIntersect(elementBounds, visible)) return;
    applyScroll(
      scrollForAnchor(currentLayout, currentZoom, boundsCenter(elementBounds), { x: size.width / 2, y: size.height / 2 }),
    );
  }, [state.selectedId, applyScroll]);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const stage = transformer.getStage();
    const node =
      selected && selected.id !== editingId && stage
        ? stage.findOne((candidate: Konva.Node) => candidate.id() === selected.id)
        : undefined;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selected, editingId, fontsReady, viewport.width]);

  const editingElement = page.elements.find((element) => element.id === editingId);
  const editingText = editingElement?.type === "text" ? editingElement : null;

  useEffect(() => {
    if (editingId !== null && !editingText) setEditingId(null);
  }, [editingId, editingText]);

  const handleSelect = useCallback((id: ElementId) => dispatch({ type: "selection/set", id }), [dispatch]);
  const handleChange = useCallback(
    (id: ElementId, patch: ElementPatch) => dispatch({ type: "element/update", id, patch }),
    [dispatch],
  );
  const handleEditText = useCallback(
    (id: ElementId) => {
      dispatch({ type: "selection/set", id });
      setEditingId(id);
    },
    [dispatch],
  );

  const handleStageMouseDown = (event: KonvaEventObject<MouseEvent | TouchEvent>): void => {
    const target = event.target;
    if (target === target.getStage() || target.hasName(PAGE_BACKGROUND_NAME)) {
      dispatch({ type: "selection/set", id: null });
    }
  };

  const transformerOptions = selected ? TRANSFORMER_OPTIONS[selected.type] : TRANSFORMER_OPTIONS.rect;
  const origin = { x: layout.offsetX - scroll.x, y: layout.offsetY - scroll.y };

  return (
    <div
      ref={scrollRef}
      className="relative min-h-0 flex-1 overflow-scroll bg-muted"
      style={{ cursor: pan.cursor ?? create.cursor }}
      onScroll={(event) => setScroll({ x: event.currentTarget.scrollLeft, y: event.currentTarget.scrollTop })}
      // 平移優先（手形 / 空白鍵 / 中鍵）；平移攔下的事件，建立工具不再處理
      onPointerDownCapture={(event) => {
        pan.handlers.onPointerDownCapture(event);
        create.handlers.onPointerDownCapture(event);
      }}
      onPointerMove={(event) => {
        pan.handlers.onPointerMove(event);
        create.handlers.onPointerMove(event);
      }}
      onPointerUp={(event) => {
        pan.handlers.onPointerUp();
        create.handlers.onPointerUp(event);
      }}
      onLostPointerCapture={() => {
        pan.handlers.onLostPointerCapture();
        create.handlers.onLostPointerCapture();
      }}
      onMouseDownCapture={pan.handlers.onMouseDownCapture}
    >
      <div className="relative" style={{ width: layout.contentWidth, height: layout.contentHeight }}>
        {/* Stage 只有視窗大小並黏在可視範圍，捲動時改變 Layer 位移，避免建立超大 canvas */}
        <div className="sticky top-0 left-0 overflow-hidden" style={{ width: viewport.width, height: viewport.height }}>
          {fontsReady && viewport.width > 0 && (
            <Stage
              width={viewport.width}
              height={viewport.height}
              onMouseDown={handleStageMouseDown}
              onTouchStart={handleStageMouseDown}
            >
              <Layer x={origin.x} y={origin.y} scaleX={zoom} scaleY={zoom}>
                <Rect
                  name={PAGE_BACKGROUND_NAME}
                  width={page.width}
                  height={page.height}
                  fill={page.background}
                  shadowColor="#000000"
                  shadowBlur={16}
                  shadowOpacity={0.12}
                  shadowOffsetY={2}
                />
                {page.elements.map((element) => (
                  <ElementNode
                    key={element.id}
                    element={element}
                    hidden={element.id === editingId}
                    onSelect={handleSelect}
                    onChange={handleChange}
                    onEditText={handleEditText}
                  />
                ))}
                {/* 不裁切超出頁面的物件；頁緣線畫在物件之上，讓頁面範圍始終可見 */}
                <Rect width={page.width} height={page.height} stroke="#a3a3a3" strokeWidth={1 / zoom} listening={false} />
                <Transformer
                  ref={transformerRef}
                  enabledAnchors={[...transformerOptions.anchors]}
                  keepRatio={transformerOptions.keepRatio}
                  flipEnabled={false}
                  rotateAnchorOffset={24}
                  anchorSize={8}
                  anchorCornerRadius={2}
                  borderStroke="#6366f1"
                  anchorStroke="#6366f1"
                  boundBoxFunc={(oldBox, newBox) =>
                    Math.abs(newBox.width) < 4 || Math.abs(newBox.height) < 4 ? oldBox : newBox
                  }
                />
              </Layer>
            </Stage>
          )}
          <div
            ref={create.previewRef}
            aria-hidden
            className={cn(
              "pointer-events-none absolute border border-dashed border-primary bg-primary/5",
              state.tool === "shape" && state.shapeKind === "ellipse" && "rounded-[50%]",
              !create.previewVisible && "hidden",
            )}
          />
          {draftText && (
            <TextEditorOverlay
              key={draftText.id}
              element={draftText}
              zoom={zoom}
              origin={origin}
              onCommit={(text) => {
                setDraftText(null);
                if (text.trim().length > 0) dispatch({ type: "element/add", element: { ...draftText, text } });
              }}
              onCancel={() => setDraftText(null)}
            />
          )}
          {editingText && (
            <TextEditorOverlay
              key={editingText.id}
              element={editingText}
              zoom={zoom}
              origin={origin}
              onCommit={(text) => {
                setEditingId(null);
                if (text.trim().length === 0) {
                  dispatch({ type: "element/delete", id: editingText.id });
                } else {
                  dispatch({ type: "element/update", id: editingText.id, patch: { text } });
                }
              }}
              onCancel={() => setEditingId(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
