import { useState } from "react";
import { ArchiveRestore, Info, SquarePlus, Trash } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { folderPath } from "@/lib/library/library-tree";
import { itemNameError } from "@/lib/library/library-validation";
import type { LibraryFolder, LibraryItem } from "@/lib/library/types";
import { kindBadge, LibraryThumb } from "./library-card";

const KIND_LABELS: { readonly [K in LibraryItem["kind"]]: string } = { image: "圖片", text: "文字檔", audio: "音訊" };

/** `345 KB` / `1.4 MB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** RFC 3339 → local `2026/10/08 14:30`. */
function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function NameField({ item, onRename }: { readonly item: LibraryItem; readonly onRename: (name: string) => void }) {
  const [draft, setDraft] = useState(item.name);
  const commit = () => {
    if (draft.trim() === item.name) return setDraft(item.name);
    const error = itemNameError(draft);
    if (error) {
      toast.error(error);
      setDraft(item.name);
      return;
    }
    onRename(draft);
  };
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      名稱
      <Input
        value={draft}
        disabled={item.trashed !== null}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            // 只還原輸入框，不關閉視窗
            event.stopPropagation();
            setDraft(item.name);
          }
        }}
        className="h-8 text-sm text-foreground"
      />
    </label>
  );
}

interface LibraryInfoProps {
  readonly items: readonly LibraryItem[];
  readonly folders: readonly LibraryFolder[];
  readonly resolveSrc: (src: string) => string;
  readonly onRename: (id: string, name: string) => void;
  readonly onTrash: (ids: readonly string[]) => void;
  /** Places an image or a text file on the current page. */
  readonly onPlace: (item: LibraryItem) => void;
  /** Restores trashed items (to their folder, or 未分類 when it is gone). */
  readonly onRestore: (ids: readonly string[]) => void;
  /** Asks to remove trashed items for good. */
  readonly onPurge: (ids: readonly string[]) => void;
}

interface TrashActionsProps {
  readonly ids: readonly string[];
  readonly onRestore: (ids: readonly string[]) => void;
  readonly onPurge: (ids: readonly string[]) => void;
}

function TrashActions({ ids, onRestore, onPurge }: TrashActionsProps) {
  return (
    <div className="mt-auto flex flex-col gap-2">
      <Button onClick={() => onRestore(ids)}>
        <ArchiveRestore />
        還原
      </Button>
      <Button variant="outline" className="text-destructive" onClick={() => onPurge(ids)}>
        <Trash />
        永久刪除
      </Button>
    </div>
  );
}

/**
 * Right column of the asset manager: details of the selected item (preview, name, kind, size,
 * folder, import date) and its actions; a summary when several are selected.
 *
 * Args:
 *   props: Selected items, folders (for the path), URL resolver and callbacks.
 *
 * Returns:
 *   Info column.
 */
export function LibraryInfo({ items, folders, resolveSrc, onRename, onTrash, onPlace, onRestore, onPurge }: LibraryInfoProps) {
  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Info className="size-7 opacity-50" />
          選取素材以查看資訊
        </div>
      </div>
    );
  }
  if (items.length > 1) {
    const trashed = items.every((item) => item.trashed);
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <p className="text-sm font-medium">已選取 {items.length} 個素材</p>
        {trashed && <TrashActions ids={items.map((item) => item.id)} onRestore={onRestore} onPurge={onPurge} />}
        {!trashed && (
          <Button variant="outline" className="mt-auto text-destructive" onClick={() => onTrash(items.map((item) => item.id))}>
            <Trash />
            移到垃圾桶
          </Button>
        )}
      </div>
    );
  }

  const [item] = items;
  const canPlace = !item.trashed && item.kind !== "audio";
  const isMarkdown = kindBadge(item) === "MD";
  const folderName =
    item.trashed !== null ? (item.trashed.fromName ?? "未分類") : item.folderId === null ? "未分類" : folderPath(folders, item.folderId).join(" / ");

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      {/* 固定高度、整張圖放得下：直式圖片不會把下面的欄位與按鈕擠出去 */}
      <LibraryThumb key={`preview:${item.id}`} item={item} resolveSrc={resolveSrc} fit="contain" className="h-44 w-full shrink-0" />
      {/* key：換選取的素材時重新開始輸入框的草稿 */}
      <NameField key={item.id} item={item} onRename={(name) => onRename(item.id, name)} />
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">種類</dt>
        <dd className="text-right">{KIND_LABELS[item.kind]}</dd>
        {item.kind === "image" && (
          <>
            <dt className="text-muted-foreground">尺寸</dt>
            <dd className="text-right">
              {item.width} × {item.height} px
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">檔案大小</dt>
        <dd className="text-right">{formatBytes(item.bytes)}</dd>
        <dt className="text-muted-foreground">{item.trashed ? "原資料夾" : "資料夾"}</dt>
        <dd className="text-right break-all">{folderName}</dd>
        <dt className="text-muted-foreground">匯入日期</dt>
        <dd className="text-right">{formatTime(item.importedAt)}</dd>
        {item.trashed && (
          <>
            <dt className="text-muted-foreground">刪除日期</dt>
            <dd className="text-right">{formatTime(item.trashed.at)}</dd>
          </>
        )}
      </dl>
      {item.kind === "text" && !item.trashed && (
        <p className="rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
          放到頁面時是一個文字物件（純文字）{isMarkdown && "，Markdown 符號原樣保留"}。
        </p>
      )}
      {item.kind === "audio" && !item.trashed && (
        <p className="rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">音訊目前只能匯入與分類，不能放到頁面。</p>
      )}
      {item.trashed && <TrashActions ids={[item.id]} onRestore={onRestore} onPurge={onPurge} />}
      {!item.trashed && (
        <div className="mt-auto flex flex-col gap-2">
          {canPlace && (
            <Button onClick={() => onPlace(item)}>
              <SquarePlus />
              放到目前頁面
            </Button>
          )}
          <Button variant="outline" className="text-destructive" onClick={() => onTrash([item.id])}>
            <Trash />
            移到垃圾桶
          </Button>
        </div>
      )}
    </div>
  );
}
