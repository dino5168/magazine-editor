import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Maximize2, MousePointerClick, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DragGhost, moveDragGhost } from "@/components/drag-ghost";
import { startPointerDrag } from "@/components/pointer-drag";
import { LibraryThumb } from "@/components/library/library-card";
import { useLibraryDialog } from "@/components/library/library-dialog";
import { usePlaceLibraryItem } from "@/components/library/use-place-library-item";
import { pickFiles } from "@/lib/editor/image";
import type { PageId, Point } from "@/lib/editor/types";
import { BUNDLED_PHOTOS, type BundledPhoto } from "@/lib/library/bundled-photos";
import { useLibrary, useLibraryControl } from "@/lib/library/library-context";
import type { LibraryItem } from "@/lib/library/types";
import { LIBRARY_ACCEPT } from "@/lib/library/library-files";
import { ALL_VIEW, importFolderOf, libraryCounts, visibleItems, type LibraryView } from "@/lib/library/library-selectors";
import { treeRows } from "@/lib/library/library-tree";
import { useLibraryImport } from "@/lib/library/use-library-import";
import { isDesktop } from "@/lib/project/project-api";
import { useProject } from "@/lib/project/project-context";
import { cn } from "@/lib/utils";
import { useCanvasDrop } from "../canvas-drop";
import { IconButton } from "../icon-button";

/**
 * What the panel lists: a view of the library, or the bundled sample photos (「內建範例」, not in the
 * library until one is placed; the 素材管理 window does not show them).
 */
type PanelView = LibraryView | { readonly type: "samples" };

/** Select value of a view; folder ids are UUIDs, so they never collide with the fixed values. */
function viewValue(view: PanelView): string {
  return view.type === "folder" ? `folder:${view.id}` : view.type;
}

function viewOf(value: string): PanelView {
  if (value.startsWith("folder:")) return { type: "folder", id: value.slice("folder:".length) };
  if (value === "samples") return { type: "samples" };
  return value === "unsorted" ? { type: "unsorted" } : ALL_VIEW;
}

/** Something the panel can drag onto the canvas: a library item or a bundled photo. */
interface Placeable {
  readonly key: string;
  readonly name: string;
  /** Puts it on a page (default: the middle of the active page). */
  readonly place: (center?: Point, pageId?: PageId) => Promise<unknown>;
}

/**
 * 素材 tool panel (replaces 上傳; the panel id stays `upload` so saved dock layouts keep it): pick a
 * folder, import into it, click a thumbnail to put it in the middle of the page or drag it onto
 * the canvas to put it where it is dropped. Organising happens in the 素材管理 window (the button
 * next to the folder list).
 *
 * Returns:
 *   Panel content.
 */
export function LibraryPanel() {
  const library = useLibrary();
  const { getLibrary } = useLibraryControl();
  const { resolveSrc } = useProject();
  const { importFiles, importBundled } = useLibraryImport();
  const { openLibrary } = useLibraryDialog();
  const placeItem = usePlaceLibraryItem();
  const [view, setView] = useState<PanelView>(ALL_VIEW);
  const [fileOver, setFileOver] = useState(false);
  const { locate } = useCanvasDrop();
  const ghostRef = useRef<HTMLDivElement>(null);
  const cancelDragRef = useRef<(() => void) | null>(null);
  // 拖曳中的素材，以及游標是否在畫布上（標籤的文字跟著變）
  const [dragging, setDragging] = useState<{ readonly target: Placeable; readonly overCanvas: boolean } | null>(null);
  useEffect(() => () => cancelDragRef.current?.(), []);

  // 拖到畫布上放開 = 放在那一頁的那個位置（一筆復原）；放在畫布以外 = 取消。點一下照舊放到中央
  const startDrag = (target: Placeable, event: ReactPointerEvent) => {
    if (event.button !== 0 || cancelDragRef.current) return;
    let last = { x: event.clientX, y: event.clientY };
    let overCanvas = false;
    cancelDragRef.current = startPointerDrag(event, {
      cursor: "no-drop",
      onStart: () => setDragging({ target, overCanvas }),
      onMove: (e) => {
        last = { x: e.clientX, y: e.clientY };
        moveDragGhost(ghostRef.current, e.clientX, e.clientY);
        const now = locate(e.clientX, e.clientY) !== null;
        if (now === overCanvas) return;
        overCanvas = now;
        document.body.style.cursor = now ? "copy" : "no-drop";
        setDragging({ target, overCanvas });
      },
      onEnd: (commit) => {
        setDragging(null);
        const drop = commit ? locate(last.x, last.y) : null;
        if (drop) void target.place(drop.point, drop.pageId);
      },
      onDone: () => {
        cancelDragRef.current = null;
      },
    });
  };

  const itemTarget = (item: LibraryItem): Placeable => ({ key: item.id, name: item.name, place: (center, pageId) => placeItem(item, center, pageId) });
  // 內建範例：先複製進專案、加入未分類（同檔不重複），再和素材一樣放到頁面
  const photoTarget = (photo: BundledPhoto): Placeable => ({
    key: `sample:${photo.id}`,
    name: photo.label,
    place: async (center, pageId) => {
      const image = await importBundled(photo.src, photo.label);
      const item = image && getLibrary().items.find((candidate) => candidate.src === image.src);
      return item ? placeItem(item, center, pageId) : false;
    },
  });

  // 選的資料夾被刪掉（在管理視窗裡）時回到全部
  const shownView: PanelView = view.type === "folder" && !library.folders.some((folder) => folder.id === view.id) ? ALL_VIEW : view;
  const libraryView = shownView.type === "samples" ? null : shownView;
  const counts = useMemo(() => libraryCounts(library), [library]);
  const items = useMemo(() => (libraryView ? visibleItems(library, libraryView) : []), [library, libraryView]);
  // 下拉選單列出全部資料夾（不管管理視窗的展開狀態）
  const rows = useMemo(() => treeRows(library.folders, new Set(library.folders.map((folder) => folder.id))), [library.folders]);

  const importHere = (files: readonly File[]) => {
    if (files.length > 0 && libraryView) void importFiles(files, importFolderOf(libraryView));
  };
  const tileClass = (key: string, enabled = true) =>
    cn(
      "group relative rounded-lg text-left outline-offset-2",
      enabled ? "cursor-grab hover:outline-2 hover:outline-indigo-400/50" : "cursor-not-allowed",
      dragging?.target.key === key && "opacity-40",
    );

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
            <SelectItem value="samples">內建範例（{BUNDLED_PHOTOS.length}）</SelectItem>
            {rows.length > 0 && <SelectSeparator />}
            {rows.map(({ folder, depth }) => (
              <SelectItem key={folder.id} value={`folder:${folder.id}`}>
                {"　".repeat(depth)}
                {folder.name}（{counts.folders.get(folder.id) ?? 0}）
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <IconButton label="開啟素材管理" onClick={() => openLibrary(libraryView ?? ALL_VIEW)}>
          <Maximize2 />
        </IconButton>
      </div>

      {libraryView === null ? (
        // 內建範例不能匯入（匯入的檔案不會變成內建範例），所以不顯示匯入區
        <>
          <p className="px-1 text-xs text-muted-foreground">App 內建的範例相片。放到頁面時會複製進專案，並加入「未分類」。</p>
          <div className="grid grid-cols-2 gap-2">
            {BUNDLED_PHOTOS.map((photo) => {
              const target = photoTarget(photo);
              return (
                <button
                  key={photo.id}
                  type="button"
                  data-library-panel-sample={photo.id}
                  title={`${photo.label}（點一下放到頁面中央，或拖到頁面上）`}
                  onPointerDown={(event) => startDrag(target, event)}
                  onClick={() => void target.place()}
                  className={tileClass(target.key)}
                >
                  <img src={photo.src} alt={photo.label} className="aspect-4/3 w-full rounded-lg bg-muted object-cover" draggable={false} />
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
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
                    title={placeable ? `${item.name}（點一下放到頁面中央，或拖到頁面上）` : `${item.name}（音訊不能放到頁面）`}
                    aria-disabled={!placeable}
                    onPointerDown={(event) => {
                      if (placeable) startDrag(itemTarget(item), event);
                    }}
                    onClick={() => {
                      if (!placeable) return toast.info("音訊目前不能放到頁面");
                      void placeItem(item);
                    }}
                    className={tileClass(item.id, placeable)}
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
        </>
      )}
      {createPortal(
        <DragGhost ref={ghostRef}>
          {dragging && (
            <>
              <MousePointerClick className="size-4" />
              {dragging.target.name}
              <span className="font-normal text-muted-foreground">{dragging.overCanvas ? "放開即放在這裡" : "拖到頁面上"}</span>
            </>
          )}
        </DragGhost>,
        document.body,
      )}
    </div>
  );
}
