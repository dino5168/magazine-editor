import { useMemo, useState, type PointerEvent, type ReactNode } from "react";
import { PANELS } from "@/components/editor/panels";
import { DOCK_WIDTH, type DockGroup, type DockSide, type DropTarget } from "@/lib/dock/dock-layout";
import type { PanelId } from "@/lib/dock/panels";
import { cn } from "@/lib/utils";
import { DockPanelGroup } from "./dock-panel";
import { DockSplitter } from "./dock-splitter";

interface DockAreaProps {
  readonly side: DockSide;
  /** Panel groups, top to bottom. */
  readonly groups: readonly DockGroup[];
  /** Dock width in CSS px. */
  readonly width: number;
  /** Shows a panel's tab. */
  readonly onActivate: (id: PanelId) => void;
  /** Collapses or expands the group that contains the panel. */
  readonly onToggleCollapsed: (id: PanelId) => void;
  readonly onClose: (id: PanelId) => void;
  /** Called once when the size control bar settles on a new width. */
  readonly onResize: (px: number) => void;
  readonly onDragStart: (id: PanelId, event: PointerEvent) => void;
  /** Panel being dragged anywhere, or null. */
  readonly draggingId: PanelId | null;
  /** Drop target on this side to mark (group slot or tab slot), or null when this side is not the target. */
  readonly drop: DropTarget | null;
}

// 插入位置提示線：高度 0，不影響面板的版面（否則拖曳中的中心點會跟著移動）
function DropIndicator() {
  return (
    <div className="relative h-0 shrink-0" aria-hidden>
      <div className="absolute inset-x-1 -top-px z-10 h-0.5 rounded-full bg-primary" />
    </div>
  );
}

/**
 * One side of the three-column layout: panel groups stacked top to bottom,
 * with a size control bar on the edge facing the canvas.
 * When no panel is docked here the canvas takes the space; during a panel drag
 * an overlay drop zone appears on this edge instead.
 *
 * Args:
 *   props.side: Dock side (border placement and accessible name).
 *   props.groups: Panel groups, top to bottom.
 *   props.width: Dock width in CSS px.
 *   props.onActivate: Shows a panel's tab.
 *   props.onToggleCollapsed: Collapses or expands a group.
 *   props.onClose: Closes a panel.
 *   props.onResize: Commits a new dock width.
 *   props.onDragStart: Starts dragging a panel by its tab.
 *   props.draggingId: Panel being dragged, or null.
 *   props.drop: Drop target to mark on this side, or null.
 *
 * Returns:
 *   Dock column, drop zone, or null.
 */
export function DockArea({
  side,
  groups,
  width,
  onActivate,
  onToggleCollapsed,
  onClose,
  onResize,
  onDragStart,
  draggingId,
  drop,
}: DockAreaProps) {
  // 拖曳分隔條期間只改這裡的 local state，放開才 onResize 寫回版面（避免每次 pointermove 都重畫整頁）
  const [liveWidth, setLiveWidth] = useState<number | null>(null);

  // 拖曳分隔條時只有寬度變化，面板內容不必重新 render
  const content = useMemo(() => {
    const nodes: ReactNode[] = groups.map((group, index) => {
      // 只掛目前頁籤的內容（背景頁籤卸載，編輯時不多做 re-render）
      const Content = PANELS[group.active];
      return (
        <DockPanelGroup
          // 群組沒有 id；內容以面板 id 為 key，換頁籤或群組移動時才重新掛載
          key={index}
          group={group}
          draggingId={draggingId}
          onActivate={onActivate}
          onClose={onClose}
          onToggleCollapsed={onToggleCollapsed}
          onDragStart={onDragStart}
          dropTabSlot={drop?.kind === "tab" && drop.group === index ? drop.slot : null}
        >
          <Content key={group.active} />
        </DockPanelGroup>
      );
    });
    if (drop?.kind === "group") nodes.splice(drop.slot, 0, <DropIndicator key="drop-indicator" />);
    return nodes;
  }, [groups, draggingId, drop, onActivate, onToggleCollapsed, onClose, onDragStart]);

  if (groups.length === 0) {
    if (draggingId === null) return null;
    return (
      // 空的一側：疊在畫布邊緣的放置區，不佔版面，拖曳時畫布尺寸不會改變
      <div
        data-dock-side={side}
        className={cn(
          "absolute inset-y-0 z-30 flex w-16 items-center justify-center border-2 border-dashed text-xs text-muted-foreground transition-colors",
          side === "left" ? "left-0" : "right-0",
          drop !== null ? "border-primary bg-primary/10 text-primary" : "border-muted-foreground/30 bg-background/80",
        )}
      >
        {/* 直書放在內層：inset-y-0 是邏輯屬性（inset-block），直書會讓它變成水平方向 */}
        <span className="[writing-mode:vertical-rl]">停靠到{side === "left" ? "左" : "右"}側</span>
      </div>
    );
  }

  const shownWidth = liveWidth ?? width;
  return (
    <aside
      aria-label={side === "left" ? "左側工具面板" : "右側工具面板"}
      data-dock-side={side}
      // 視窗變窄時停靠區可以縮到最小寬度，讓畫布欄保有 CANVAS_MIN_WIDTH
      style={{ width: shownWidth, minWidth: DOCK_WIDTH.min }}
      className={cn("relative flex min-h-0 flex-col bg-background", side === "left" ? "border-r" : "border-l")}
    >
      {content}
      <DockSplitter
        side={side}
        width={shownWidth}
        onPreview={setLiveWidth}
        onCommit={(px) => {
          setLiveWidth(null);
          onResize(px);
        }}
      />
    </aside>
  );
}
