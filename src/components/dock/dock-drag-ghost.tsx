import type { Ref } from "react";
import { getPanelLabel, type PanelId } from "@/lib/dock/panels";
import { cn } from "@/lib/utils";
import { PANEL_ICONS } from "./panel-icons";

interface DockDragGhostProps {
  /** Position is set directly through this ref by useDockDrag. */
  readonly ref: Ref<HTMLDivElement>;
  /** Panel being dragged, or null when idle (the element stays mounted but hidden). */
  readonly id: PanelId | null;
}

/**
 * Floating label that follows the pointer while a panel is dragged.
 * Always mounted so the ref exists before the first pointer move; pointer-events-none so it
 * never becomes the element under the pointer during hit testing.
 *
 * Args:
 *   props.ref: Ref receiving the element.
 *   props.id: Dragged panel id, or null.
 *
 * Returns:
 *   Fixed-position label.
 */
export function DockDragGhost({ ref, id }: DockDragGhostProps) {
  const Icon = id ? PANEL_ICONS[id] : null;
  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        "pointer-events-none fixed top-0 left-0 z-50 flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-sm font-medium shadow-md",
        !id && "hidden",
      )}
    >
      {Icon && <Icon className="size-4 text-muted-foreground" strokeWidth={1.5} />}
      {id && getPanelLabel(id)}
    </div>
  );
}
