/**
 * 「圖層順序」「對齊內容區」的項目定義與 hook：屬性面板「調整」分頁、底部動作列的 `⋮` 與畫布的右鍵選單共用，
 * 三處的文字、icon、停用條件與結果都一樣。
 */
import { useMemo } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDown,
  ArrowUp,
  BringToFront,
  SendToBack,
  StretchHorizontal,
  StretchVertical,
  type LucideIcon,
} from "lucide-react";
import { alignContentPatch, contentArea, fillContentDisabledReason, fillContentPatch, type ContentEdge, type FillAxis } from "@/lib/editor/content-align";
import { useEditorState } from "@/lib/editor/editor-context";
import { selectActivePage } from "@/lib/editor/editor-reducer";
import type { ReorderDirection } from "@/lib/editor/layer-order";
import { lineLocalBounds } from "@/lib/editor/line-path";
import { textBlockHeight } from "@/lib/editor/shape-label";
import type { Bounds, CanvasElement, ElementPatch, TextElement } from "@/lib/editor/types";
import { resolveElementVariables, variableValues } from "@/lib/editor/variables";
import { measureTextLayout } from "@/lib/export/text-layout";

interface ArrangeItem {
  readonly label: string;
  readonly icon: LucideIcon;
}

/** Layer-order items in display order (屬性面板 shows them two per row). */
export const REORDER_ITEMS: readonly (ArrangeItem & { readonly direction: ReorderDirection })[] = [
  { direction: "top", label: "移到最上層", icon: BringToFront },
  { direction: "bottom", label: "移到最下層", icon: SendToBack },
  { direction: "up", label: "上移一層", icon: ArrowUp },
  { direction: "down", label: "下移一層", icon: ArrowDown },
];

export const REORDER_ITEM_BY_DIRECTION = Object.fromEntries(REORDER_ITEMS.map((item) => [item.direction, item])) as {
  readonly [D in ReorderDirection]: (typeof REORDER_ITEMS)[number];
};

export const FILL_ITEMS: { readonly [A in FillAxis]: ArrangeItem } = {
  width: { label: "填滿寬度", icon: StretchHorizontal },
  height: { label: "填滿高度", icon: StretchVertical },
};

export const ALIGN_EDGES: readonly (ArrangeItem & { readonly edge: ContentEdge })[] = [
  { edge: "left", label: "靠左對齊內容區", icon: AlignStartVertical },
  { edge: "centerX", label: "水平置中於內容區", icon: AlignCenterVertical },
  { edge: "right", label: "靠右對齊內容區", icon: AlignEndVertical },
  { edge: "top", label: "靠上對齊內容區", icon: AlignStartHorizontal },
  { edge: "centerY", label: "垂直置中於內容區", icon: AlignCenterHorizontal },
  { edge: "bottom", label: "靠下對齊內容區", icon: AlignEndHorizontal },
];

/** 「限制寬高比」的預設：圖片開（拉長照片很少是刻意的），其他關。右鍵選單沒有這個開關，一律用預設。 */
export function defaultKeepRatio(element: CanvasElement): boolean {
  return element.type === "image";
}

export interface ContentAlign {
  /** The content area of the sheet the element is on. */
  readonly area: Bounds;
  /** Fill axes the element has (text: width only, its height comes from the text). */
  readonly axes: readonly FillAxis[];
  /** Why filling along an axis is disabled, or null when it is enabled. */
  readonly fillDisabledReason: (axis: FillAxis) => string | null;
  /** Patch that fills the content area along an axis; null when there is nothing to do. */
  readonly fillPatch: (axis: FillAxis, keepRatio: boolean) => ElementPatch | null;
  /** Patch that moves the element to an edge / centre line; null when it is already there. */
  readonly alignPatch: (edge: ContentEdge) => ElementPatch | null;
}

/**
 * Content-area fill / align for an element on the active sheet (page or master page).
 *
 * Text height comes from the same Konva measurement as the canvas (after replacing variables the way the
 * canvas shows them); `estimateTextHeight` is only a rough guess and would put 靠下 / 垂直置中 off.
 *
 * Args:
 *   element: An element on the active sheet.
 *
 * Returns:
 *   The content area and functions producing `element/update` patches.
 */
export function useContentAlign(element: CanvasElement): ContentAlign {
  const state = useEditorState();
  const sheet = selectActivePage(state);
  const document = state.history.present;
  const area = contentArea(sheet, document.margins);
  const variables = useMemo(() => variableValues(document, sheet.id), [document, sheet.id]);
  const height = useMemo(() => {
    if (element.type === "line") {
      const bounds = lineLocalBounds(element);
      return bounds.maxY - bounds.minY;
    }
    if (element.type !== "text") return element.height;
    const shown = variables ? (resolveElementVariables(element, variables) as TextElement) : element;
    return textBlockHeight(measureTextLayout(shown).lines.length, element.fontSize, element.lineHeight);
  }, [element, variables]);
  return {
    area,
    axes: element.type === "text" ? ["width"] : ["width", "height"],
    fillDisabledReason: (axis) => fillContentDisabledReason(element, area, axis),
    fillPatch: (axis, keepRatio) => fillContentPatch(element, area, axis, keepRatio),
    alignPatch: (edge) => alignContentPatch(element, area, edge, height),
  };
}
