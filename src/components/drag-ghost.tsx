import type { ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";

interface DragGhostProps {
  /** Position is set directly through this ref (`moveDragGhost`), not through React state. */
  readonly ref: Ref<HTMLDivElement>;
  /** Label content, or null when idle (the element stays mounted but hidden). */
  readonly children: ReactNode | null;
}

/**
 * Floating label that follows the pointer while something is dragged (tool panels, page tabs).
 * Always mounted so the ref exists before the first pointer move; pointer-events-none so it never
 * becomes the element under the pointer during hit testing.
 *
 * Args:
 *   props.ref: Ref receiving the element.
 *   props.children: What is dragged, or null.
 *
 * Returns:
 *   Fixed-position label.
 */
export function DragGhost({ ref, children }: DragGhostProps) {
  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        "pointer-events-none fixed top-0 left-0 z-50 flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-sm font-medium shadow-md",
        children === null && "hidden",
      )}
    >
      {children}
    </div>
  );
}

/**
 * Moves the floating label next to the pointer.
 *
 * Args:
 *   ghost: The label element (may be null before mount).
 *   x: Pointer x (viewport px).
 *   y: Pointer y (viewport px).
 */
export function moveDragGhost(ghost: HTMLElement | null, x: number, y: number): void {
  if (ghost) ghost.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
}
