import { useCallback, useEffect, useState, type ReactElement } from "react";
import { FileText, LayoutTemplate } from "lucide-react";
import { TemplateCard } from "@/components/templates/template-card";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEFAULT_NEW_PAGE_SETUP } from "@/lib/editor/element-factory";
import { isPageSetupValid, orientationOf, presetSize, validatePageSetup, type PageSetup } from "@/lib/editor/page-setup";
import { describeCommandError, isDesktop } from "@/lib/project/project-api";
import type { ChooseNewSetup, NewDocumentChoice } from "@/lib/project/use-project-commands";
import { templateApi } from "@/lib/templates/template-api";
import type { TemplateEntry } from "@/lib/templates/types";
import { cn } from "@/lib/utils";
import { PaperPresetGrid } from "./paper-preset-grid";
import { PageSetupFields } from "./settings/page-setup-fields";
import { SettingsDialog, SettingsDialogFooter } from "./settings/settings-dialog";
import { usePendingChoice } from "./use-pending-choice";

/**
 * Promise-based 新增文件 dialog. 空白: paper cards on the left, orientation / size / margins on the
 * right, starting from A4 portrait with 15 mm margins every time. 文件範本: the templates on this
 * computer on the left; the chosen one's paper is fixed and only its margins can change.
 *
 * Returns:
 *   The dialog element to render and a `choose` function that opens it (optionally on a template)
 *   and resolves with the choice, or null when the user cancels (取消, Esc, or clicking outside).
 */
export function useNewDocumentDialog(): { readonly dialog: ReactElement; readonly choose: ChooseNewSetup } {
  const { pending, ask, choose: answer } = usePendingChoice<string | null, NewDocumentChoice | null>();
  const choose = useCallback<ChooseNewSetup>((templateId) => ask(templateId ?? null), [ask]);

  const dialog = (
    <SettingsDialog open={pending !== null} onOpenChange={(open) => !open && answer(null)} className="sm:max-w-3xl">
      {pending && <NewDocumentForm initialTemplateId={pending.payload} onCreate={answer} />}
    </SettingsDialog>
  );

  return { dialog, choose };
}

type Source = "blank" | "template";

const SOURCES = [
  { value: "blank", label: "空白", icon: FileText },
  { value: "template", label: "文件範本", icon: LayoutTemplate },
] as const satisfies readonly { value: Source; label: string; icon: unknown }[];

/** The paper and margins a template starts with (its first page and its margins). */
function templateSetup(entry: TemplateEntry): PageSetup | null {
  const first = entry.document?.pages[0];
  return entry.document && first ? { size: { width: first.width, height: first.height }, margins: entry.document.margins } : null;
}

interface NewDocumentFormProps {
  /** Start on this template (文件範本 window); null = start on 空白. */
  readonly initialTemplateId: string | null;
  readonly onCreate: (choice: NewDocumentChoice) => void;
}

function NewDocumentForm({ initialTemplateId, onCreate }: NewDocumentFormProps) {
  // Radix 關閉時卸載內容，所以每次開啟都從預設值開始
  const [source, setSource] = useState<Source>(initialTemplateId === null ? "blank" : "template");
  const [blankDraft, setBlankDraft] = useState<PageSetup>(DEFAULT_NEW_PAGE_SETUP);
  // null = 讀取中（瀏覽器模式沒有範本）
  const [templates, setTemplates] = useState<readonly TemplateEntry[] | null>(isDesktop ? null : []);
  const [listError, setListError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState<PageSetup | null>(null);

  const selectTemplate = useCallback((entry: TemplateEntry) => {
    setTemplateId(entry.id);
    setTemplateDraft(templateSetup(entry));
  }, []);

  useEffect(() => {
    if (!isDesktop) return;
    let cancelled = false;
    void templateApi.list().then((listed) => {
      if (cancelled) return;
      if (listed.error) {
        setListError(describeCommandError(listed.error));
        setTemplates([]);
        return;
      }
      setTemplates(listed.data);
      const initial = listed.data.find((entry) => entry.id === initialTemplateId && entry.problem === null);
      if (initial) selectTemplate(initial);
    });
    return () => {
      cancelled = true;
    };
  }, [initialTemplateId, selectTemplate]);

  const usable = (templates ?? []).filter((entry) => entry.problem === null);
  const unusable = (templates?.length ?? 0) - usable.length;
  const draft = source === "blank" ? blankDraft : templateDraft;
  const errors = draft ? validatePageSetup(draft.size, draft.margins) : {};
  const canCreate = draft !== null && isPageSetupValid(errors);

  const create = () => {
    if (!canCreate || draft === null) return;
    if (source === "blank") onCreate({ kind: "blank", setup: blankDraft });
    else if (templateId !== null) onCreate({ kind: "template", id: templateId, margins: draft.margins });
  };

  let templateMessage: string | null = null;
  if (templates === null) templateMessage = "讀取中...";
  else if (listError !== null) templateMessage = `無法讀取文件範本：${listError}`;
  else if (!isDesktop) templateMessage = "文件範本僅在桌面版可用。";
  else if (usable.length === 0) templateMessage = "這台電腦還沒有文件範本。\n可以在「專案管理 → 文件範本...」把設計好的專案存成範本。";

  return (
    <>
      <DialogHeader>
        <DialogTitle>新增文件</DialogTitle>
        <DialogDescription>
          {source === "blank"
            ? "選擇紙張與邊界，按「建立」後開始編輯；之後可以在「設定 → 文件 → 頁面設定」修改。"
            : "從文件範本開始：樣式、色票、字型、主頁、頁碼與範例頁都照範本，紙張照範本，邊界可以改。"}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-[minmax(0,1fr)_17rem] gap-5">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex gap-1" role="group" aria-label="從哪裡開始">
            {SOURCES.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant="outline"
                size="sm"
                aria-pressed={source === value}
                className={cn("h-7", source === value && "bg-muted")}
                onClick={() => setSource(value)}
              >
                <Icon />
                {label}
              </Button>
            ))}
          </div>
          <div className="max-h-[56vh] overflow-y-auto pr-1">
            {source === "blank" ? (
              <PaperPresetGrid
                size={blankDraft.size}
                onSelect={(id) => setBlankDraft({ ...blankDraft, size: presetSize(id, orientationOf(blankDraft.size)) })}
              />
            ) : templateMessage !== null ? (
              <p className="py-10 text-center text-sm whitespace-pre-line text-muted-foreground">{templateMessage}</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2" role="radiogroup" aria-label="文件範本">
                {usable.map((entry) => (
                  <TemplateCard
                    key={entry.id}
                    entry={entry}
                    selected={entry.id === templateId}
                    onSelect={() => selectTemplate(entry)}
                    onOpen={() => {
                      selectTemplate(entry);
                      const setup = templateSetup(entry);
                      if (setup) onCreate({ kind: "template", id: entry.id, margins: setup.margins });
                    }}
                  />
                ))}
              </div>
            )}
            {source === "template" && unusable > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">另有 {unusable} 個範本無法使用（損壞或需要新版 App），可以在文件範本視窗刪除。</p>
            )}
          </div>
        </div>
        {draft ? (
          <PageSetupFields
            value={draft}
            onChange={source === "blank" ? setBlankDraft : (next) => setTemplateDraft({ ...next, size: draft.size })}
            sizeHeading={source === "blank" ? "方向與尺寸" : "紙張（照範本）"}
            sizeLocked={source === "template"}
            errors={Object.values(errors)}
          />
        ) : (
          <p className="pt-8 text-center text-sm text-muted-foreground">選一個範本</p>
        )}
      </div>
      <SettingsDialogFooter onApply={create} applyDisabled={!canCreate} applyLabel="建立" />
    </>
  );
}
