import { useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { ImagePlus } from "lucide-react";
import { masonryLayout } from "@/lib/library/masonry";
import type { LibraryItem } from "@/lib/library/types";
import { cn } from "@/lib/utils";
import { cardAspect, LibraryThumb } from "./library-card";

const GRID_GAP_PX = 12;
const GRID_PADDING_PX = 12;
const MIN_COLUMN_PX = 150;
const CAPTION_PX = 22;

/** How a click changes the selection. */
export type SelectMode = "single" | "toggle" | "range";

interface LibraryGridProps {
  readonly items: readonly LibraryItem[];
  readonly selected: ReadonlySet<string>;
  readonly onSelect: (id: string, mode: SelectMode) => void;
  readonly onClearSelection: () => void;
  readonly resolveSrc: (src: string) => string;
  /** Files dropped from the file explorer; `null` = dropping is not allowed here (trash). */
  readonly onDropFiles: ((files: File[]) => void) | null;
  /** Shown when there are no items. */
  readonly emptyMessage: string;
}

function modeOf(event: MouseEvent): SelectMode {
  if (event.shiftKey) return "range";
  if (event.ctrlKey || event.metaKey) return "toggle";
  return "single";
}

/**
 * Center column of the asset manager: cards in a masonry layout (Eagle-style, left to right),
 * click / Ctrl / Shift selection, and dropping files from the file explorer to import them.
 *
 * Args:
 *   props: Items in display order, the selection, callbacks, URL resolver and the empty message.
 *
 * Returns:
 *   Scrolling grid.
 */
export function LibraryGrid({ items, selected, onSelect, onClearSelection, resolveSrc, onDropFiles, emptyMessage }: LibraryGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [fileOver, setFileOver] = useState(false);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth - GRID_PADDING_PX * 2));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(
    () =>
      masonryLayout(
        items.map((item) => ({ aspect: cardAspect(item) })),
        { width: Math.max(0, width), minColumnWidth: MIN_COLUMN_PX, gap: GRID_GAP_PX, captionHeight: CAPTION_PX },
      ),
    [items, width],
  );

  const acceptsFiles = (event: DragEvent) => onDropFiles !== null && event.dataTransfer.types.includes("Files");

  return (
    <div
      ref={scrollRef}
      data-library-grid
      onClick={(event) => {
        if (event.target === event.currentTarget || (event.target as HTMLElement).dataset.libraryGridSpace !== undefined) {
          onClearSelection();
        }
      }}
      onDragOver={(event) => {
        if (!acceptsFiles(event)) return;
        event.preventDefault();
        setFileOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFileOver(false);
      }}
      onDrop={(event) => {
        setFileOver(false);
        if (!acceptsFiles(event)) return;
        event.preventDefault();
        onDropFiles?.(Array.from(event.dataTransfer.files));
      }}
      className={cn(
        "relative min-h-0 flex-1 overflow-y-auto",
        fileOver && "bg-primary/5 outline-2 -outline-offset-8 outline-primary/50 outline-dashed",
      )}
      style={{ padding: GRID_PADDING_PX }}
    >
      {items.length === 0 ? (
        <div data-library-grid-space className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
          <ImagePlus className="size-8 opacity-50" />
          <p className="whitespace-pre-line">{emptyMessage}</p>
        </div>
      ) : (
        <div data-library-grid-space className="relative" style={{ height: layout.height }}>
          {items.map((item, index) => {
            const box = layout.boxes[index];
            const isSelected = selected.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                data-library-item={item.id}
                aria-pressed={isSelected}
                title={item.name}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(item.id, modeOf(event));
                }}
                className="group absolute text-left outline-none"
                style={{ left: box.x, top: box.y, width: box.width }}
              >
                {/* 縮圖的高度由瀑布流決定（依素材的長寬比，不量測） */}
                <div style={{ height: box.height }}>
                  <LibraryThumb
                    item={item}
                    resolveSrc={resolveSrc}
                    // 用 outline：ring 是 inset 陰影，會被圖片蓋住
                    className={cn(
                      "h-full outline-offset-2 group-hover:outline-2 group-hover:outline-indigo-400/40 group-focus-visible:outline-2 group-focus-visible:outline-indigo-400",
                      isSelected && "outline-3! outline-indigo-500!",
                    )}
                  />
                </div>
                <span
                  className={cn("block truncate px-0.5 pt-1 text-xs text-muted-foreground", isSelected && "text-indigo-600")}
                  style={{ height: CAPTION_PX }}
                >
                  {item.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
