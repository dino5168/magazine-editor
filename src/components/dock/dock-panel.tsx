import type { PointerEvent, ReactNode } from "react";
import { ChevronDown, GripVertical, X } from "lucide-react";
import { IconButton } from "@/components/editor/icon-button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getPanelLabel, type PanelId } from "@/lib/dock/panels";
import { cn } from "@/lib/utils";
import { PANEL_ICONS } from "./panel-icons";

interface DockPanelProps {
  readonly id: PanelId;
  readonly collapsed: boolean;
  /** Whether this panel is being dragged (shown faded in place). */
  readonly dragging: boolean;
  readonly onToggleCollapsed: () => void;
  readonly onClose: () => void;
  /** Pointer-down on the title bar; a drag starts once the pointer moves past a small threshold. */
  readonly onDragStart: (event: PointerEvent) => void;
  readonly children: ReactNode;
}

/**
 * One docked tool panel: title bar (collapse / drag / close) and a scrollable body.
 * Expanded panels share the dock height equally; a collapsed panel keeps only its title bar.
 *
 * Args:
 *   props.id: Panel id (title and icon).
 *   props.collapsed: Whether only the title bar is shown.
 *   props.dragging: Whether the panel is being dragged.
 *   props.onToggleCollapsed: Called when the title is clicked.
 *   props.onClose: Called when the close button is clicked.
 *   props.onDragStart: Called on pointer-down on the title bar.
 *   props.children: Panel content.
 *
 * Returns:
 *   Panel section.
 */
export function DockPanel({ id, collapsed, dragging, onToggleCollapsed, onClose, onDragStart, children }: DockPanelProps) {
  const label = getPanelLabel(id);
  const Icon = PANEL_ICONS[id];
  return (
    <section
      aria-label={label}
      data-dock-panel={id}
      className={cn(
        "flex min-h-0 flex-col border-b transition-opacity last:border-b-0",
        collapsed ? "shrink-0" : "flex-1 basis-0",
        dragging && "opacity-40",
      )}
    >
      <header
        title="拖曳標題列可移動面板"
        onPointerDown={onDragStart}
        className="group/header flex h-9 shrink-0 items-center gap-1 bg-muted/50 pr-1"
      >
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={onToggleCollapsed}
          className="flex h-full min-w-0 flex-1 items-center gap-1.5 px-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ChevronDown
            className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", collapsed && "-rotate-90")}
          />
          <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          <span className="truncate">{label}</span>
        </button>
        <GripVertical
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground/40 group-hover/header:text-muted-foreground"
        />
        <IconButton
          label={`關閉${label}`}
          size="icon-xs"
          onClick={onClose}
          // 按關閉鈕不應開始拖曳
          onPointerDown={(event) => event.stopPropagation()}
        >
          <X />
        </IconButton>
      </header>
      {!collapsed && (
        // Radix 把內容包在 display: table 的 div 裡，長文字會撐寬面板、truncate 失效；改成 block 讓內容跟著停靠區寬度
        <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block!">
          <div className="flex flex-col gap-3 p-4 pt-3">{children}</div>
        </ScrollArea>
      )}
    </section>
  );
}
