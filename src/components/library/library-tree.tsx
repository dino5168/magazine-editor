import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { ChevronRight, Folder, FolderPlus, Inbox, LayoutGrid, Plus, Trash, type LucideIcon } from "lucide-react";
import { IconButton } from "@/components/editor/icon-button";
import { InlineNameInput } from "@/components/editor/inline-name-input";
import type { LibraryCounts, LibraryView } from "@/lib/library/library-selectors";
import { canAddSubfolder, treeRows } from "@/lib/library/library-tree";
import { FOLDER_NAME_MAX_CHARS, LIBRARY_DEPTH_MAX, type LibraryFolder } from "@/lib/library/types";
import { cn } from "@/lib/utils";
import { dropMarker, type LibraryDropHint } from "./use-library-drag";

interface LibraryTreeProps {
  readonly folders: readonly LibraryFolder[];
  readonly counts: LibraryCounts;
  readonly view: LibraryView;
  readonly onSelectView: (view: LibraryView) => void;
  readonly expanded: ReadonlySet<string>;
  readonly onToggle: (id: string) => void;
  /** Folder whose name is being edited. */
  readonly renamingId: string | null;
  readonly onStartRename: (id: string) => void;
  readonly onRename: (id: string, name: string) => void;
  readonly onCancelRename: () => void;
  /** Creates a folder (`null` = top level). */
  readonly onAddFolder: (parentId: string | null) => void;
  readonly onDeleteFolder: (id: string) => void;
  /** Drop under the pointer while dragging (rows highlight themselves). */
  readonly dropHint: LibraryDropHint | null;
  /** Pointer down on a folder row: may start dragging the folder. */
  readonly onFolderPointerDown: (id: string, event: ReactPointerEvent) => void;
}

const ROW = "group relative flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-left text-sm select-none";
const ROW_STATE = "hover:bg-muted data-[current=true]:bg-primary/8 data-[current=true]:font-medium";
// 拖曳時的提示：放進去 = 框起來；前 / 後 = 插入線；不能放 = 淡掉
const ROW_DROP = cn(
  "data-[drop=into]:bg-indigo-50 data-[drop=into]:ring-2 data-[drop=into]:ring-indigo-400 data-[drop=into]:ring-inset",
  "data-[drop=invalid]:opacity-50",
  "before:pointer-events-none before:absolute before:inset-x-2 before:h-0.5 before:rounded-full before:bg-indigo-500 before:content-[''] before:hidden",
  "data-[drop=before]:before:block data-[drop=before]:before:-top-px data-[drop=after]:before:block data-[drop=after]:before:-bottom-px",
);

function Count({ value }: { readonly value: number }) {
  return <span className="ml-auto text-xs text-muted-foreground tabular-nums group-hover:invisible">{value}</span>;
}

function SystemRow(props: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly count: number;
  readonly current: boolean;
  readonly onSelect: () => void;
  readonly dataSys: "all" | "unsorted" | "trash";
  readonly dropHint: LibraryDropHint | null;
}) {
  const { icon: Icon, label, count, current, onSelect, dataSys, dropHint } = props;
  return (
    <button
      type="button"
      data-library-sys={dataSys}
      data-current={current}
      data-drop={dropMarker(dropHint, { type: dataSys })}
      aria-current={current}
      onClick={onSelect}
      className={cn(ROW, ROW_STATE, ROW_DROP)}
    >
      <span className="w-4 shrink-0" />
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{label}</span>
      <span className="ml-auto text-xs text-muted-foreground tabular-nums">{count}</span>
    </button>
  );
}

/**
 * Left column of the asset manager: 全部 / 未分類 / 垃圾桶 and the folder tree (Eagle's left panel).
 * Folders: click to show, the arrow expands, double-click renames, hover buttons add a subfolder
 * or delete.
 *
 * Args:
 *   props: Folders, counts, the current view, expanded folders, rename state and callbacks.
 *
 * Returns:
 *   Navigation column.
 */
export function LibraryTree(props: LibraryTreeProps) {
  const { folders, counts, view, onSelectView, expanded, onToggle } = props;
  const rows = treeRows(folders, expanded);
  const isView = (type: LibraryView["type"]) => view.type === type;

  let folderList: ReactNode;
  if (rows.length === 0) {
    folderList = <p className="px-3 py-1 text-xs text-muted-foreground">按 ＋ 建立第一個資料夾</p>;
  } else {
    folderList = rows.map(({ folder, depth, hasChildren }) => {
      const current = view.type === "folder" && view.id === folder.id;
      const renaming = props.renamingId === folder.id;
      const canAdd = canAddSubfolder(folders, folder.id);
      return (
        <div
          key={folder.id}
          role="treeitem"
          aria-selected={current}
          aria-expanded={hasChildren ? expanded.has(folder.id) : undefined}
          data-library-folder={folder.id}
          data-current={current}
          data-drop={dropMarker(props.dropHint, { type: "folder", id: folder.id, zone: "into" })}
          tabIndex={-1}
          onClick={() => onSelectView({ type: "folder", id: folder.id })}
          onDoubleClick={() => props.onStartRename(folder.id)}
          onPointerDown={(event) => {
            // 按在按鈕（展開、新增、刪除）上或改名中不開始拖曳
            if (renaming || (event.target as HTMLElement).closest("button, input")) return;
            props.onFolderPointerDown(folder.id, event);
          }}
          className={cn(ROW, ROW_STATE, ROW_DROP, "cursor-default")}
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          {hasChildren ? (
            <button
              type="button"
              aria-label={expanded.has(folder.id) ? "收合" : "展開"}
              onClick={(event) => {
                event.stopPropagation();
                onToggle(folder.id);
              }}
              onDoubleClick={(event) => event.stopPropagation()}
              className="grid size-4 shrink-0 place-items-center rounded text-muted-foreground hover:bg-foreground/10"
            >
              <ChevronRight className={cn("size-3.5 transition-transform", expanded.has(folder.id) && "rotate-90")} />
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <Folder className="size-4 shrink-0 text-muted-foreground" />
          {renaming ? (
            <InlineNameInput
              initialValue={folder.name}
              maxLength={FOLDER_NAME_MAX_CHARS}
              label="資料夾名稱"
              onCommit={(name) => props.onRename(folder.id, name)}
              onCancel={props.onCancelRename}
              className="h-6 min-w-0 flex-1 px-1.5"
            />
          ) : (
            <>
              <span className="truncate">{folder.name}</span>
              <Count value={counts.folders.get(folder.id) ?? 0} />
              <span className="absolute right-1 hidden items-center group-hover:flex" onDoubleClick={(event) => event.stopPropagation()}>
                <IconButton
                  label={canAdd ? "新增子資料夾" : `資料夾最多 ${LIBRARY_DEPTH_MAX} 層`}
                  disabled={!canAdd}
                  className="size-6"
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onAddFolder(folder.id);
                  }}
                >
                  <FolderPlus />
                </IconButton>
                <IconButton
                  label="刪除資料夾"
                  className="size-6"
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onDeleteFolder(folder.id);
                  }}
                >
                  <Trash />
                </IconButton>
              </span>
            </>
          )}
        </div>
      );
    });
  }

  return (
    <nav aria-label="資料夾" className="flex flex-col gap-0.5 p-2">
      {(
        [
          ["all", LayoutGrid, "全部", counts.all],
          ["unsorted", Inbox, "未分類", counts.unsorted],
          ["trash", Trash, "垃圾桶", counts.trash],
        ] as const
      ).map(([key, icon, label, count]) => (
        <SystemRow
          key={key}
          dataSys={key}
          icon={icon}
          label={label}
          count={count}
          current={isView(key)}
          onSelect={() => onSelectView({ type: key })}
          dropHint={props.dropHint}
        />
      ))}
      <div className="mx-2 my-2 h-px bg-border" />
      <div
        data-library-root
        data-drop={dropMarker(props.dropHint, { type: "root" })}
        className="flex items-center justify-between rounded-md px-2 pb-1 text-xs text-muted-foreground data-[drop=into]:bg-indigo-50 data-[drop=into]:text-indigo-700"
      >
        資料夾
        <IconButton label="新增資料夾" className="size-6" onClick={() => props.onAddFolder(null)}>
          <Plus />
        </IconButton>
      </div>
      <div role="tree" aria-label="資料夾樹" className="flex flex-col gap-0.5">
        {folderList}
      </div>
    </nav>
  );
}
