import { Fragment, useEffect, useId, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";
import { IconButton } from "@/components/editor/icon-button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DockGroup } from "@/lib/dock/dock-layout";
import { getPanelLabel, panelScrollsItself, type PanelId } from "@/lib/dock/panels";
import { cn } from "@/lib/utils";
import { PANEL_ICONS } from "./panel-icons";

interface DockPanelGroupProps {
  readonly group: DockGroup;
  /** Panel being dragged anywhere (its tab is shown faded in place), or null. */
  readonly draggingId: PanelId | null;
  readonly onActivate: (id: PanelId) => void;
  readonly onClose: (id: PanelId) => void;
  /** Collapses or expands the group (identified by any of its panels). */
  readonly onToggleCollapsed: (id: PanelId) => void;
  /** Pointer-down on a tab; a drag starts once the pointer moves past a small threshold. */
  readonly onDragStart: (id: PanelId, event: PointerEvent) => void;
  /** Tab insertion slot to mark while a panel is dragged over this tab bar, or null. */
  readonly dropTabSlot: number | null;
  /** Content of the shown tab; background tabs are not mounted. */
  readonly children: ReactNode;
}

/**
 * Scroll area for panel content that follows the dock width.
 *
 * Args:
 *   props.className: Extra classes (sizing inside the parent).
 *   props.children: Content.
 *
 * Returns:
 *   Scroll area filling the remaining height of a flex column.
 */
export function DockScrollArea({ className, children }: { readonly className?: string; readonly children: ReactNode }) {
  return (
    // Radix 把內容包在 display: table 的 div 裡，長文字會撐寬面板、truncate 失效；改成 block 讓內容跟著停靠區寬度
    <ScrollArea className={cn("min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block!", className)}>{children}</ScrollArea>
  );
}

interface DockTabProps {
  readonly id: PanelId;
  readonly active: boolean;
  readonly dragging: boolean;
  readonly tabId: string;
  readonly panelId: string;
  readonly onActivate: () => void;
  readonly onClose: () => void;
  readonly onDragStart: (event: PointerEvent) => void;
}

function DockTab({ id, active, dragging, tabId, panelId, onActivate, onClose, onDragStart }: DockTabProps) {
  const label = getPanelLabel(id);
  const Icon = PANEL_ICONS[id];
  return (
    // 頁籤 = 切換按鈕 + 關閉鈕（按鈕不能巢狀，所以包一層）。
    // 目前頁籤和內容區同底色、蓋住頁籤列的底線，看起來和內容連在一起（Affinity 的樣子）
    <div
      role="presentation"
      data-dock-tab={id}
      className={cn(
        "group/tab relative flex h-full shrink-0 items-center rounded-t-md border border-b-0 transition-opacity",
        // 關閉鈕右邊的空隙放在這裡，不放在按鈕的 margin：Button 有 transition-all，margin 會慢慢長出來，
        // 頁籤寬度在捲進畫面之後才變，位置就差幾 px
        active
          ? "border-border bg-background pr-1 text-foreground"
          : "border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground",
        dragging && "opacity-40",
      )}
    >
      <button
        type="button"
        role="tab"
        id={tabId}
        aria-selected={active}
        aria-controls={active ? panelId : undefined}
        tabIndex={active ? 0 : -1}
        title="拖曳頁籤可移動面板"
        onClick={onActivate}
        onPointerDown={onDragStart}
        className={cn(
          "flex h-full items-center gap-1.5 rounded-t-md pl-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
          // 目前頁籤不加粗（同 Affinity，靠底色區分）：粗體字比較寬，切換頁籤時整排頁籤會跟著位移
          active ? "pr-1" : "pr-2.5",
        )}
      >
        <Icon className="size-4 shrink-0" strokeWidth={1.5} />
        <span className="whitespace-nowrap">{label}</span>
      </button>
      <IconButton
        label={`關閉${label}`}
        size="icon-xs"
        // 目前頁籤：排在名稱後面。其他頁籤：滑過才浮在右端，不佔寬度（頁籤列才放得下比較多頁籤）
        className={cn(
          "size-5",
          !active && "invisible absolute top-1/2 right-0.5 -translate-y-1/2 bg-muted group-hover/tab:visible",
        )}
        onClick={onClose}
        // 按關閉鈕不應開始拖曳
        onPointerDown={(event) => event.stopPropagation()}
      >
        <X />
      </IconButton>
    </div>
  );
}

const TAB_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

// 頁籤插入位置提示線：寬度 0，不影響頁籤的版面（否則拖曳中的中心點會跟著移動）
function TabDropIndicator() {
  return (
    <div className="relative h-full w-0 shrink-0" aria-hidden>
      <div className="absolute inset-y-1 -left-px z-10 w-0.5 rounded-full bg-primary" />
    </div>
  );
}

/**
 * One panel group in a dock (Affinity-style): a tab bar and the shown panel's content.
 * Expanded groups share the dock height equally; a collapsed group keeps only its tab bar.
 *
 * Args:
 *   props.group: Tabs, shown tab and collapsed state.
 *   props.draggingId: Panel being dragged, or null.
 *   props.onActivate: Shows a tab.
 *   props.onClose: Closes a panel.
 *   props.onToggleCollapsed: Collapses or expands the group.
 *   props.onDragStart: Called on pointer-down on a tab.
 *   props.dropTabSlot: Tab insertion slot to mark, or null.
 *   props.children: Content of the shown tab.
 *
 * Returns:
 *   Group section.
 */
export function DockPanelGroup({
  group,
  draggingId,
  onActivate,
  onClose,
  onToggleCollapsed,
  onDragStart,
  dropTabSlot,
  children,
}: DockPanelGroupProps) {
  const baseId = useId();
  const tabId = (id: PanelId) => `${baseId}-tab-${id}`;
  const panelId = `${baseId}-panel`;
  const { active, collapsed, panels } = group;
  const tabListRef = useRef<HTMLDivElement>(null);

  // 目前頁籤一直捲在看得到的地方（切換、從選單打開、拖曳放下、頁籤增減時）。
  // 自己算 scrollLeft、不用 scrollIntoView：只捲這一列，不會連帶捲動外層
  useEffect(() => {
    const list = tabListRef.current;
    const tab = list?.querySelector<HTMLElement>(`[data-dock-tab="${active}"]`);
    if (!list || !tab) return;
    const bar = list.getBoundingClientRect();
    const rect = tab.getBoundingClientRect();
    if (rect.left < bar.left) list.scrollLeft -= bar.left - rect.left;
    else if (rect.right > bar.right) list.scrollLeft += rect.right - bar.right;
  }, [active, panels.length]);

  // ← → 切換到前 / 後一個頁籤（頭尾循環），Home / End 到第一 / 最後一個；焦點跟著移過去（ARIA tabs 的自動啟用）
  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!TAB_KEYS.has(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    // 不讓方向鍵再傳到編輯器（會移動畫布上選取的物件）
    event.preventDefault();
    event.stopPropagation();
    const index = panels.indexOf(active);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? panels.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + panels.length) % panels.length;
    onActivate(panels[next]);
    // preventScroll：這時它還是背景頁籤（關閉鈕不佔寬度），瀏覽器捲的位置會差一個關閉鈕；交給上面的 effect 捲
    document.getElementById(tabId(panels[next]))?.focus({ preventScroll: true });
  };

  return (
    <section
      aria-label={panels.map(getPanelLabel).join("、")}
      data-dock-group=""
      className={cn("flex min-h-0 flex-col border-b last:border-b-0", collapsed ? "shrink-0" : "flex-1 basis-0")}
    >
      <header
        data-dock-tabbar=""
        // 拖曳中指到這一列 = 併入這一組，整列淡淡標示
        className={cn(
          "flex h-9 shrink-0 items-end gap-0.5 pt-1 pr-1 transition-colors",
          dropTabSlot !== null ? "bg-primary/10" : "bg-muted/60",
          // 底線只在展開時畫。用 inset 陰影而不是 border：它畫在背景層，目前頁籤（不透明底色）直接蓋住，
          // 頁籤不必往下凸 1 px（那樣頁籤列會多出 1 px 的垂直捲動）
          !collapsed && "shadow-[inset_0_-1px_0_var(--color-border)]",
        )}
      >
        <IconButton
          label={collapsed ? "展開" : "收合"}
          size="icon-xs"
          aria-expanded={!collapsed}
          className="mb-1 ml-1 size-6 self-center"
          onClick={() => onToggleCollapsed(active)}
        >
          <ChevronDown className={cn("transition-transform", collapsed && "-rotate-90")} />
        </IconButton>
        <div
          ref={tabListRef}
          role="tablist"
          aria-label="工具面板"
          onKeyDown={onTabKeyDown}
          // 頁籤放不下時橫向捲動：捲軸隱藏，滾輪直向轉橫向（同頁面頁籤列），拖曳靠近邊緣會自動捲動（use-dock-drag）
          onWheel={(event) => {
            if (event.deltaX === 0) event.currentTarget.scrollLeft += event.deltaY;
          }}
          className="flex h-full min-w-0 flex-1 items-end gap-0.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
        >
          {panels.map((id, index) => (
            <Fragment key={id}>
              {dropTabSlot === index && <TabDropIndicator />}
              <DockTab
                id={id}
                active={id === active}
                dragging={draggingId === id}
                tabId={tabId(id)}
                panelId={panelId}
                onActivate={() => onActivate(id)}
                onClose={() => onClose(id)}
                onDragStart={(event) => onDragStart(id, event)}
              />
            </Fragment>
          ))}
          {dropTabSlot === panels.length && <TabDropIndicator />}
        </div>
      </header>
      {!collapsed && (
        <div role="tabpanel" id={panelId} aria-labelledby={tabId(active)} className="flex min-h-0 flex-1 flex-col">
          {panelScrollsItself(active) ? (
            // 自己處理捲動的面板（頁面）：內容填滿面板，高度由面板自己分配
            children
          ) : (
            <DockScrollArea>
              <div className="flex flex-col gap-3 p-4 pt-3">{children}</div>
            </DockScrollArea>
          )}
        </div>
      )}
    </section>
  );
}
