import { useMemo, useState } from "react";
import { Search, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAddImage } from "@/components/editor/panels/use-add-image";
import { createId } from "@/lib/editor/element-factory";
import { pickFiles } from "@/lib/editor/image";
import { useLibrary, useLibraryDispatch } from "@/lib/library/library-context";
import { LIBRARY_ACCEPT } from "@/lib/library/library-files";
import { ALL_VIEW, importFolderOf, libraryCounts, visibleItems, type LibraryView } from "@/lib/library/library-selectors";
import { descendants, folderPath, nextFolderName } from "@/lib/library/library-tree";
import { folderNameError } from "@/lib/library/library-validation";
import type { LibraryItem } from "@/lib/library/types";
import { useLibraryImport } from "@/lib/library/use-library-import";
import { useProject } from "@/lib/project/project-context";
import { LibraryGrid, type SelectMode } from "./library-grid";
import { LibraryInfo } from "./library-info";
import { LibraryTree } from "./library-tree";

interface LibraryDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * 素材管理 window (檔案 → 素材管理...): Eagle-style three columns — folder tree, masonry grid,
 * item info. Every change is written to `library.json` right away. Radix unmounts the content
 * when closed, so the view and selection start fresh each time.
 *
 * Args:
 *   props: Open state and close callback.
 *
 * Returns:
 *   Dialog element.
 */
export function LibraryDialog({ open, onOpenChange }: LibraryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-library-dialog
        className="flex h-[min(90vh,900px)] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,1400px)]"
        onEscapeKeyDown={(event) => {
          // 在輸入框（改名、搜尋）按 Esc 只結束輸入，不關閉視窗
          if (event.target instanceof HTMLInputElement) event.preventDefault();
        }}
      >
        <LibraryManager />
      </DialogContent>
    </Dialog>
  );
}

function LibraryManager() {
  const library = useLibrary();
  const dispatch = useLibraryDispatch();
  const { resolveSrc } = useProject();
  const { importFiles } = useLibraryImport();
  const addImage = useAddImage();

  const [view, setView] = useState<LibraryView>(ALL_VIEW);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // 一開始全部展開；展開狀態不存檔
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(library.folders.map((folder) => folder.id)));
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { folders } = library;
  // 顯示中的資料夾被刪掉（例如另一個資料夾的刪除連帶刪除）時回到「全部」
  const shownView = view.type === "folder" && !folders.some((folder) => folder.id === view.id) ? ALL_VIEW : view;
  const counts = useMemo(() => libraryCounts(library), [library]);
  const items = useMemo(() => visibleItems(library, shownView, query), [library, shownView, query]);
  // 選取只算目前看得到的（搬走、刪除後自動不選）
  const selectedItems = useMemo(() => items.filter((item) => selected.includes(item.id)), [items, selected]);
  const selectedSet = useMemo(() => new Set(selectedItems.map((item) => item.id)), [selectedItems]);

  const selectView = (next: LibraryView) => {
    setView(next);
    setSelected([]);
    setAnchor(null);
  };

  const select = (id: string, mode: SelectMode) => {
    if (mode === "range" && anchor !== null) {
      const ids = items.map((item) => item.id);
      const [from, to] = [ids.indexOf(anchor), ids.indexOf(id)].sort((a, b) => a - b);
      if (from >= 0) {
        setSelected(ids.slice(from, to + 1));
        return;
      }
    }
    if (mode === "toggle") {
      setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
    } else {
      setSelected([id]);
    }
    setAnchor(id);
  };

  const trash = (ids: readonly string[]) => {
    dispatch({ type: "item/trash", ids, at: new Date().toISOString() });
    toast.success(`已移到垃圾桶：${ids.length} 個素材`);
  };

  const importFolder = importFolderOf(shownView);
  const importHere = async (files: File[]) => {
    if (files.length === 0) return;
    const imported = await importFiles(files, importFolder);
    if (imported.length > 0) setSelected(imported.map((item) => item.id));
  };

  const addFolder = (parentId: string | null) => {
    const id = createId();
    dispatch({ type: "folder/add", folder: { id, name: nextFolderName(folders, parentId), parentId } });
    if (parentId) setExpanded((current) => new Set(current).add(parentId));
    setExpanded((current) => new Set(current).add(id));
    setRenamingId(id);
  };

  const renameFolder = (id: string, name: string) => {
    setRenamingId(null);
    const folder = folders.find((candidate) => candidate.id === id);
    if (!folder) return;
    const error = folderNameError(folders, folder.parentId, name, id);
    if (error) toast.error(error);
    else dispatch({ type: "folder/rename", id, name });
  };

  const place = (item: LibraryItem) => {
    if (item.kind !== "image") return;
    addImage(item.src, item);
    toast.success(`已把「${item.name}」放到目前頁面`);
  };

  const deleting = deletingId ? folders.find((folder) => folder.id === deletingId) : undefined;
  const deletingIds = deleting ? descendants(folders, deleting.id) : [];
  const deletingItems = deleting
    ? library.items.filter((item) => !item.trashed && item.folderId !== null && deletingIds.includes(item.folderId)).length
    : 0;

  const crumb =
    shownView.type === "folder" ? folderPath(folders, shownView.id) : [{ all: "全部", unsorted: "未分類", trash: "垃圾桶" }[shownView.type]];
  const importTargetName = importFolder === null ? "未分類" : folderPath(folders, importFolder).join(" / ");
  const emptyMessage =
    shownView.type === "trash" ? "垃圾桶是空的" : query.trim() ? "找不到符合的素材" : "這裡還沒有素材\n按「匯入」或把檔案拖進來";

  return (
    <>
      <div className="flex items-center gap-3 border-b px-4 py-3 pr-12">
        <DialogTitle className="text-base">素材管理</DialogTitle>
        <DialogDescription className="text-xs">本專案的素材庫 · 變更立即儲存</DialogDescription>
      </div>
      <div
        className="grid min-h-0 flex-1 grid-cols-[230px_minmax(0,1fr)_260px]"
        onKeyDown={(event) => {
          if (event.target instanceof HTMLInputElement) return;
          if (event.key === "Delete" && selectedItems.length > 0 && shownView.type !== "trash") {
            event.preventDefault();
            trash(selectedItems.map((item) => item.id));
          }
        }}
      >
        <div className="min-h-0 overflow-y-auto border-r bg-muted/30">
          <LibraryTree
            folders={folders}
            counts={counts}
            view={shownView}
            onSelectView={selectView}
            expanded={expanded}
            onToggle={(id) =>
              setExpanded((current) => {
                const next = new Set(current);
                if (!next.delete(id)) next.add(id);
                return next;
              })
            }
            renamingId={renamingId}
            onStartRename={setRenamingId}
            onRename={renameFolder}
            onCancelRename={() => setRenamingId(null)}
            onAddFolder={addFolder}
            onDeleteFolder={setDeletingId}
          />
        </div>

        <section className="flex min-h-0 min-w-0 flex-col" aria-label="素材">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <p className="flex min-w-0 items-center gap-1 text-sm font-medium">
              {crumb.map((name, index) => (
                <span key={index} className="flex min-w-0 items-center gap-1">
                  {index > 0 && <span className="text-muted-foreground">/</span>}
                  <span className={index < crumb.length - 1 ? "truncate text-muted-foreground" : "truncate"}>{name}</span>
                </span>
              ))}
            </p>
            <label className="ml-auto flex h-8 w-48 items-center gap-1.5 rounded-md border px-2 text-muted-foreground">
              <Search className="size-4 shrink-0" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setQuery("");
                }}
                placeholder="搜尋名稱"
                aria-label="搜尋名稱"
                className="h-7 border-0 px-0 shadow-none focus-visible:ring-0"
              />
            </label>
            {shownView.type !== "trash" && (
              <Button size="sm" onClick={() => void pickFiles(LIBRARY_ACCEPT).then(importHere)}>
                <Upload />
                匯入
              </Button>
            )}
          </div>
          <LibraryGrid
            items={items}
            selected={selectedSet}
            onSelect={select}
            onClearSelection={() => setSelected([])}
            resolveSrc={resolveSrc}
            onDropFiles={shownView.type === "trash" ? null : (files) => void importHere(files)}
            emptyMessage={emptyMessage}
          />
          <div className="flex gap-3 border-t px-3 py-1.5 text-xs text-muted-foreground">
            <span>{items.length} 個素材</span>
            {selectedItems.length > 0 && <span>已選取 {selectedItems.length} 個</span>}
            {shownView.type !== "trash" && <span className="ml-auto">匯入到「{importTargetName}」</span>}
          </div>
        </section>

        <aside className="min-h-0 border-l" aria-label="素材資訊">
          <LibraryInfo
            items={selectedItems}
            folders={folders}
            resolveSrc={resolveSrc}
            onRename={(id, name) => dispatch({ type: "item/rename", id, name })}
            onTrash={trash}
            onPlace={place}
          />
        </aside>
      </div>

      <AlertDialog open={deleting !== undefined} onOpenChange={(isOpen) => !isOpen && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除「{deleting?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingIds.length > 1 && `連同 ${deletingIds.length - 1} 個子資料夾一起刪除。`}
              {deletingItems > 0 ? `裡面的 ${deletingItems} 個素材會移到垃圾桶，可以從垃圾桶還原。` : "這個資料夾是空的。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) dispatch({ type: "folder/delete", id: deleting.id, at: new Date().toISOString() });
                setDeletingId(null);
              }}
            >
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
