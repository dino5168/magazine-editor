import type { ReactNode } from "react";
import { CheckIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { PAGE_MOVE_SHORTCUT_LABELS } from "@/lib/editor/page-navigation";
import { shiftedPageOrder, type PageShift } from "@/lib/editor/page-order";
import { usePageDialogs } from "./page-dialogs";

interface PageMenuProps {
  /** The trigger element (rendered with `asChild`). */
  readonly children: ReactNode;
  /** Adds the actions on the active page (move left / right / first / last); the `˅` on the active tab. */
  readonly pageActions?: boolean;
}

const MOVE_ITEMS: readonly { readonly shift: PageShift; readonly label: string; readonly shortcut?: string }[] = [
  { shift: "left", label: "向左移動", shortcut: PAGE_MOVE_SHORTCUT_LABELS.left },
  { shift: "right", label: "向右移動", shortcut: PAGE_MOVE_SHORTCUT_LABELS.right },
  { shift: "first", label: "移到最前" },
  { shift: "last", label: "移到最後" },
];

/**
 * draw.io-style page list menu: insert a page, then every page with the active one checked.
 *
 * The page bar opens it from the `≡` button and from the `˅` on the active tab; the latter also
 * lists the moves of the active page.
 *
 * Args:
 *   props.children: Trigger element.
 *   props.pageActions: Whether to list the active page's moves.
 *
 * Returns:
 *   Dropdown menu opening above the trigger.
 */
export function PageMenu({ children, pageActions = false }: PageMenuProps) {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const { openAddPages } = usePageDialogs();
  const { pages } = state.history.present;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      {/* 頁籤列在畫面底部，選單往上開；頁面多時由 max-h 限制並捲動。
          選單放在頁籤裡時，portal 內的事件仍會沿 React 樹冒泡到頁籤的 onClick / onDoubleClick，所以在這裡攔下 */}
      <DropdownMenuContent
        side="top"
        className="w-auto max-w-72 min-w-44"
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        {/* 開「新增頁面」對話框，預設插在目前頁之後（編輯主頁時沒有目前頁，預設加在最後） */}
        <DropdownMenuItem inset onSelect={() => openAddPages("current")}>
          插入頁面...
        </DropdownMenuItem>
        {pageActions && (
          <>
            <DropdownMenuSeparator />
            {/* 頁碼跟著頁序：移動後頁碼會依新位置重新計算 */}
            {MOVE_ITEMS.map(({ shift, label, shortcut }) => {
              const order = shiftedPageOrder(pages, state.activePageId, shift);
              return (
                <DropdownMenuItem
                  key={shift}
                  inset
                  disabled={order === null}
                  onSelect={() => order && dispatch({ type: "page/reorder", order })}
                >
                  {label}
                  {shortcut && <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
                </DropdownMenuItem>
              );
            })}
          </>
        )}
        <DropdownMenuSeparator />
        {pages.map((page) => {
          const active = page.id === state.activePageId;
          return (
            <DropdownMenuItem
              key={page.id}
              inset
              aria-current={active ? "page" : undefined}
              onSelect={() => dispatch({ type: "page/select", id: page.id })}
            >
              {active && <CheckIcon className="absolute left-1.5" />}
              <span className="truncate">{page.name}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
