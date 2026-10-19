import { useMemo, useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { SettingsDialog, SettingsDialogFooter } from "@/components/app/settings/settings-dialog";
import { SheetThumbnail } from "@/components/editor/sheet-thumbnail";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useEditorState } from "@/lib/editor/editor-context";
import { masterContent } from "@/lib/editor/master-pages";
import { resolveElementsVariables, variableValues } from "@/lib/editor/variables";
import { useLibraryControl } from "@/lib/library/library-context";
import { describeCommandError } from "@/lib/project/project-api";
import { useProject } from "@/lib/project/project-context";
import { templateApi } from "@/lib/templates/template-api";
import { restrictedFonts, templateContent, templateDescriptionError, templateNameError } from "@/lib/templates/template-content";
import { TEMPLATE_DESCRIPTION_MAX_LENGTH, TEMPLATE_NAME_MAX_LENGTH, type TemplateEntry } from "@/lib/templates/types";
import { cn } from "@/lib/utils";
import { templateName } from "./template-card";

/** Saving a new template, or replacing an existing one's content (its name stays). */
export type SaveTemplateMode = { readonly kind: "create" } | { readonly kind: "replace"; readonly entry: TemplateEntry };

interface SaveTemplateDialogProps {
  /** Null = closed. */
  readonly mode: SaveTemplateMode | null;
  readonly onClose: () => void;
  /** Every template, for the duplicate-name check. */
  readonly templates: readonly TemplateEntry[];
  /** Called with the template's id after it was written. */
  readonly onSaved: (id: string) => void;
}

/**
 * 「以目前專案建立範本」/「以目前專案更新」: name and description (create only), the sample pages to
 * keep, and a warning about fonts whose license does not allow installing. The template is built
 * from the document as it is now (unsaved changes included).
 *
 * Args:
 *   props: Mode, close callback, templates and the saved callback.
 *
 * Returns:
 *   Dialog element.
 */
export function SaveTemplateDialog({ mode, onClose, templates, onSaved }: SaveTemplateDialogProps) {
  return (
    <SettingsDialog open={mode !== null} onOpenChange={(isOpen) => !isOpen && onClose()} className="sm:max-w-2xl">
      {mode && <SaveTemplateForm mode={mode} templates={templates} onClose={onClose} onSaved={onSaved} />}
    </SettingsDialog>
  );
}

const THUMBNAIL_WIDTH = 72;

function SaveTemplateForm({ mode, templates, onClose, onSaved }: Required<Omit<SaveTemplateDialogProps, "mode">> & { readonly mode: SaveTemplateMode }) {
  const document = useEditorState().history.present;
  const { getSnapshot } = useProject();
  const { getLibrary } = useLibraryControl();
  const replacing = mode.kind === "replace" ? mode.entry : null;
  const [name, setName] = useState(replacing ? templateName(replacing) : document.name);
  const [description, setDescription] = useState("");
  const [pageIds, setPageIds] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const nameError = replacing ? null : templateNameError(name, templates, null);
  const descriptionError = replacing ? null : templateDescriptionError(description);
  const restricted = useMemo(() => restrictedFonts(document), [document]);
  // 縮圖的主頁內容與變數（同「頁面」面板）
  const shown = useMemo(() => {
    const contentOf = new Map(document.masters.map((master) => [master.id, masterContent(document.masters, master.id)]));
    return document.pages.map((page) => {
      const values = variableValues(document, page.id);
      const inherited = page.masterId === null ? [] : (contentOf.get(page.masterId) ?? []);
      return { page, inherited: resolveElementsVariables(inherited, values), elements: resolveElementsVariables(page.elements, values) };
    });
  }, [document]);

  const togglePage = (id: string) =>
    setPageIds((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const save = async () => {
    setSaving(true);
    // 用存檔時的最新內容（含未存檔的修改）；圖片與字型檔匯入時就已寫進專案資料夾
    const content = templateContent(getSnapshot().content.document, getLibrary(), [...pageIds]);
    const saved = replacing
      ? await templateApi.replace(replacing.id, content)
      : await templateApi.create(name.trim(), description.trim(), content);
    setSaving(false);
    if (saved.error) {
      toast.error(`無法${replacing ? "更新" : "建立"}範本：${describeCommandError(saved.error)}`);
      return;
    }
    const shownName = replacing ? templateName(replacing) : name.trim();
    toast.success(`已${replacing ? "更新" : "建立"}範本「${shownName}」`);
    if (saved.data.missingFiles > 0) {
      toast.warning(`有 ${saved.data.missingFiles} 個圖片或字型檔在專案資料夾裡找不到，範本裡沒有這些檔案`);
    }
    onSaved(saved.data.id);
    onClose();
  };

  const note = nameError ?? descriptionError ?? (saving ? "儲存中..." : null);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{replacing ? `以目前專案更新「${templateName(replacing)}」` : "以目前專案建立範本"}</DialogTitle>
        <DialogDescription>
          {replacing
            ? "範本的內容會換成目前專案的設計，名稱與說明不變。"
            : "範本包含文字樣式、色票、專案字型、紙張與邊界、主頁、頁碼規則，以及下面勾選的範例頁。"}
        </DialogDescription>
      </DialogHeader>

      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto py-1">
        {!replacing && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              名稱
              <Input
                value={name}
                maxLength={TEMPLATE_NAME_MAX_LENGTH * 2}
                aria-invalid={nameError !== null}
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              說明（可以空白）
              <Textarea
                value={description}
                maxLength={TEMPLATE_DESCRIPTION_MAX_LENGTH * 2}
                aria-invalid={descriptionError !== null}
                onChange={(event) => setDescription(event.target.value)}
                className="max-h-28 min-h-14"
              />
            </label>
          </>
        )}

        <section className="flex flex-col gap-2" aria-label="範例頁">
          <div className="flex items-center gap-2 text-sm">
            範例頁（已選 {pageIds.size} / {document.pages.length}）
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setPageIds(new Set(document.pages.map((page) => page.id)))}>
              全選
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPageIds(new Set())}>
              全不選
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            勾選的頁面連同上面的物件與圖片一起存進範本，用範本新增的專案一開始就有這些頁。都不勾時，範本只有一頁空白頁（套用第一頁的主頁）。
          </p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
            {shown.map(({ page, inherited, elements }, index) => {
              const checked = pageIds.has(page.id);
              return (
                <button
                  key={page.id}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => togglePage(page.id)}
                  className={cn(
                    "relative flex flex-col items-center gap-1 rounded-md border p-1.5 text-xs outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
                    checked && "border-primary bg-muted ring-1 ring-primary",
                  )}
                >
                  <SheetThumbnail sheet={page} inherited={inherited} elements={elements} width={THUMBNAIL_WIDTH} className="shadow-sm ring-1 ring-border" />
                  <span className="w-full truncate text-center">
                    {index + 1}. {page.name}
                  </span>
                  {checked && (
                    <span className="absolute top-1 right-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                      <Check className="size-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {restricted.length > 0 && (
          <p className="flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <TriangleAlert className="size-4 shrink-0" />
            <span>
              「{restricted.map((font) => font.name).join("」「")}」的授權只允許預覽與列印或編輯，不允許安裝。存進範本後，用這個範本建立的每個專案都會帶著這套字型，請先確認授權允許這樣使用。
            </span>
          </p>
        )}
      </div>

      <SettingsDialogFooter
        onApply={() => void save()}
        applyDisabled={saving || nameError !== null || descriptionError !== null}
        applyLabel={replacing ? "更新" : "建立"}
        note={note}
      />
    </>
  );
}
