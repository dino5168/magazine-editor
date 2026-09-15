import { useState } from "react";
import { FileDown, FileText, Redo2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { DOCUMENT_NAME_MAX_LENGTH } from "@/lib/editor/validation";
import { ZOOM_STEP } from "@/lib/editor/viewport";
import { IconButton } from "./icon-button";
import { InlineNameInput } from "./inline-name-input";

const ZOOM_PRESETS = [0.5, 1, 1.5, 2] as const;

interface EditorTopBarProps {
  readonly className?: string;
}

/**
 * System controls: document name, undo/redo, zoom and (disabled) PDF export.
 *
 * Args:
 *   props.className: Extra classes for grid placement.
 *
 * Returns:
 *   Header bar.
 */
export function EditorTopBar({ className }: EditorTopBarProps) {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const [renaming, setRenaming] = useState(false);
  const { name } = state.history.present;
  const { zoom } = state.view;

  return (
    <header className={cn("flex h-14 min-w-0 items-center gap-1 border-b bg-background px-3", className)}>
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      {renaming ? (
        <InlineNameInput
          initialValue={name}
          maxLength={DOCUMENT_NAME_MAX_LENGTH}
          label="文件名稱"
          className="w-64"
          onCommit={(next) => {
            dispatch({ type: "document/rename", name: next });
            setRenaming(false);
          }}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <button
          type="button"
          title="點擊修改文件名稱"
          onClick={() => setRenaming(true)}
          className="max-w-64 truncate rounded-md px-2 py-1 text-sm font-medium hover:bg-muted"
        >
          {name}
        </button>
      )}

      <Separator orientation="vertical" className="mx-2 h-6" />
      <IconButton
        label="復原 (Ctrl+Z)"
        disabled={state.history.past.length === 0}
        onClick={() => dispatch({ type: "history/undo" })}
      >
        <Undo2 />
      </IconButton>
      <IconButton
        label="重做 (Ctrl+Y)"
        disabled={state.history.future.length === 0}
        onClick={() => dispatch({ type: "history/redo" })}
      >
        <Redo2 />
      </IconButton>

      <div className="ml-auto flex items-center gap-1">
        <IconButton label="縮小" onClick={() => dispatch({ type: "view/setZoom", zoom: zoom / ZOOM_STEP })}>
          <ZoomOut />
        </IconButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="w-16 tabular-nums" aria-label="縮放比例">
              {Math.round(zoom * 100)}%
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => dispatch({ type: "view/fit" })}>符合畫面</DropdownMenuItem>
            <DropdownMenuSeparator />
            {ZOOM_PRESETS.map((preset) => (
              <DropdownMenuItem key={preset} onSelect={() => dispatch({ type: "view/setZoom", zoom: preset })}>
                {preset * 100}%
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <IconButton label="放大" onClick={() => dispatch({ type: "view/setZoom", zoom: zoom * ZOOM_STEP })}>
          <ZoomIn />
        </IconButton>

        <Separator orientation="vertical" className="mx-2 h-6" />
        <Tooltip>
          <TooltipTrigger asChild>
            {/* disabled 按鈕不觸發 pointer 事件，外包一層才能顯示 tooltip */}
            <span tabIndex={0} className="rounded-lg">
              <Button size="sm" disabled>
                <FileDown />
                匯出 PDF
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>待 Typst 整合</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
