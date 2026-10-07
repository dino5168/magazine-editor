import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { selectReturnPageId } from "@/lib/editor/editor-reducer";
import { pagesUsingMaster } from "@/lib/editor/master-pages";
import { cn } from "@/lib/utils";

interface MasterEditBannerProps {
  readonly className?: string;
}

/**
 * Shown above the canvas while a master page is being edited: which master, how many pages use
 * it, and a button back to the page shown before. Renders nothing while a page is shown.
 *
 * Args:
 *   props.className: Positioning classes (the banner floats over the canvas).
 *
 * Returns:
 *   Banner, or null.
 */
export function MasterEditBanner({ className }: MasterEditBannerProps) {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const document = state.history.present;
  const master = document.masters.find((candidate) => candidate.id === state.activePageId);
  if (!master) return null;
  const parent = document.masters.find((candidate) => candidate.id === master.parentId);
  const usage = pagesUsingMaster(document, master.id).length;

  return (
    // 外層不攔事件，只有中間的提示框可以點，不會擋住畫布
    <div className={cn("pointer-events-none flex justify-center", className)}>
      <div
        role="status"
        className="pointer-events-auto flex items-center gap-3 rounded-full border border-amber-300 bg-amber-50 py-1 pr-1 pl-4 text-sm text-amber-950 shadow-sm"
      >
        <span>
          正在編輯主頁：<strong className="font-medium">{master.name}</strong>
          {parent && <span className="text-amber-800">（以 {parent.name} 為基礎）</span>}
          <span className="text-amber-800">・{usage === 0 ? "沒有頁面使用" : `${usage} 頁使用`}</span>
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 rounded-full"
          onClick={() => dispatch({ type: "page/select", id: selectReturnPageId(state) })}
        >
          <ArrowLeft />
          回到頁面
        </Button>
      </div>
    </div>
  );
}
