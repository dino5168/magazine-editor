import type { MouseEvent, ReactElement } from "react";
import { ImagePlus } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { selectActivePage, selectSelectedElement } from "@/lib/editor/editor-reducer";
import { canReorder } from "@/lib/editor/layer-order";
import { loadImageSize } from "@/lib/editor/image";
import { imageToFrame } from "@/lib/editor/shape-image";
import type { CanvasElement, ElementPatch, ImageElement } from "@/lib/editor/types";
import { useLibraryControl } from "@/lib/library/library-context";
import { useProject } from "@/lib/project/project-context";
import { ALIGN_EDGES, defaultKeepRatio, FILL_ITEMS, REORDER_ITEMS, useContentAlign } from "./element-arrange";

/** The selected element's items: 圖層順序 ─ 填滿 ─ 對齊內容區 (same results as the 屬性面板「調整」分頁). */
function ElementItems({ element }: { readonly element: CanvasElement }) {
  const dispatch = useEditorDispatch();
  const elements = selectActivePage(useEditorState()).elements;
  const { axes, fillDisabledReason, fillPatch, alignPatch } = useContentAlign(element);
  const apply = (patch: ElementPatch | null) => {
    if (patch) dispatch({ type: "element/update", id: element.id, patch });
  };
  const reasons = [...new Set(axes.map(fillDisabledReason).filter((reason) => reason !== null))];

  return (
    <>
      {REORDER_ITEMS.map(({ direction, label, icon: Icon }) => (
        <ContextMenuItem
          key={direction}
          disabled={!canReorder(elements, element.id, direction)}
          onSelect={() => dispatch({ type: "element/reorder", id: element.id, direction })}
        >
          <Icon />
          {label}
        </ContextMenuItem>
      ))}
      <ContextMenuSeparator />
      {axes.map((axis) => {
        const { label, icon: Icon } = FILL_ITEMS[axis];
        return (
          // 右鍵選單沒有「限制寬高比」開關：照屬性面板的預設（圖片保持比例）
          <ContextMenuItem key={axis} disabled={fillDisabledReason(axis) !== null} onSelect={() => apply(fillPatch(axis, defaultKeepRatio(element)))}>
            <Icon />
            {label}
          </ContextMenuItem>
        );
      })}
      {reasons.map((reason) => (
        <ContextMenuLabel key={reason} className="text-xs font-normal text-muted-foreground">
          無法填滿：{reason}
        </ContextMenuLabel>
      ))}
      <ContextMenuSeparator />
      {ALIGN_EDGES.map(({ edge, label, icon: Icon }) => (
        <ContextMenuItem key={edge} onSelect={() => apply(alignPatch(edge))}>
          <Icon />
          {label}
        </ContextMenuItem>
      ))}
      {element.type === "image" && <ConvertToFrameItem image={element} />}
    </>
  );
}

/**
 * 「轉成圖片框」: the image becomes a rectangle holding it as its photo, in the same place (one undo
 * step); 屬性面板「圖形 → 換成」 then changes the shape. The photo's pixel size comes from the library,
 * else from loading the image.
 */
function ConvertToFrameItem({ image }: { readonly image: ImageElement }) {
  const dispatch = useEditorDispatch();
  const { getLibrary } = useLibraryControl();
  const { resolveSrc } = useProject();
  const convert = async () => {
    const item = getLibrary().items.find((candidate) => candidate.kind === "image" && candidate.src === image.src);
    let pixels = item?.kind === "image" ? { width: item.width, height: item.height } : null;
    if (!pixels) {
      const loaded = await loadImageSize(resolveSrc(image.src));
      // 讀不到時用物件的比例（照片照樣填滿外框）
      pixels = loaded.data ?? { width: image.width, height: image.height };
    }
    dispatch({ type: "element/replace", element: imageToFrame(image, pixels) });
  };
  return (
    <>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => void convert()}>
        <ImagePlus />
        轉成圖片框
      </ContextMenuItem>
    </>
  );
}

/** Several objects selected: say so and show the items disabled (多選的對齊 / 圖層順序另開任務). */
function MultiSelectionItems({ count }: { readonly count: number }) {
  const disabled = (items: readonly { readonly label: string; readonly icon: (typeof REORDER_ITEMS)[number]["icon"] }[]) =>
    items.map(({ label, icon: Icon }) => (
      <ContextMenuItem key={label} disabled>
        <Icon />
        {label}
      </ContextMenuItem>
    ));
  return (
    <>
      <ContextMenuLabel className="text-xs font-normal text-muted-foreground">已選取 {count} 個物件（只能對單一物件使用）</ContextMenuLabel>
      <ContextMenuSeparator />
      {disabled(REORDER_ITEMS)}
      <ContextMenuSeparator />
      {disabled([FILL_ITEMS.width, FILL_ITEMS.height])}
      <ContextMenuSeparator />
      {disabled(ALIGN_EDGES)}
    </>
  );
}

function ElementContextMenuContent() {
  const state = useEditorState();
  const element = selectSelectedElement(state);
  const count = state.selectedIds.length;
  return (
    <ContextMenuContent
      className="min-w-44"
      // 關閉後焦點不回到先前的元素（可能是面板的按鈕）：留在 body，空白鍵平移、Delete 等快捷鍵才照常
      onCloseAutoFocus={(event) => event.preventDefault()}
    >
      {element ? <ElementItems key={element.id} element={element} /> : count > 1 && <MultiSelectionItems count={count} />}
    </ContextMenuContent>
  );
}

interface ElementContextMenuProps {
  /** Whether a right click should open the menu (read when the `contextmenu` event arrives). */
  readonly canOpen: () => boolean;
  /** The element that receives right clicks (one DOM element, e.g. the div around the Stage). */
  readonly children: ReactElement;
}

/**
 * Right-click menu for the selected canvas object.
 *
 * A right-button `mousedown` already selects the object in Konva (and clears the selection on empty
 * space), and `contextmenu` arrives after that render, so the menu only has to ask `canOpen` (= something
 * is selected). When it may not open, the event's default is prevented: no menu, and no browser menu either.
 *
 * `modal={false}`: a modal menu sets `pointer-events: none` on the body, so a second right click on another
 * object would never reach Konva to select it.
 */
export function ElementContextMenu({ canOpen, children }: ElementContextMenuProps) {
  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger
        asChild
        onContextMenu={(event: MouseEvent) => {
          if (!canOpen()) event.preventDefault();
        }}
      >
        {children}
      </ContextMenuTrigger>
      <ElementContextMenuContent />
    </ContextMenu>
  );
}
