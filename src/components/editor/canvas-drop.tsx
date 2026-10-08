import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import type { PageId, Point } from "@/lib/editor/types";

/** Where something dropped on the canvas lands: the page under the pointer and a point on it (pt). */
export interface CanvasDropTarget {
  readonly pageId: PageId;
  readonly point: Point;
}

/** Maps a window position (`clientX` / `clientY`) to a drop target; null when it is not over the canvas. */
export type CanvasLocator = (clientX: number, clientY: number) => CanvasDropTarget | null;

interface CanvasDropRegistry {
  /** The canvas registers its locator while mounted (null on unmount). */
  readonly register: (locator: CanvasLocator | null) => void;
  readonly locate: CanvasLocator;
}

const CanvasDropContext = createContext<CanvasDropRegistry | null>(null);

/**
 * Lets things outside the canvas (the 素材 panel's drag) find out where on the pages a window
 * position is, without knowing the canvas's zoom, scroll and spread layout.
 *
 * Args:
 *   props.children: Content that contains the canvas and the drag sources.
 *
 * Returns:
 *   Context provider.
 */
export function CanvasDropProvider({ children }: { readonly children: ReactNode }) {
  const locatorRef = useRef<CanvasLocator | null>(null);
  const value = useMemo<CanvasDropRegistry>(
    () => ({
      register: (locator) => {
        locatorRef.current = locator;
      },
      locate: (clientX, clientY) => locatorRef.current?.(clientX, clientY) ?? null,
    }),
    [],
  );
  return <CanvasDropContext.Provider value={value}>{children}</CanvasDropContext.Provider>;
}

/**
 * Reads the canvas drop registry.
 *
 * Returns:
 *   `register` (for the canvas) and `locate` (for drag sources).
 *
 * Raises:
 *   Error: When used outside `CanvasDropProvider`.
 */
export function useCanvasDrop(): CanvasDropRegistry {
  const value = useContext(CanvasDropContext);
  if (value === null) throw new Error("useCanvasDrop must be used within CanvasDropProvider");
  return value;
}
