import { useState } from "react";
import { Plus, X } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import type { Page, PageId } from "@/lib/editor/types";
import { PAGE_NAME_MAX_LENGTH } from "@/lib/editor/validation";
import { IconButton } from "./icon-button";
import { InlineNameInput } from "./inline-name-input";

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
  const [renamingId, setRenamingId] = useState<PageId | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Page | null>(null);
  const { pages } = state.history.present;

  return (
    <footer className={cn("flex h-10 items-stretch border-t bg-background", className)}>
      <div className="flex items-center border-r px-1.5">
        <IconButton label="新增頁面" onClick={() => dispatch({ type: "page/add" })}>
          <Plus />
        </IconButton>
      </div>

      <div role="tablist" aria-label="頁面" className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {pages.map((page) => {
          const active = page.id === state.activePageId;
          const renaming = renamingId === page.id;
          return (
            <div
              key={page.id}
              role="tab"
              tabIndex={0}
              aria-selected={active}
              title="雙擊可重新命名"
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
              )}
            >
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
