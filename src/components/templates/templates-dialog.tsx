import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutTemplate, Plus, Search } from "lucide-react";
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
import { describeCommandError } from "@/lib/project/project-api";
import { templateApi } from "@/lib/templates/template-api";
import type { TemplateEntry, TemplateMeta } from "@/lib/templates/types";
import { SaveTemplateDialog, type SaveTemplateMode } from "./save-template-dialog";
import { TemplateCard, templateName } from "./template-card";
import { TemplateInfo } from "./template-info";

interface TemplatesDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** 用這個範本新增專案: closes the window and starts 檔案 → 新增 on the template. */
  readonly onNewProject: (templateId: string) => void;
}

/**
 * 文件範本 window (專案管理 → 文件範本...; desktop only, the menu handler checks).
 * Must be inside `EditorProvider`, `LibraryProvider` and `ProjectProvider`.
 *
 * Args:
 *   props: Open state, its setter and the new-project callback.
 *
 * Returns:
 *   Dialog element.
 */
export function TemplatesDialog({ open, onOpenChange, onNewProject }: TemplatesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-templates-dialog
        className="flex h-[min(85vh,820px)] w-[92vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(92vw,1100px)]"
        onOpenAutoFocus={(event) => {
          // 預設會聚焦第一個輸入框（搜尋），Esc 就關不掉視窗；改成聚焦視窗本身
          event.preventDefault();
          document.querySelector<HTMLElement>("[data-templates-dialog]")?.focus();
        }}
        onEscapeKeyDown={(event) => {
          // 在說明或有內容的輸入框（名稱、搜尋）按 Esc 只還原 / 清除，不關閉視窗；空的搜尋框照常關閉
          const { target } = event;
          if (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.value !== "")) {
            event.preventDefault();
          }
        }}
      >
        <TemplatesManager onNewProject={onNewProject} />
      </DialogContent>
    </Dialog>
  );
}

/** Puts focus back on the window when the confirmation closes (see `refocusManager` in 素材管理). */
function refocusManager(event: Event): void {
  event.preventDefault();
  document.querySelector<HTMLElement>("[data-templates-dialog]")?.focus();
}

/**
 * 文件範本 window: template cards on the left, the selected template's info on the right. Radix
 * unmounts it when closed, so the list is read again each time it opens. Changes are written right
 * away (templates are app data: no undo, no 未存檔).
 *
 * Args:
 *   props.onNewProject: 用這個範本新增專案.
 *
 * Returns:
 *   Window content.
 */
function TemplatesManager({ onNewProject }: Pick<TemplatesDialogProps, "onNewProject">) {
  // null = 讀取中
  const [templates, setTemplates] = useState<readonly TemplateEntry[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<TemplateEntry | null>(null);
  const [saveMode, setSaveMode] = useState<SaveTemplateMode | null>(null);

  const reload = useCallback(async (select?: string) => {
    const listed = await templateApi.list();
    if (listed.error) {
      toast.error(`無法讀取文件範本：${describeCommandError(listed.error)}`);
      setTemplates([]);
      return;
    }
    setTemplates(listed.data);
    setSelectedId((current) => select ?? (listed.data.some((entry) => entry.id === current) ? current : (listed.data[0]?.id ?? null)));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return (templates ?? []).filter((entry) => !keyword || templateName(entry).toLowerCase().includes(keyword));
  }, [templates, query]);
  const selected = templates?.find((entry) => entry.id === selectedId) ?? null;

  const updateInfo = async (meta: TemplateMeta, name: string, description: string): Promise<boolean> => {
    if (!selected) return false;
    const updated = await templateApi.updateInfo(selected.id, name, description);
    if (updated.error) {
      toast.error(`無法更新範本：${describeCommandError(updated.error)}`);
      return false;
    }
    if (updated.data.name !== meta.name) toast.success(`已改名為「${updated.data.name}」`);
    setTemplates((current) => current?.map((entry) => (entry.id === selected.id ? { ...entry, meta: updated.data } : entry)) ?? null);
    return true;
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const deleted = await templateApi.delete(deleting.id);
    if (deleted.error) toast.error(`無法刪除範本：${describeCommandError(deleted.error)}`);
    else toast.success(`已刪除範本「${templateName(deleting)}」`);
    setDeleting(null);
    await reload();
  };

  let emptyMessage: string | null = null;
  if (templates === null) emptyMessage = "讀取中...";
  else if (templates.length === 0) emptyMessage = "還沒有文件範本。\n按「以目前專案建立範本...」把設計好的專案存成範本，新增專案時就可以套用。";
  else if (visible.length === 0) emptyMessage = "找不到符合的範本";

  return (
    <>
      <div className="flex items-center gap-3 border-b px-4 py-3 pr-12">
        <DialogTitle className="text-base">文件範本</DialogTitle>
        <DialogDescription className="text-xs">存在這台電腦、所有專案共用 · 變更立即儲存</DialogDescription>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_280px]">
        <section className="flex min-h-0 min-w-0 flex-col" aria-label="範本">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <p className="text-sm font-medium">{templates === null ? "" : `${templates.length} 個範本`}</p>
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
            <Button size="sm" onClick={() => setSaveMode({ kind: "create" })}>
              <Plus />
              以目前專案建立範本...
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {emptyMessage !== null ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm whitespace-pre-line text-muted-foreground">
                <LayoutTemplate className="size-8 opacity-50" />
                {emptyMessage}
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                {visible.map((entry) => (
                  <TemplateCard
                    key={entry.id}
                    entry={entry}
                    selected={entry.id === selectedId}
                    onSelect={() => setSelectedId(entry.id)}
                    onOpen={entry.problem === null ? () => onNewProject(entry.id) : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
        <aside className="min-h-0 border-l" aria-label="範本資訊">
          <TemplateInfo
            entry={selected}
            templates={templates ?? []}
            onUpdateInfo={updateInfo}
            onNewProject={() => selected && onNewProject(selected.id)}
            onReplace={() => selected && setSaveMode({ kind: "replace", entry: selected })}
            onDelete={() => setDeleting(selected)}
          />
        </aside>
      </div>

      <SaveTemplateDialog mode={saveMode} onClose={() => setSaveMode(null)} templates={templates ?? []} onSaved={(id) => void reload(id)} />

      <AlertDialog open={deleting !== null} onOpenChange={(isOpen) => !isOpen && setDeleting(null)}>
        <AlertDialogContent onCloseAutoFocus={refocusManager}>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除範本「{deleting ? templateName(deleting) : ""}」？</AlertDialogTitle>
            <AlertDialogDescription>範本會從這台電腦刪除，無法還原。用它建立過的專案不受影響。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void confirmDelete()}>
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
