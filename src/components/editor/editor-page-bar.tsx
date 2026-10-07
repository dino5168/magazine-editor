import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Menu, Plus, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { parsePageNumber, stepPageIndex, type PageStep } from "@/lib/editor/page-navigation";
import { movePage, slotToIndex } from "@/lib/editor/page-order";
import type { Page, PageId } from "@/lib/editor/types";
import { PAGE_NAME_MAX_LENGTH } from "@/lib/editor/validation";
import { DragGhost } from "../drag-ghost";
import { IconButton } from "./icon-button";
import { InlineNameInput } from "./inline-name-input";
import { usePageDialogs } from "./page-dialogs";
import { PageMenu } from "./page-menu";
import { usePageTabDrag } from "./use-page-tab-drag";

interface EditorPageBarProps {
  readonly className?: string;
}

/**
 * draw.io-style page tabs: add, switch, rename (double-click) and delete pages.
 *
 * Args:
 *   props.className: Extra classes for grid placement.
 *
 * Returns:
 *   Footer bar with page tabs.
 */
export function EditorPageBar({ className }: EditorPageBarProps) {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const { openAddPages } = usePageDialogs();
  const [renamingId, setRenamingId] = useState<PageId | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Page | null>(null);
  const tabListRef = useRef<HTMLDivElement>(null);
  const { pages } = state.history.present;
  const activeIndex = pages.findIndex((page) => page.id === state.activePageId);

  // 切換頁面（含新增、`<` `>`、復原）時把目前頁籤捲進畫面
  useEffect(() => {
    const tab = tabListRef.current?.querySelector<HTMLElement>(`[data-page-id="${CSS.escape(state.activePageId)}"]`);
    tab?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [state.activePageId, pages.length]);

  // 拖曳頁籤調整順序：放下的空隙換算成新位置，位置沒變就不寫入（一次 = 一筆復原）
  const dropTab = useCallback(
    (id: PageId, slot: number) => {
      const order = pages.map((page) => page.id);
      const next = movePage(order, id, slotToIndex(slot, order.indexOf(id)));
      if (next !== order) dispatch({ type: "page/reorder", order: next });
    },
    [pages, dispatch],
  );
  const { drag, startDrag, ghostRef } = usePageTabDrag(tabListRef, dropTab);
  // 只在放下會改變順序時畫插入線（拖到自己左右兩側不畫）
  const dragFrom = drag ? pages.findIndex((page) => page.id === drag.id) : -1;
  const dropSlot = drag?.slot != null && slotToIndex(drag.slot, dragFrom) !== dragFrom ? drag.slot : null;

  const selectPageAt = (index: number | null) => {
    const page = index === null ? undefined : pages[index];
    if (page) dispatch({ type: "page/select", id: page.id });
  };
  const step = (to: PageStep) => selectPageAt(stepPageIndex(to, activeIndex, pages.length));

  return (
    <footer className={cn("flex h-10 items-stretch border-t bg-background", className)}>
      <div className="flex items-center gap-0.5 border-r px-1.5">
        <IconButton label="新增頁面" onClick={() => openAddPages("end")}>
          <Plus />
        </IconButton>
        <PageMenu>
          <IconButton label="所有頁面">
            <Menu />
          </IconButton>
        </PageMenu>
      </div>

      <div
        ref={tabListRef}
        role="tablist"
        aria-label="頁面"
        // 捲軸會被頁籤列的高度壓住，所以隱藏；改用滾輪（直向轉橫向）與 `<` `>` 切換頁面
        onWheel={(event) => {
          if (event.deltaX === 0) event.currentTarget.scrollLeft += event.deltaY;
        }}
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none]"
      >
        {pages.map((page, index) => {
          const active = page.id === state.activePageId;
          const renaming = renamingId === page.id;
          return (
            <div
              key={page.id}
              data-page-id={page.id}
              role="tab"
              tabIndex={0}
              aria-selected={active}
              title="雙擊可重新命名，拖曳可調整順序"
              onPointerDown={(event) => {
                // 選單、刪除按鈕與改名輸入框照常操作，不從那裡開始拖曳
                if (renaming || (event.target as HTMLElement).closest("button, input")) return;
                startDrag(page.id, event);
              }}
              onClick={() => dispatch({ type: "page/select", id: page.id })}
              onDoubleClick={() => setRenamingId(page.id)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") dispatch({ type: "page/select", id: page.id });
                if (event.key === "F2") setRenamingId(page.id);
              }}
              className={cn(
                "group relative flex shrink-0 cursor-default items-center gap-1 border-r px-3 text-sm outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
                active
                  ? "bg-muted font-medium text-foreground after:absolute after:inset-x-0 after:top-0 after:h-0.5 after:bg-primary"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                drag?.id === page.id && "opacity-50",
              )}
            >
              {/* 插入線：放在這個頁籤的左邊；最後一個空隙畫在最後一個頁籤的右邊 */}
              {(dropSlot === index || (dropSlot === pages.length && index === pages.length - 1)) && (
                <span
                  aria-hidden
                  data-drop-indicator
                  className={cn(
                    "pointer-events-none absolute top-1 bottom-1 z-10 w-0.5 rounded bg-primary",
                    dropSlot === index ? "-left-px" : "-right-px",
                  )}
                />
              )}
              {renaming ? (
                <InlineNameInput
                  initialValue={page.name}
                  maxLength={PAGE_NAME_MAX_LENGTH}
                  label="頁面名稱"
                  className="w-36"
                  onCommit={(name) => {
                    dispatch({ type: "page/rename", id: page.id, name });
                    setRenamingId(null);
                  }}
                  onCancel={() => setRenamingId(null)}
                />
              ) : (
                <span className="max-w-40 truncate">{page.name}</span>
              )}
              {active && !renaming && (
                <PageMenu pageActions>
                  <button
                    type="button"
                    aria-label="頁面選單"
                    onClick={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                    className="rounded p-0.5 hover:bg-background"
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                </PageMenu>
              )}
              {pages.length > 1 && !renaming && (
                <button
                  type="button"
                  aria-label={`刪除 ${page.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPendingDelete(page);
                  }}
                  onDoubleClick={(event) => event.stopPropagation()}
                  className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-background focus-visible:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-0.5 border-l px-1.5">
        <IconButton label="上一頁（PageUp）" disabled={activeIndex <= 0} onClick={() => step("prev")}>
          <ChevronLeft />
        </IconButton>
        {/* key：切換頁面或頁數改變時重設輸入框的草稿 */}
        <PageNumberField
          key={`${activeIndex}/${pages.length}`}
          index={activeIndex}
          pageCount={pages.length}
          onCommit={selectPageAt}
        />
        <IconButton label="下一頁（PageDown）" disabled={activeIndex >= pages.length - 1} onClick={() => step("next")}>
          <ChevronRight />
        </IconButton>
      </div>

      <DragGhost ref={ghostRef}>{drag ? (pages.find((page) => page.id === drag.id)?.name ?? null) : null}</DragGhost>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>刪除頁面？</AlertDialogTitle>
            <AlertDialogDescription>
              「{pendingDelete?.name}」與頁面上的所有物件都會被刪除，可用復原（Ctrl+Z）還原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDelete) dispatch({ type: "page/delete", id: pendingDelete.id });
                setPendingDelete(null);
              }}
            >
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </footer>
  );
}

interface PageNumberFieldProps {
  /** Current 0-based page index; -1 while a master page is edited. */
  readonly index: number;
  readonly pageCount: number;
  /** Called with the 0-based index of the page to go to. */
  readonly onCommit: (index: number) => void;
}

/**
 * "12 / 120" page number box: type a page number and press Enter to jump there.
 *
 * Enter / blur jumps, Esc or invalid text restores the current number (same pattern as `NumberField`).
 *
 * Args:
 *   props: Current index, page count and jump callback.
 *
 * Returns:
 *   Labelled input followed by the page count.
 */
function PageNumberField({ index, pageCount, onCommit }: PageNumberFieldProps) {
  const id = useId();
  // 編輯主頁時沒有目前頁（index = -1）
  const current = index < 0 ? "–" : String(index + 1);
  const [draft, setDraft] = useState(current);
  // Esc 之後的 blur 不跳頁：blur 執行時 state 還是舊的草稿
  const cancelledRef = useRef(false);

  const commit = (): void => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    const next = parsePageNumber(draft, pageCount);
    if (next === null || next === index) {
      setDraft(current);
      return;
    }
    onCommit(next);
  };

  return (
    <div className="flex items-center gap-1 px-1 text-sm text-muted-foreground tabular-nums">
      <label htmlFor={id} className="sr-only">
        頁碼
      </label>
      <Input
        id={id}
        inputMode="numeric"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") commit();
          if (event.key === "Escape") {
            cancelledRef.current = true;
            setDraft(current);
            event.currentTarget.blur();
          }
        }}
        title="輸入頁碼後按 Enter 跳頁"
        className="h-7 w-12 px-1.5 text-center text-sm"
      />
      <span aria-hidden>/ {pageCount}</span>
    </div>
  );
}
