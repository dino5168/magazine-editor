import { useState } from "react";
import { FileDown, FileText, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { DOCUMENT_NAME_MAX_LENGTH } from "@/lib/editor/validation";
import { ZOOM_STEP } from "@/lib/editor/viewport";
import { IconButton } from "./icon-button";
import { InlineNameInput } from "./inline-name-input";
import { ViewToggleButtons } from "./view-toggle-buttons";

const ZOOM_PRESETS = [0.5, 1, 1.5, 2] as const;

interface EditorTopBarProps {
  readonly className?: string;
  readonly onExportPdf: () => void;
  readonly onOpenGridSettings: () => void;
}

/**
 * System controls: document name, grid / guide toggles, zoom and PDF export. Undo / redo live on the
 * bottom toolbar's action bar.
 *
 * Args:
 *   props.className: Extra classes for grid placement.
 *   props.onExportPdf: Runs the "export PDF" command (same as the File menu).
 *   props.onOpenGridSettings: Opens the 格線與參考線 dialog.
 *
 * Returns:
 *   Header bar.
 */
export function EditorTopBar({ className, onExportPdf, onOpenGridSettings }: EditorTopBarProps) {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const [renaming, setRenaming] = useState(false);
  const { name } = state.history.present;
  const { zoom } = state.view;

  return (
    // @container：中欄窄時（最窄 480 px）「匯出 PDF」只剩 icon、分隔線變窄，文件名稱才留得下空間
    <header className={cn("@container flex h-14 min-w-0 items-center gap-1 border-b bg-background px-3", className)}>
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
          // 中欄窄時名稱先縮，右邊的按鈕不換行
          className="max-w-64 min-w-0 truncate rounded-md px-2 py-1 text-sm font-medium hover:bg-muted"
        >
          {name}
        </button>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <ViewToggleButtons onOpenGridSettings={onOpenGridSettings} />
        <Separator orientation="vertical" className="mx-2 h-6 @max-2xl:mx-0.5" />
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

        <Separator orientation="vertical" className="mx-2 h-6 @max-2xl:mx-0.5" />
        <Button size="sm" aria-label="匯出 PDF" title="匯出 PDF" className="@max-2xl:px-2" onClick={onExportPdf}>
          <FileDown />
          <span className="@max-2xl:hidden">匯出 PDF</span>
        </Button>
      </div>
    </header>
  );
}
