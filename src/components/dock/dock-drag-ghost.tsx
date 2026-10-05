import type { Ref } from "react";
import { getPanelLabel, type PanelId } from "@/lib/dock/panels";
import { DragGhost } from "../drag-ghost";
import { PANEL_ICONS } from "./panel-icons";

interface DockDragGhostProps {
  /** Position is set directly through this ref by useDockDrag. */
  readonly ref: Ref<HTMLDivElement>;
  /** Panel being dragged, or null when idle. */
  readonly id: PanelId | null;
}

/**
 * Floating label (icon + name) that follows the pointer while a panel is dragged.
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
    <DragGhost ref={ref}>
      {id && Icon && (
        <>
          <Icon className="size-4 text-muted-foreground" strokeWidth={1.5} />
          {getPanelLabel(id)}
        </>
      )}
    </DragGhost>
  );
}
