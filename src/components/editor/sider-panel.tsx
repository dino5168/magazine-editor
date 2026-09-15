import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SiderPanelProps {
  readonly title: string;
  readonly onCollapse: () => void;
  readonly children: ReactNode;
}

/**
 * Collapsible side panel frame with a scrollable body and an edge collapse handle.
 *
 * Args:
 *   props.title: Panel heading.
 *   props.onCollapse: Called when the collapse handle is clicked.
 *   props.children: Panel content.
 *
 * Returns:
 *   Panel element that pushes the canvas aside.
 */
export function SiderPanel({ title, onCollapse, children }: SiderPanelProps) {
  return (
    <aside
      aria-label={title}
      className="relative flex h-full w-80 shrink-0 flex-col border-r bg-background animate-in duration-150 fade-in-0 slide-in-from-left-2"
    >
      <h2 className="flex h-12 shrink-0 items-center px-4 text-sm font-semibold">{title}</h2>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 px-4 pb-4">{children}</div>
      </ScrollArea>
      <button
        type="button"
        aria-label="收合面板"
        title="收合面板"
        onClick={onCollapse}
        className="absolute top-1/2 -right-3.5 z-10 flex h-16 w-3.5 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 bg-background text-muted-foreground shadow-sm hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" />
      </button>
    </aside>
  );
}
