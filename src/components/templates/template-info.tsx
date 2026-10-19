import { useState, type KeyboardEvent } from "react";
import { FilePlus, Info, RefreshCw, Trash } from "lucide-react";
import { toast } from "sonner";
import { formatTime } from "@/components/library/library-info";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { templateDescriptionError, templateNameError, templateSummary } from "@/lib/templates/template-content";
import { TEMPLATE_DESCRIPTION_MAX_LENGTH, TEMPLATE_NAME_MAX_LENGTH, type TemplateEntry, type TemplateMeta } from "@/lib/templates/types";
import { paperLabel, PROBLEM_LABELS, TemplateThumbnail, templateName } from "./template-card";

interface TemplateInfoProps {
  readonly entry: TemplateEntry | null;
  /** Every template, for the duplicate-name check. */
  readonly templates: readonly TemplateEntry[];
  /** Saves a new name / description; resolves to false when it failed (the field goes back). */
  readonly onUpdateInfo: (meta: TemplateMeta, name: string, description: string) => Promise<boolean>;
  /** 用這個範本新增專案. */
  readonly onNewProject: () => void;
  /** 以目前專案更新: replaces the template's content with the current project's. */
  readonly onReplace: () => void;
  readonly onDelete: () => void;
}

/**
 * Right column of the 文件範本 window: preview, editable name and description, what the template
 * holds, dates and actions. Templates that cannot be used only offer 刪除.
 *
 * Args:
 *   props: Selected template, all templates and callbacks.
 *
 * Returns:
 *   Info column.
 */
export function TemplateInfo({ entry, templates, onUpdateInfo, onNewProject, onReplace, onDelete }: TemplateInfoProps) {
  if (entry === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
        <Info className="size-7 opacity-50" />
        選取範本以查看資訊
      </div>
    );
  }
  const { meta, document } = entry;
  const summary = document ? templateSummary(document) : null;
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div className="flex h-44 shrink-0 items-center justify-center rounded-md bg-muted/50">
        <TemplateThumbnail entry={entry} width={110} className="max-h-40 shadow-sm ring-1 ring-border" />
      </div>
      {meta && entry.problem === null ? (
        // key：換選取的範本時重新開始輸入框的草稿
        <InfoFields key={entry.id} id={entry.id} meta={meta} templates={templates} onUpdateInfo={onUpdateInfo} />
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium break-all">{templateName(entry)}</p>
          <p className="rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
            {entry.problem === "unsupportedVersion"
              ? "這個範本是較新版本的 App 建立的，更新 App 後才能使用。"
              : "範本的檔案已損壞，無法使用，只能刪除。"}
            （{PROBLEM_LABELS[entry.problem ?? "damaged"]}）
          </p>
        </div>
      )}
      {summary && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">紙張</dt>
          <dd className="text-right">{paperLabel(summary)}</dd>
          <dt className="text-muted-foreground">文字樣式</dt>
          <dd className="text-right break-all">
            {summary.textStyleNames.length}
            {summary.textStyleNames.length > 0 && `：${summary.textStyleNames.join("、")}`}
          </dd>
          <dt className="text-muted-foreground">色票</dt>
          <dd className="flex flex-wrap justify-end gap-1">
            {summary.swatchColors.length === 0
              ? "0"
              : summary.swatchColors.map((color, index) => (
                  <span key={index} className="size-3.5 rounded-sm ring-1 ring-border" style={{ backgroundColor: color }} />
                ))}
          </dd>
          <dt className="text-muted-foreground">專案字型</dt>
          <dd className="text-right break-all">{summary.fontNames.length === 0 ? "無" : summary.fontNames.join("、")}</dd>
          <dt className="text-muted-foreground">主頁</dt>
          <dd className="text-right">{summary.masterCount}</dd>
          <dt className="text-muted-foreground">頁碼規則</dt>
          <dd className="text-right">{summary.pageNumberRuleCount}</dd>
          <dt className="text-muted-foreground">頁面</dt>
          <dd className="text-right">{summary.pageCount}</dd>
          {meta && (
            <>
              <dt className="text-muted-foreground">建立</dt>
              <dd className="text-right">{formatTime(meta.createdAt)}</dd>
              <dt className="text-muted-foreground">更新</dt>
              <dd className="text-right">{formatTime(meta.updatedAt)}</dd>
            </>
          )}
        </dl>
      )}
      <div className="mt-auto flex flex-col gap-2">
        {entry.problem === null && (
          <Button onClick={onNewProject}>
            <FilePlus />
            用這個範本新增專案
          </Button>
        )}
        {entry.problem === null && (
          <Button variant="outline" onClick={onReplace}>
            <RefreshCw />
            以目前專案更新
          </Button>
        )}
        <Button variant="outline" className="text-destructive" onClick={onDelete}>
          <Trash />
          刪除範本
        </Button>
      </div>
    </div>
  );
}

interface InfoFieldsProps {
  readonly id: string;
  readonly meta: TemplateMeta;
  readonly templates: readonly TemplateEntry[];
  readonly onUpdateInfo: TemplateInfoProps["onUpdateInfo"];
}

/** Name and description; each is saved when the field loses focus (Enter in the name too). */
function InfoFields({ id, meta, templates, onUpdateInfo }: InfoFieldsProps) {
  const [name, setName] = useState(meta.name);
  const [description, setDescription] = useState(meta.description);

  const commit = async () => {
    if (name.trim() === meta.name && description.trim() === meta.description) {
      setName(meta.name);
      setDescription(meta.description);
      return;
    }
    const error = templateNameError(name, templates, id) ?? templateDescriptionError(description);
    if (error === null && (await onUpdateInfo(meta, name.trim(), description.trim()))) return;
    if (error !== null) toast.error(error);
    setName(meta.name);
    setDescription(meta.description);
  };

  // 在輸入框按 Esc 只還原草稿，不關閉視窗（視窗的 onEscapeKeyDown 也會擋）
  const revertOnEscape = (event: KeyboardEvent, revert: () => void) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    revert();
  };

  return (
    <>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        名稱
        <Input
          value={name}
          maxLength={TEMPLATE_NAME_MAX_LENGTH * 2}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter") event.currentTarget.blur();
            revertOnEscape(event, () => setName(meta.name));
          }}
          className="h-8 text-sm text-foreground"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        說明
        <Textarea
          value={description}
          maxLength={TEMPLATE_DESCRIPTION_MAX_LENGTH * 2}
          placeholder="這個範本適合什麼樣的專案（可以空白）"
          onChange={(event) => setDescription(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => revertOnEscape(event, () => setDescription(meta.description))}
          className="max-h-32 min-h-14 text-sm text-foreground"
        />
      </label>
    </>
  );
}
