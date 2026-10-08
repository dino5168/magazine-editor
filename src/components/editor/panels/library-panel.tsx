import { useMemo, useState, type DragEvent } from "react";
import { Maximize2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LibraryThumb } from "@/components/library/library-card";
import { useLibraryDialog } from "@/components/library/library-dialog";
import { usePlaceLibraryItem } from "@/components/library/use-place-library-item";
import { pickFiles } from "@/lib/editor/image";
import { useLibrary } from "@/lib/library/library-context";
import { LIBRARY_ACCEPT } from "@/lib/library/library-files";
import { ALL_VIEW, importFolderOf, libraryCounts, visibleItems, type LibraryView } from "@/lib/library/library-selectors";
import { treeRows } from "@/lib/library/library-tree";
import { useLibraryImport } from "@/lib/library/use-library-import";
import { isDesktop } from "@/lib/project/project-api";
import { useProject } from "@/lib/project/project-context";
import { cn } from "@/lib/utils";
import { IconButton } from "../icon-button";

/** Select value of a view; folder ids are UUIDs, so they never collide with the fixed values. */
function viewValue(view: LibraryView): string {
  return view.type === "folder" ? `folder:${view.id}` : view.type;
}

function viewOf(value: string): LibraryView {
  if (value.startsWith("folder:")) return { type: "folder", id: value.slice("folder:".length) };
  return value === "unsorted" ? { type: "unsorted" } : ALL_VIEW;
}

/**
 * 素材 tool panel (replaces 上傳; the panel id stays `upload` so saved dock layouts keep it): pick a
 * folder, import into it, click a thumbnail to put it on the page. Organising happens in the
 * 素材管理 window (the button next to the folder list).
 *
 * Returns:
 *   Panel content.
 */
export function LibraryPanel() {
  const library = useLibrary();
  const { resolveSrc } = useProject();
  const { importFiles } = useLibraryImport();
  const { openLibrary } = useLibraryDialog();
  const placeItem = usePlaceLibraryItem();
  const [view, setView] = useState<LibraryView>(ALL_VIEW);
  const [fileOver, setFileOver] = useState(false);

  // 選的資料夾被刪掉（在管理視窗裡）時回到全部
  const shownView = view.type === "folder" && !library.folders.some((folder) => folder.id === view.id) ? ALL_VIEW : view;
  const counts = useMemo(() => libraryCounts(library), [library]);
  const items = useMemo(() => visibleItems(library, shownView), [library, shownView]);
  // 下拉選單列出全部資料夾（不管管理視窗的展開狀態）
  const rows = useMemo(() => treeRows(library.folders, new Set(library.folders.map((folder) => folder.id))), [library.folders]);

  const importHere = (files: readonly File[]) => {
    if (files.length > 0) void importFiles(files, importFolderOf(shownView));
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-1.5">
        <Select value={viewValue(shownView)} onValueChange={(value) => setView(viewOf(value))}>
          <SelectTrigger size="sm" className="h-8 min-w-0 flex-1" aria-label="資料夾">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部（{counts.all}）</SelectItem>
            <SelectItem value="unsorted">未分類（{counts.unsorted}）</SelectItem>
            {rows.length > 0 && <SelectSeparator />}
            {rows.map(({ folder, depth }) => (
              <SelectItem key={folder.id} value={`folder:${folder.id}`}>
                {"　".repeat(depth)}
                {folder.name}（{counts.folders.get(folder.id) ?? 0}）
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <IconButton label="開啟素材管理" onClick={() => openLibrary(shownView)}>
          <Maximize2 />
        </IconButton>
      </div>

      <div
        data-library-panel-drop
        onDragOver={(event: DragEvent) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setFileOver(true);
        }}
        onDragLeave={() => setFileOver(false)}
        onDrop={(event: DragEvent) => {
          event.preventDefault();
          setFileOver(false);
          importHere(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          "flex items-center justify-center gap-2 rounded-lg border-2 border-dashed px-2 py-2.5 text-xs text-muted-foreground transition-colors",
          fileOver && "border-primary bg-primary/5 text-foreground",
        )}
      >
        將檔案拖放到這裡，或
        <Button size="sm" variant="outline" className="h-7" onClick={() => void pickFiles(LIBRARY_ACCEPT).then(importHere)}>
          <Upload />
          匯入...
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          {library.items.length === 0 ? "素材庫還沒有素材。" : "這個資料夾還沒有素材。"}
          {!isDesktop && "（瀏覽器模式，關閉後不會保留）"}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {items.map((item) => {
            const placeable = item.kind !== "audio";
            return (
              <button
                key={item.id}
                type="button"
                data-library-panel-item={item.id}
                title={placeable ? `${item.name}（點一下放到頁面中央）` : `${item.name}（音訊不能放到頁面）`}
                aria-disabled={!placeable}
                onClick={() => {
                  if (!placeable) return toast.info("音訊目前不能放到頁面");
                  void placeItem(item);
                }}
                className={cn(
                  "group relative rounded-lg text-left outline-offset-2",
                  placeable ? "hover:outline-2 hover:outline-indigo-400/50" : "cursor-not-allowed",
                )}
              >
                <LibraryThumb item={item} resolveSrc={resolveSrc} className="aspect-4/3 w-full" />
                {!placeable && (
                  // 放在右上角，不蓋住音訊卡片下方的檔名
                  <span className="absolute top-1.5 right-1.5 rounded bg-black/55 px-1.5 py-px text-[10px] text-white">
                    不能放到頁面
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
