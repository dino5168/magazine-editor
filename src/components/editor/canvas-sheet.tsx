import { useMemo } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Line, Rect } from "react-konva";
import { useEditorState } from "@/lib/editor/editor-context";
import { inheritedElements } from "@/lib/editor/master-pages";
import { pageNumberShape } from "@/lib/editor/page-numbers";
import { pageSide, spilloverInto, type CanvasSheets } from "@/lib/editor/spreads";
import type { ElementId, PageId, Sheet } from "@/lib/editor/types";
import { resolveElementsVariables, resolveElementVariables, variableValues } from "@/lib/editor/variables";
import { measureLineWidth } from "@/lib/export/text-layout";
import { usePreferences } from "@/lib/preferences/preferences-context";
import { ElementNode, StaticElement, StaticShape, type ElementNodeProps } from "./canvas-elements";
import { ContentGuides, MarginGuide, PageGrid } from "./page-guides";

/** Konva name of a sheet's background rect: a press on it counts as a press on empty space. */
export const PAGE_BACKGROUND_NAME = "page-background";

/**
 * The spine of a spread: a line between the two pages, or on the inner edge of a page shown alone
 * (the cover's left edge, an even last page's right edge).
 *
 * Args:
 *   props.sheets: What the canvas shows.
 *   props.zoom: Current zoom (keeps the line 1 px wide on screen).
 *
 * Returns:
 *   Konva line, or null outside spread view.
 */
export function SpreadSpine({ sheets, zoom }: { readonly sheets: CanvasSheets; readonly zoom: number }) {
  const { slots, height } = sheets;
  const first = slots[0];
  if (!first || first.pageIndex < 0) return null;
  const x = slots.length > 1 ? slots[1].x : pageSide(first.pageIndex) === "right" ? first.x : first.x + first.sheet.width;
  return <Line points={[x, 0, x, height]} stroke="#737373" strokeWidth={1.5 / zoom} dash={[6 / zoom, 4 / zoom]} listening={false} />;
}

/** Callbacks of the editable elements (shared by every sheet; see `ElementNode`). */
export type ElementHandlers = Pick<ElementNodeProps, "onSelect" | "onChange" | "onMoveEnd" | "onEditText" | "dragBound">;

interface CanvasSheetProps {
  readonly sheet: Sheet;
  /** Left edge in the canvas layer's coordinates (spread view puts the right page after the left one). */
  readonly x: number;
  /** 0-based page index; -1 for a master page (no page number, variables as written). */
  readonly pageIndex: number;
  readonly zoom: number;
  /** Element whose text is being edited in place (hidden on the canvas meanwhile). */
  readonly editingId: string | null;
  readonly handlers: ElementHandlers;
  /**
   * False for the facing page of a spread: drawn the same but not editable; pressing anywhere on it
   * makes it the page being edited (`onActivate`), pressing one of its elements also selects it.
   */
  readonly active: boolean;
  readonly onActivate: (elementId: ElementId | null) => void;
  /** A press on a copy of a facing-page element crossing the spine: edit that page and select it. */
  readonly onPickElsewhere: (pageId: PageId, elementId: ElementId) => void;
  /** Outline the page as the one being edited (only meaningful when two pages are shown). */
  readonly highlighted: boolean;
  /**
   * Crop the sheet's own elements at the spine (spread view, both pages shown): what crosses it is
   * drawn by the facing page's copy instead, in the same stacking order as the export. Off while an
   * element of the page is being dragged or resized, so the whole object stays visible.
   */
  readonly clipAtSpine: boolean;
}

/** Far enough to leave the non-spine sides of a page unclipped (elements may stick out of the page). */
const UNCLIPPED = 100_000;

/** Konva clip of a page's spine side: a left page is cut at its right edge, a right page at its left edge. */
function spineClip(sheet: Sheet, pageIndex: number) {
  const left = pageSide(pageIndex) === "left";
  return {
    clipX: left ? -UNCLIPPED : 0,
    clipY: -UNCLIPPED,
    clipWidth: left ? UNCLIPPED + sheet.width : UNCLIPPED,
    clipHeight: 2 * UNCLIPPED,
  };
}

/**
 * One page or master page on the canvas, drawn in a Konva Group placed at `x`: inside the group the
 * coordinates are the sheet's own (pt from its top-left corner), so elements, `bakeTransform` and
 * the grid work unchanged whichever side of a spread the sheet is on.
 *
 * Bottom to top: background, grid, master page content (static), the facing page's elements crossing
 * the spine (static copies, cropped to this page's side), the sheet's elements, page number, margin
 * guides, page edge — the same stacking as the export. Text variables take the values of the page each
 * element belongs to.
 *
 * Args:
 *   props: Sheet, its offset and index, zoom, the element being edited and the element callbacks.
 *
 * Returns:
 *   Konva group.
 */
export function CanvasSheet({
  sheet,
  x,
  pageIndex,
  zoom,
  editingId,
  handlers,
  active,
  onActivate,
  highlighted,
  clipAtSpine,
  onPickElsewhere,
}: CanvasSheetProps) {
  const document = useEditorState().history.present;
  const preferences = usePreferences();
  const { masters, pageNumberRules, margins } = document;
  // 變數（{頁碼} 等）換成這一頁的值；主頁是 null，照原文顯示。文字編輯框仍編輯原文（sheet.elements）
  const variables = useMemo(() => variableValues(document, sheet.id), [document, sheet.id]);
  // 主頁（含父主頁）的物件畫在這一頁的物件底下；不能選取，要改就切去編輯主頁
  const inherited = useMemo(
    () => resolveElementsVariables(inheritedElements(masters, sheet), variables),
    [masters, sheet, variables],
  );
  const shownElements = useMemo(() => resolveElementsVariables(sheet.elements, variables), [sheet.elements, variables]);
  // 對頁跨過書背的物件：和匯出一樣畫在主頁內容之上、這一頁的物件之下，變數用物件所屬頁的值；
  // 只顯示落在這一頁書背側以內的部分（紙張會裁掉其餘部分）
  const spillover = useMemo(
    () =>
      spilloverInto(document.pages, pageIndex).map(({ element, sourceIndex, dx }) => {
        const pageId = document.pages[sourceIndex].id;
        const values = variableValues(document, pageId);
        return { pageId, element: { ...(values ? resolveElementVariables(element, values) : element), x: element.x + dx } };
      }),
    [document, pageIndex],
  );
  const clip = useMemo(() => spineClip(sheet, pageIndex), [sheet, pageIndex]);
  // 畫布只在字型載入後才建立 Stage，這裡量測頁碼寬度是安全的；主頁（-1）沒有頁碼
  const pageNumber = useMemo(
    () => pageNumberShape(sheet, pageIndex, pageNumberRules, margins, measureLineWidth),
    [sheet, pageIndex, pageNumberRules, margins],
  );

  // 對頁（不是目前頁）：按下就切成目前頁（按在物件上順便選取它），事件停在這裡，不會清空選取或開始框選。
  // 物件要等切頁後重畫成 ElementNode 才能拖曳，所以第一次按下只切頁與選取
  const activate = (event: KonvaEventObject<Event>, elementId: ElementId | null = null): void => {
    if (active) return;
    event.cancelBubble = true;
    onActivate(elementId);
  };

  return (
    <Group x={x} onMouseDown={activate} onTouchStart={activate}>
      <Rect
        name={PAGE_BACKGROUND_NAME}
        width={sheet.width}
        height={sheet.height}
        fill={sheet.background}
        shadowColor="#000000"
        shadowBlur={16}
        shadowOpacity={0.12}
        shadowOffsetY={2}
      />
      {/* 格線與內容區對齊線在頁面背景之上、物件之下，各自有開關 */}
      {preferences.grid.visible && (
        <PageGrid page={sheet} spacing={preferences.grid.spacing} style={preferences.lineStyles.grid} zoom={zoom} />
      )}
      {preferences.showContentGuides && (
        <ContentGuides page={sheet} margins={margins} style={preferences.lineStyles.contentGuides} zoom={zoom} />
      )}
      {inherited.map((element) => (
        <StaticElement key={`master:${element.id}`} element={element} />
      ))}
      {spillover.length > 0 && (
        <Group {...clip}>
          {spillover.map(({ pageId, element }) => (
            // 按複本 = 到物件所屬的頁並選取它（事件停在這裡，不會變成「切到這一頁」）
            <Group
              key={`spill:${element.id}`}
              onMouseDown={(event) => {
                event.cancelBubble = true;
                onPickElsewhere(pageId, element.id);
              }}
              onTouchStart={(event) => {
                event.cancelBubble = true;
                onPickElsewhere(pageId, element.id);
              }}
            >
              <StaticElement element={element} listening />
            </Group>
          ))}
        </Group>
      )}
      {/* 這一頁自己的物件；雙頁時在書背處裁切，跨過去的部分由對頁的複本畫（和匯出的疊放順序一樣） */}
      <Group {...(clipAtSpine ? clip : {})}>
        {shownElements.map((element) =>
          active ? (
            <ElementNode key={element.id} element={element} textHidden={element.id === editingId} {...handlers} />
          ) : (
            // 對頁的物件：選取只屬於目前頁，所以按下時先切頁再選取
            <Group key={element.id} onMouseDown={(event) => activate(event, element.id)} onTouchStart={(event) => activate(event, element.id)}>
              <StaticElement element={element} listening />
            </Group>
          ),
        )}
      </Group>
      {/* 頁碼由文件的頁碼設定算出，不是物件：不能選取、不在圖層面板；「顯示頁碼」關閉時只是不畫，匯出照常 */}
      {preferences.showPageNumbers && pageNumber && <StaticShape shape={pageNumber} />}
      {/* 不裁切超出頁面的物件；頁緣線畫在物件之上，讓頁面範圍始終可見 */}
      {/* 格線與邊界參考線都不攔事件、不算進內容範圍，也不會匯出 */}
      {preferences.showMargins && <MarginGuide page={sheet} margins={margins} style={preferences.lineStyles.margins} zoom={zoom} />}
      <Rect
        width={sheet.width}
        height={sheet.height}
        // 兩頁並排時，用主色框出正在編輯的那一頁
        stroke={highlighted ? "#6366f1" : "#a3a3a3"}
        strokeWidth={(highlighted ? 2 : 1) / zoom}
        listening={false}
      />
    </Group>
  );
}
