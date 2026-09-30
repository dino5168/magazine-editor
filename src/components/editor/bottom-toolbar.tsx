import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronUp,
  Copy,
  EllipsisVertical,
  Hand,
  Image,
  MousePointer2,
  Redo2,
  Trash,
  Type,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { selectActivePage, selectSelectedElement } from "@/lib/editor/editor-reducer";
import { createId, type ShapeKind } from "@/lib/editor/element-factory";
import { getToolKeyLabel, getToolLabel, type ToolId } from "@/lib/editor/tools";
import { cn } from "@/lib/utils";
import { IconButton } from "./icon-button";
import { SHAPE_OPTIONS, SHAPE_OPTION_BY_KIND } from "./shape-options";

// 圖形的 icon 依「最近用過的圖形」變化，所以不在這張表裡
const TOOL_ICONS = { select: MousePointer2, hand: Hand, text: Type } as const satisfies Record<
  Exclude<ToolId, "shape">,
  LucideIcon
>;

function withKey(label: string, key: string | null): string {
  return key ? `${label} (${key})` : label;
}

/** Icon button that opens a dropdown and still shows a tooltip (IconButton cannot be a Radix `asChild` child). */
function MenuIconButton({
  label,
  disabled,
  size,
  children,
  menu,
}: {
  readonly label: string;
  readonly disabled?: boolean;
  readonly size: "icon-sm" | "icon-lg";
  readonly children: ReactNode;
  readonly menu: ReactNode;
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size={size} aria-label={label} disabled={disabled}>
              {children}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      {/* shadcn 預設寬度等於觸發按鈕（至少 128px），圖形格線會被截掉；改成依內容撐開 */}
      <DropdownMenuContent side="top" align="end" sideOffset={8} style={{ width: "max-content" }}>
        {menu}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ActionBar() {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const selected = selectSelectedElement(state);
  const elements = selectActivePage(state).elements;
  const index = selected ? elements.findIndex((element) => element.id === selected.id) : -1;

  return (
    <div className="flex items-center gap-0.5 rounded-t-lg border border-b-0 bg-muted/90 px-1 pt-1 pb-0.5 backdrop-blur-sm">
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
      <IconButton
        label="刪除 (Delete)"
        disabled={!selected}
        onClick={() => selected && dispatch({ type: "element/delete", id: selected.id })}
      >
        <Trash />
      </IconButton>
      <IconButton
        label="複製 (Ctrl+D)"
        disabled={!selected}
        onClick={() => selected && dispatch({ type: "element/duplicate", id: selected.id, newId: createId() })}
      >
        <Copy />
      </IconButton>
      <MenuIconButton
        label="更多"
        size="icon-sm"
        disabled={!selected}
        menu={
          <>
            <DropdownMenuItem
              disabled={index >= elements.length - 1}
              onSelect={() => selected && dispatch({ type: "element/reorder", id: selected.id, direction: "up" })}
            >
              <ArrowUp />
              上移一層
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={index <= 0}
              onSelect={() => selected && dispatch({ type: "element/reorder", id: selected.id, direction: "down" })}
            >
              <ArrowDown />
              下移一層
            </DropdownMenuItem>
          </>
        }
      >
        <EllipsisVertical />
      </MenuIconButton>
    </div>
  );
}

interface BottomToolbarProps {
  /** Opens the image file picker and adds the chosen images (same as 檔案 → 匯入 → 圖片). */
  readonly onImportImage: () => void;
  readonly className?: string;
}

/**
 * tldraw-style toolbar floating at the bottom of the canvas: tools on the main bar,
 * undo / redo / delete / duplicate / more on the action bar above its left end.
 *
 * Args:
 *   props.onImportImage: Handler of the image button.
 *   props.className: Extra classes for placement.
 *
 * Returns:
 *   Toolbar overlay (pointer events only on the bars themselves).
 */
export function BottomToolbar({ onImportImage, className }: BottomToolbarProps) {
  const { tool, shapeKind } = useEditorState();
  const dispatch = useEditorDispatch();
  // 選了工具之後到畫布上點擊或拖曳建立（圖片除外：直接開選檔對話框）
  const chooseTool = (id: ToolId, shape?: ShapeKind) => dispatch({ type: "tool/set", tool: id, shape });
  const shape = SHAPE_OPTION_BY_KIND[shapeKind];

  const toolButton = (id: ToolId, label: string, icon: LucideIcon, onClick: () => void, key: string | null) => {
    const Icon = icon;
    const active = tool === id;
    return (
      <IconButton
        key={id}
        label={withKey(label, key)}
        aria-pressed={active}
        variant={active ? "default" : "ghost"}
        size="icon-lg"
        onClick={onClick}
      >
        <Icon className="size-5" strokeWidth={1.75} />
      </IconButton>
    );
  };

  return (
    // 疊在畫布上、不佔版面；外層不接收滑鼠事件，畫布在工具列兩側仍可操作
    <div className={cn("pointer-events-none flex justify-center", className)}>
      <div role="toolbar" aria-label="畫布工具" className="pointer-events-auto flex flex-col items-start">
        <ActionBar />
        <div className="flex items-center gap-1 rounded-xl border bg-background/95 p-1 shadow-md backdrop-blur-sm">
          {(["select", "hand", "text"] as const).map((id) =>
            toolButton(id, getToolLabel(id), TOOL_ICONS[id], () => chooseTool(id), getToolKeyLabel(id)),
          )}
          {toolButton(
            "shape",
            shape.label,
            shape.icon,
            () => chooseTool("shape", shapeKind),
            getToolKeyLabel("shape", shapeKind),
          )}
          <IconButton label="圖片" size="icon-lg" onClick={onImportImage}>
            <Image className="size-5" strokeWidth={1.75} />
          </IconButton>
          <Separator orientation="vertical" className="mx-0.5 h-6" />
          <MenuIconButton
            label="更多圖形"
            size="icon-lg"
            menu={
              <div className="grid grid-cols-5 gap-1">
                {SHAPE_OPTIONS.map(({ kind, label, icon: Icon }) => (
                  <DropdownMenuItem
                    key={kind}
                    aria-label={withKey(label, getToolKeyLabel("shape", kind))}
                    title={withKey(label, getToolKeyLabel("shape", kind))}
                    onSelect={() => chooseTool("shape", kind)}
                    className="size-10 justify-center p-0"
                  >
                    <Icon className="size-5" strokeWidth={1.75} />
                  </DropdownMenuItem>
                ))}
              </div>
            }
          >
            <ChevronUp className="size-5" />
          </MenuIconButton>
        </div>
      </div>
    </div>
  );
}
