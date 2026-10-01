import type { ReactNode } from "react";
import { CheckIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";

interface PageMenuProps {
  /** The trigger element (rendered with `asChild`). */
  readonly children: ReactNode;
}

/**
 * draw.io-style page list menu: insert a page, then every page with the active one checked.
 *
 * The page bar opens it from the `≡` button and from the `˅` on the active tab.
 *
 * Args:
 *   props.children: Trigger element.
 *
 * Returns:
 *   Dropdown menu opening above the trigger.
 */
export function PageMenu({ children }: PageMenuProps) {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
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
        <DropdownMenuItem inset onSelect={() => dispatch({ type: "page/add", after: state.activePageId })}>
          插入頁面
        </DropdownMenuItem>
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
