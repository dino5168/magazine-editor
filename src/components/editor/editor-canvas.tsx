import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Layer, Stage, Transformer } from "react-konva";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { selectActivePage, selectSelectedElement } from "@/lib/editor/editor-reducer";
import {
  boundsCenter,
  boundsIntersect,
  elementsInBox,
  expandBounds,
  getContentBounds,
  getElementBounds,
  offsetBounds,
  pageCenter,
  unionBounds,
} from "@/lib/editor/geometry";
import { usedFontFamilies } from "@/lib/editor/fonts";
import { canvasSheets, canvasSlotAt, pageAcrossSpine } from "@/lib/editor/spreads";
import { createLabel, labelAsText, labelFrame } from "@/lib/editor/shape-label";
import type { ElementId, ElementPatch, ElementType, PageId, Point, Size, TextElement } from "@/lib/editor/types";
import {
  clampZoom,
  computeLayout,
  fitZoom,
  screenToPt,
  scrollForAnchor,
  type ViewportLayout,
} from "@/lib/editor/viewport";
import { useFontsReady } from "@/lib/editor/use-fonts-ready";
import { usePreferences } from "@/lib/preferences/preferences-context";
import { cn } from "@/lib/utils";
import { isAdditive, snapAbsoluteToGrid } from "./canvas-elements";
import { CanvasSheet, PAGE_BACKGROUND_NAME, SpreadSpine, type ElementHandlers } from "./canvas-sheet";
import { TextEditorOverlay } from "./text-editor-overlay";
import { useCanvasCreate } from "./use-canvas-create";
import { useCanvasMarquee } from "./use-canvas-marquee";
import { useCanvasPan } from "./use-canvas-pan";

/** Extra scrollable space around the page and all elements, in screen pixels. */
const WORKSPACE_MARGIN_PX = 200;
const FIT_PADDING_PX = 40;
const WHEEL_ZOOM_SENSITIVITY = 0.0015;

type Anchor = { readonly pt: Point; readonly screen: Point };
type AnchorName = NonNullable<Konva.TransformerConfig["enabledAnchors"]>[number];

const ALL_ANCHORS: readonly AnchorName[] = [
  "top-left", "top-center", "top-right", "middle-right",
  "bottom-right", "bottom-center", "bottom-left", "middle-left",
];

const TRANSFORMER_OPTIONS: {
  readonly [K in ElementType]: { readonly anchors: readonly AnchorName[]; readonly keepRatio: boolean };
} = {
  text: { anchors: ["middle-left", "middle-right"], keepRatio: false },
  // 所有圖形都以外框定義，可以自由拉伸（多邊形與星形也是）
  shape: { anchors: ALL_ANCHORS, keepRatio: false },
  image: { anchors: ALL_ANCHORS, keepRatio: false },
};

/**
 * Konva editing surface: scrollable workspace, page, elements, selection and in-place text editing.
 *
 * Returns:
 *   Canvas area filling its container.
 */
export function EditorCanvas() {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const preferences = usePreferences();
  /** Grid spacing elements snap to, or null when snapping is off. */
  const snapSpacing = preferences.grid.snap ? preferences.grid.spacing : null;
  const page = selectActivePage(state);
  const selected = selectSelectedElement(state);
  const { zoom, fitRequest } = state.view;
  // 畫布（和匯出 PDF 的量測）要等文件用到的字型都載入才畫，換行寬度才正確；
  // 開啟用到其他字型的專案時，載入期間畫布會短暫消失
  const usedFamilies = useMemo(() => usedFontFamilies(state.history.present), [state.history.present]);
  const fontsReady = useFontsReady(usedFamilies);
  // 畫布上要畫的頁面：每頁放在 Layer 座標的 x 位移處（單頁模式只有目前頁，位移 0）。
  // Layer 座標＝「跨頁座標」；頁面自己的座標（物件、吸附）都在各頁的 Group 裡
  const document = state.history.present;
  const sheets = useMemo(() => canvasSheets(document, page.id, preferences.pageView), [document, page.id, preferences.pageView]);
  // 按到跨過書背的複本：到物件所屬的頁並選取它（page/select 會清空選取，所以先切頁再選取；已是目前頁時切頁不改變任何東西）
  const pickElement = useCallback(
    (pageId: PageId, elementId: ElementId) => {
      dispatch({ type: "page/select", id: pageId });
      dispatch({ type: "selection/set", id: elementId });
    },
    [dispatch],
  );
  /** True while an element is dragged or resized: the active page then shows it uncropped, on top. */
  const [interacting, setInteracting] = useState(false);
  // 目前頁最後畫：拖曳中不裁切時，跨過書背的物件才會蓋在對頁之上（平常兩頁都在書背處裁切，順序不影響）
  const drawOrder = useMemo(
    () => [...sheets.slots].sort((a, b) => Number(a.sheet.id === page.id) - Number(b.sheet.id === page.id)),
    [sheets, page.id],
  );
  /** Offset of the page being edited: page coordinates = layer coordinates − (activeX, 0). */
  const activeX = sheets.slots.find((slot) => slot.sheet.id === page.id)?.x ?? 0;

  const scrollRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  const [scroll, setScroll] = useState<Point>({ x: 0, y: 0 });
  const [editingId, setEditingId] = useState<ElementId | null>(null);
  // 文字工具剛建立、還沒輸入內容的文字：不在文件裡，輸入完成才 element/add（復原一次就撤銷）
  const [draftText, setDraftText] = useState<TextElement | null>(null);
  const pan = useCanvasPan(scrollRef, state.tool === "hand");

  // 物件可拖出頁面：捲動範圍涵蓋每一頁與所有物件，確保拖到遠處的物件仍拿得回來
  const bounds = useMemo(() => {
    const content = sheets.slots
      .map((slot) => offsetBounds(getContentBounds(slot.sheet), slot.x, 0))
      .reduce((acc, next) => unionBounds(acc, next));
    return expandBounds(content, WORKSPACE_MARGIN_PX / zoom);
  }, [sheets, zoom]);
  const layout = useMemo(() => computeLayout(bounds, zoom, viewport), [bounds, zoom, viewport]);

  // 選到畫面外的物件時捲過去：多選時看最後加入選取的那一個
  const lastSelectedId = state.selectedIds[state.selectedIds.length - 1];
  const scrollTarget = page.elements.find((element) => element.id === lastSelectedId) ?? null;

  // 原生事件 handler 與 layout effect 需要讀到最新值
  // 拖過書背的判斷（handleMoveEnd）：兩頁都看得到時才換頁
  const spreadShown = sheets.slots.length > 1;
  const pageIndex = sheets.slots.find((slot) => slot.sheet.id === page.id)?.pageIndex ?? -1;
  const dragContext = { spreadShown, pages: document.pages, pageIndex, elements: page.elements, snapSpacing };
  const latest = useRef({ layout, zoom, scroll, viewport, scrollTarget, activeX, sheets, ...dragContext });
  latest.current = { layout, zoom, scroll, viewport, scrollTarget, activeX, sheets, ...dragContext };
  // 螢幕像素 → 目前頁的頁面座標（框選以目前頁為準：對頁的背景按下時是切頁，不會開始框選）
  const toPagePt = (screen: Point): Point => {
    const current = latest.current;
    const pt = screenToPt(current.layout, current.zoom, current.scroll, screen);
    return { x: pt.x - current.activeX, y: pt.y };
  };
  // 建立工具：按下處的那一頁（跨頁時可能是對頁）與換到它的頁面座標
  const pageAt = (screen: Point) => {
    const current = latest.current;
    const toLayer = (point: Point) => screenToPt(current.layout, current.zoom, current.scroll, point);
    const slot = canvasSlotAt(current.sheets, toLayer(screen).x);
    return {
      pageId: slot.sheet.id,
      toPt: (point: Point): Point => {
        const pt = toLayer(point);
        return { x: pt.x - slot.x, y: pt.y };
      },
    };
  };
  const create = useCanvasCreate({
    scrollRef,
    tool: state.tool,
    shapeKind: state.shapeKind,
    pageAt,
    snapSpacing,
    onTextDraft: setDraftText,
  });
  const marquee = useCanvasMarquee({
    scrollRef,
    toPt: toPagePt,
    onSelectBox: (box, additive) =>
      dispatch({ type: "selection/setMany", ids: elementsInBox(page.elements, box), additive }),
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
    // 符合畫面：整個畫面上的頁面（單頁或跨頁）
    zoomAt(fitZoom(sheets, viewport, FIT_PADDING_PX), {
      pt: pageCenter(sheets),
      screen: { x: viewport.width / 2, y: viewport.height / 2 },
    });
  }, [fitRequest, viewport, sheets, zoomAt]);

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
    const {
      scrollTarget: target,
      layout: currentLayout,
      zoom: currentZoom,
      scroll: currentScroll,
      viewport: size,
      activeX: offsetX,
    } = latest.current;
    if (!target || size.width === 0) return;
    const topLeft = screenToPt(currentLayout, currentZoom, currentScroll, { x: 0, y: 0 });
    const bottomRight = screenToPt(currentLayout, currentZoom, currentScroll, { x: size.width, y: size.height });
    const visible = { minX: topLeft.x, minY: topLeft.y, maxX: bottomRight.x, maxY: bottomRight.y };
    // 物件的外框是頁面座標，換到 Layer 座標再比較
    const elementBounds = offsetBounds(getElementBounds(target), offsetX, 0);
    if (boundsIntersect(elementBounds, visible)) return;
    applyScroll(
      scrollForAnchor(currentLayout, currentZoom, boundsCenter(elementBounds), { x: size.width / 2, y: size.height / 2 }),
    );
  }, [lastSelectedId, applyScroll]);

  // 多選時 Transformer 掛所有選取的節點：拖曳其中一個，Konva 會讓其他節點跟著移動
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const stage = transformer.getStage();
    const ids = new Set(state.selectedIds.filter((id) => id !== editingId));
    const nodes = stage && ids.size > 0 ? stage.find((candidate: Konva.Node) => ids.has(candidate.id())) : [];
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
    // page.elements：物件更新後節點可能換新（例如圖片載入完成），要重新掛上
  }, [state.selectedIds, page.elements, editingId, fontsReady, viewport.width]);

  const editingElement = page.elements.find((element) => element.id === editingId);
  const editingText = editingElement?.type === "text" ? editingElement : null;
  // 雙擊圖形：編輯圖形內文字（還沒有文字時用預設樣式的空白文字開始）
  const editingShape = editingElement?.type === "shape" ? editingElement : null;
  const editingLabel = editingShape ? (editingShape.label ?? createLabel("")) : null;

  useEffect(() => {
    // 物件被刪除或復原掉時結束編輯
    if (editingId !== null && !editingText && !editingShape) setEditingId(null);
  }, [editingId, editingText, editingShape]);

  // 吸附格線的拖曳：被拖曳的物件（lead）對齊格線，整組用同一個位移，相對位置不變。
  // 多選時 Konva Transformer 在 lead 第一次 dragmove 之後才讓其他節點開始拖曳，它們的「滑鼠偏移」
  // 已經含有 lead 第一次的吸附修正，不能用各自的位置推算；一律從滑鼠位置推回 lead 的原始位置。
  // 第一個呼叫的節點就是 lead（按下的那一個）；起點在第一次呼叫時記錄（節點還沒移動），dragend 時清空
  // 吸附以 lead 所在頁面的 Group 為準（跨頁時右頁的 Group 有位移，不能用 Layer 的座標）
  const dragSessionRef = useRef<{
    lead: { readonly start: Konva.Vector2d; readonly pointerOffset: Konva.Vector2d; readonly page: Konva.Node } | null;
    starts: Map<ElementId, Konva.Vector2d>;
  }>({ lead: null, starts: new Map() });
  const dragBound = useMemo(() => {
    if (snapSpacing === null) return null;
    return (id: ElementId, pos: Konva.Vector2d): Konva.Vector2d => {
      const transformer = transformerRef.current;
      const layer = transformer?.getLayer();
      const pointer = layer?.getStage()?.getPointerPosition();
      if (!transformer || !layer || !pointer) return pos;
      const session = dragSessionRef.current;
      if (session.lead === null) {
        for (const node of transformer.nodes()) session.starts.set(node.id(), node.getAbsolutePosition());
        const node = layer.findOne((candidate: Konva.Node) => candidate.id() === id);
        const start = node?.getAbsolutePosition() ?? pos;
        session.starts.set(id, start);
        // pos = 滑鼠位置 − Konva 的拖曳偏移，反推回偏移量
        session.lead = {
          start,
          pointerOffset: { x: pointer.x - pos.x, y: pointer.y - pos.y },
          page: node?.getParent() ?? layer,
        };
      }
      const { lead, starts } = session;
      const self = starts.get(id);
      if (!self) return pos;
      const leadRaw = { x: pointer.x - lead.pointerOffset.x, y: pointer.y - lead.pointerOffset.y };
      const leadSnapped = snapAbsoluteToGrid(lead.page, leadRaw, snapSpacing);
      return { x: self.x + leadSnapped.x - lead.start.x, y: self.y + leadSnapped.y - lead.start.y };
    };
  }, [snapSpacing]);

  // Ctrl+點擊加入 / 移出選取；點已選取的物件保留整組選取，才能拖曳整組
  const handleSelect = useCallback(
    (id: ElementId, additive: boolean) => {
      if (additive) dispatch({ type: "selection/toggle", id });
      else if (!state.selectedIds.includes(id)) dispatch({ type: "selection/set", id });
    },
    [dispatch, state.selectedIds],
  );
  const handleChange = useCallback(
    (id: ElementId, patch: ElementPatch) => dispatch({ type: "element/update", id, patch }),
    [dispatch],
  );
  // 整組拖曳時 Konva 會讓每個節點都觸發 dragend：每次都寫入整組位置，第一次之後的寫入沒有變化，reducer 不產生歷史
  const handleMoveEnd = useCallback(
    (id: ElementId, node: Konva.Node) => {
      dragSessionRef.current = { lead: null, starts: new Map() };
      const group = transformerRef.current?.nodes() ?? [];
      const members = group.length > 1 && group.includes(node) ? group : [node];
      const moves = members.map((member) => ({ id: member.id(), patch: { x: member.x(), y: member.y() } }));
      // 雙頁時放下的整組中心過了書背：一筆復原裡搬到對頁（只在兩頁都看得到時，避免搬到畫面外的頁）
      const { spreadShown, pages, pageIndex, elements, snapSpacing: spacing } = latest.current;
      if (spreadShown) {
        const dropped = moves
          .map(({ id: movedId, patch }) => {
            const element = elements.find((candidate) => candidate.id === movedId);
            return element ? getElementBounds({ ...element, ...patch }) : null;
          })
          .filter((bounds): bounds is NonNullable<typeof bounds> => bounds !== null);
        if (dropped.length === moves.length) {
          const box = dropped.reduce((acc, next) => unionBounds(acc, next));
          const across = pageAcrossSpine(pages, pageIndex, (box.minX + box.maxX) / 2);
          if (across) {
            // 吸附格線時：拖曳是對齊原本那一頁的格線，頁寬不一定是間距的倍數，換頁後把整組（相對位置不變）對齊到新頁的格線
            // 參考被拖的那一個（拖曳時只有它對齊格線，其他成員保持相對位置）
            const leadX = (moves.find((move) => move.id === id) ?? moves[0]).patch.x + across.dx;
            const align = spacing === null ? 0 : Math.round(leadX / spacing) * spacing - leadX;
            dispatch({ type: "element/moveToPage", moves, pageId: across.pageId, dx: across.dx + align });
            return;
          }
        }
      }
      if (moves.length > 1) dispatch({ type: "element/updateMany", patches: moves });
      else dispatch({ type: "element/update", id, patch: moves[0].patch });
    },
    [dispatch],
  );
  const handleEditText = useCallback(
    (id: ElementId) => {
      dispatch({ type: "selection/set", id });
      setEditingId(id);
    },
    [dispatch],
  );

  // 按在空白處 / 頁面背景：清空選取並開始框選（手形、建立工具在 capture 階段就攔下，不會到這裡）
  const handleStageMouseDown = (event: KonvaEventObject<MouseEvent | TouchEvent>): void => {
    const target = event.target;
    if (target !== target.getStage() && !target.hasName(PAGE_BACKGROUND_NAME)) return;
    // Ctrl 點歪到空白處時不清空，避免整組選取一下就沒了；Ctrl 框選 = 加入選取
    const additive = event.evt instanceof MouseEvent && isAdditive(event.evt);
    if (!additive) dispatch({ type: "selection/set", id: null });
    if (event.evt instanceof MouseEvent) marquee.start(event.evt, additive);
  };

  // 多選只能一起移動：不顯示縮放與旋轉控制點
  const multiSelected = state.selectedIds.length > 1;
  // 縮放時把拖曳中的控制點對齊格線；旋轉過的物件外框邊不在格線方向上，不吸附
  const snapAnchor =
    snapSpacing !== null && selected && selected.rotation % 360 === 0
      ? (_oldPos: Konva.Vector2d, newPos: Konva.Vector2d): Konva.Vector2d => {
          // 以被縮放物件所在頁面的 Group 為準（跨頁時右頁有位移）
          const page = transformerRef.current?.nodes()[0]?.getParent();
          return page ? snapAbsoluteToGrid(page, newPos, snapSpacing) : newPos;
        }
      : undefined;
  const transformerOptions = selected ? TRANSFORMER_OPTIONS[selected.type] : TRANSFORMER_OPTIONS.shape;
  const origin = { x: layout.offsetX - scroll.x, y: layout.offsetY - scroll.y };
  // 目前頁的左上角在螢幕上的位置：文字編輯框用頁面座標定位
  const sheetOrigin = { x: origin.x + activeX * zoom, y: origin.y };
  const elementHandlers = useMemo<ElementHandlers>(
    () => ({ onSelect: handleSelect, onChange: handleChange, onMoveEnd: handleMoveEnd, onEditText: handleEditText, dragBound }),
    [handleSelect, handleChange, handleMoveEnd, handleEditText, dragBound],
  );

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
              <Layer
                x={origin.x}
                y={origin.y}
                scaleX={zoom}
                scaleY={zoom}
                // 拖曳物件中：目前頁暫時不在書背處裁切，跨過書背時仍看得到整個物件
                onDragStart={() => setInteracting(true)}
                onDragEnd={() => setInteracting(false)}
              >
                {drawOrder.map((slot) => (
                  <CanvasSheet
                    key={slot.sheet.id}
                    sheet={slot.sheet}
                    x={slot.x}
                    pageIndex={slot.pageIndex}
                    zoom={zoom}
                    editingId={editingId}
                    handlers={elementHandlers}
                    active={slot.sheet.id === page.id}
                    onActivate={(elementId) => {
                      // page/select 會清空選取，之後才選對頁上被按的物件（兩個 action 依序套用）
                      dispatch({ type: "page/select", id: slot.sheet.id });
                      if (elementId) dispatch({ type: "selection/set", id: elementId });
                    }}
                    highlighted={sheets.slots.length > 1 && slot.sheet.id === page.id}
                    clipAtSpine={sheets.slots.length > 1 && !(interacting && slot.sheet.id === page.id)}
                    onPickElsewhere={pickElement}
                  />
                ))}
                {preferences.pageView === "spread" && <SpreadSpine sheets={sheets} zoom={zoom} />}
                {/* Transformer 在所有頁面之上；它掛的節點在各頁的 Group 裡，Konva 會換算位移 */}
                <Transformer
                  ref={transformerRef}
                  enabledAnchors={multiSelected ? [] : [...transformerOptions.anchors]}
                  rotateEnabled={!multiSelected}
                  keepRatio={transformerOptions.keepRatio}
                  flipEnabled={false}
                  // 控制框貼著外框（不含邊線的外半邊），拖曳控制點換算的 scale 才對應 width / height
                  ignoreStroke
                  rotateAnchorOffset={24}
                  anchorSize={8}
                  anchorCornerRadius={2}
                  borderStroke="#6366f1"
                  anchorStroke="#6366f1"
                  boundBoxFunc={(oldBox, newBox) =>
                    Math.abs(newBox.width) < 4 || Math.abs(newBox.height) < 4 ? oldBox : newBox
                  }
                  anchorDragBoundFunc={snapAnchor}
                  onTransformStart={() => setInteracting(true)}
                  onTransformEnd={() => setInteracting(false)}
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
          <div
            ref={marquee.previewRef}
            aria-hidden
            className={cn(
              "pointer-events-none absolute border border-primary bg-primary/10",
              !marquee.previewVisible && "hidden",
            )}
          />
          {draftText && (
            <TextEditorOverlay
              key={draftText.id}
              element={draftText}
              zoom={zoom}
              origin={sheetOrigin}
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
              origin={sheetOrigin}
              onCommit={(text) => {
                setEditingId(null);
                if (text.trim().length === 0) {
                  dispatch({ type: "element/delete", ids: [editingText.id] });
                } else {
                  dispatch({ type: "element/update", id: editingText.id, patch: { text } });
                }
              }}
              onCancel={() => setEditingId(null)}
            />
          )}
          {editingShape && editingLabel && (
            <TextEditorOverlay
              key={editingShape.id}
              element={labelAsText(editingShape, editingLabel, labelFrame(editingShape))}
              frame={{ height: labelFrame(editingShape).height, verticalAlign: editingLabel.verticalAlign }}
              zoom={zoom}
              origin={sheetOrigin}
              onCommit={(text) => {
                setEditingId(null);
                // 清空文字 = 移除圖形內文字；原本就沒有文字時不產生歷史
                const label = text.trim().length === 0 ? null : { ...editingLabel, text };
                if (label !== null || editingShape.label !== null) {
                  dispatch({ type: "element/update", id: editingShape.id, patch: { label } });
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
