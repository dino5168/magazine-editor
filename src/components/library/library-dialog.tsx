import { useCallback, useMemo, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Folder, Images, Search, Trash, Upload } from "lucide-react";
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
import { DragGhost } from "@/components/drag-ghost";
import { createId } from "@/lib/editor/element-factory";
import { pickFiles } from "@/lib/editor/image";
import { useLibrary, useLibraryDispatch } from "@/lib/library/library-context";
import { LIBRARY_ACCEPT } from "@/lib/library/library-files";
import { ALL_VIEW, importFolderOf, libraryCounts, restoredToUnsorted, visibleItems, type LibraryView } from "@/lib/library/library-selectors";
import { descendants, folderPath, nextFolderName } from "@/lib/library/library-tree";
import { folderNameError } from "@/lib/library/library-validation";
import type { LibraryItem } from "@/lib/library/types";
import { useLibraryImport } from "@/lib/library/use-library-import";
import { useProject } from "@/lib/project/project-context";
import { LibraryGrid, type SelectMode } from "./library-grid";
import { LibraryInfo } from "./library-info";
import { LibraryTree } from "./library-tree";
import { useLibraryDrag } from "./use-library-drag";
import { usePlaceLibraryItem } from "./use-place-library-item";

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

/**
 * Puts focus back on the manager window when a confirmation closes. Radix would return it to the
 * button that opened the confirmation, which may be gone (a deleted folder's row); focus would then
 * land on `<body>`, where Delete reaches the editor's shortcuts.
 */
function refocusManager(event: Event): void {
  event.preventDefault();
  document.querySelector<HTMLElement>("[data-library-dialog]")?.focus();
}

function LibraryManager() {
  const library = useLibrary();
  const dispatch = useLibraryDispatch();
  const { resolveSrc } = useProject();
  const { importFiles } = useLibraryImport();
  const placeItem = usePlaceLibraryItem();

  const [view, setView] = useState<LibraryView>(ALL_VIEW);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // 一開始全部展開；展開狀態不存檔
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(library.folders.map((folder) => folder.id)));
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // 永久刪除的確認：選取的素材，或「清空垃圾桶」（all）
  const [purging, setPurging] = useState<{ readonly ids: readonly string[]; readonly all: boolean } | null>(null);

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

  const restore = (ids: readonly string[]) => {
    const toUnsorted = restoredToUnsorted(library, ids);
    dispatch({ type: "item/restore", ids });
    toast.success(
      toUnsorted > 0
        ? `已還原 ${ids.length} 個素材；其中 ${toUnsorted} 個的原資料夾已刪除，放到「未分類」`
        : `已還原 ${ids.length} 個素材`,
    );
  };

  const confirmPurge = () => {
    if (!purging) return;
    dispatch(purging.all ? { type: "trash/empty" } : { type: "item/purge", ids: purging.ids });
    toast.success(purging.all ? "已清空垃圾桶" : `已永久刪除 ${purging.ids.length} 個素材`);
    setPurging(null);
  };

  const onItemsTrashed = useCallback((count: number) => toast.success(`已移到垃圾桶：${count} 個素材`), []);
  const { hint, dragging, startDrag, ghostRef } = useLibraryDrag(library, dispatch, onItemsTrashed);
  // 拖已選取的卡片 = 拖整組；拖沒選取的卡片 = 只拖它（開始拖曳時才改選取，Ctrl+點選不受影響）
  const startItemDrag = (id: string, event: ReactPointerEvent) => {
    const ids = selectedSet.has(id) ? selectedItems.map((item) => item.id) : [id];
    startDrag({ type: "items", ids }, event, () => {
      if (selectedSet.has(id)) return;
      setSelected([id]);
      setAnchor(id);
    });
  };
  const draggingIds = useMemo(() => new Set(dragging?.type === "items" ? dragging.ids : []), [dragging]);
  const draggingFolder = dragging?.type === "folder" ? folders.find((folder) => folder.id === dragging.id) : undefined;
  // DragGhost 只在 children 是 null 時隱藏
  let ghostLabel: ReactNode = null;
  if (dragging?.type === "items") {
    ghostLabel = (
      <>
        <Images className="size-4" />
        {dragging.ids.length} 個素材
      </>
    );
  } else if (draggingFolder) {
    ghostLabel = (
      <>
        <Folder className="size-4" />
        {draggingFolder.name}
      </>
    );
  }

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

  const place = async (item: LibraryItem) => {
    if (await placeItem(item)) toast.success(`已把「${item.name}」放到目前頁面`);
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
          if (event.key === "Delete" && selectedItems.length > 0) {
            event.preventDefault();
            // 卡片在處理中就被移除（移到垃圾桶），編輯器的快捷鍵看不出它在視窗裡，會刪掉畫布上選取的物件
            event.stopPropagation();
            const ids = selectedItems.map((item) => item.id);
            // 垃圾桶裡按 Delete = 永久刪除（先確認）
            if (shownView.type === "trash") setPurging({ ids, all: false });
            else trash(ids);
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
            dropHint={hint}
            onFolderPointerDown={(id, event) => startDrag({ type: "folder", id }, event)}
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
            {shownView.type === "trash" && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                disabled={counts.trash === 0}
                onClick={() => setPurging({ ids: [], all: true })}
              >
                <Trash />
                清空垃圾桶
              </Button>
            )}
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
            onItemPointerDown={startItemDrag}
            draggingIds={draggingIds}
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
            onPlace={(item) => void place(item)}
            onRestore={restore}
            onPurge={(ids) => setPurging({ ids, all: false })}
          />
        </aside>
      </div>

      {/* 視窗本身有 transform（置中），fixed 定位會以它為準；標籤放到 body 才會跟著游標 */}
      {createPortal(<DragGhost ref={ghostRef}>{ghostLabel}</DragGhost>, document.body)}

      <AlertDialog open={purging !== null} onOpenChange={(isOpen) => !isOpen && setPurging(null)}>
        <AlertDialogContent onCloseAutoFocus={refocusManager}>
          <AlertDialogHeader>
            <AlertDialogTitle>{purging?.all ? "清空垃圾桶？" : `永久刪除 ${purging?.ids.length ?? 0} 個素材？`}</AlertDialogTitle>
            <AlertDialogDescription>
              {purging?.all ? `垃圾桶裡的 ${counts.trash} 個素材` : "這些素材"}
              會從素材庫移除，無法還原。頁面上已經用到的圖片不受影響。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmPurge}>
              {purging?.all ? "清空" : "永久刪除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleting !== undefined} onOpenChange={(isOpen) => !isOpen && setDeletingId(null)}>
        <AlertDialogContent onCloseAutoFocus={refocusManager}>
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
