import { useCallback, useState, type ReactElement } from "react";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEFAULT_NEW_PAGE_SETUP } from "@/lib/editor/element-factory";
import { isPageSetupValid, orientationOf, presetSize, validatePageSetup, type PageSetup } from "@/lib/editor/page-setup";
import type { ChooseNewSetup } from "@/lib/project/use-project-commands";
import { PaperPresetGrid } from "./paper-preset-grid";
import { PageSetupFields } from "./settings/page-setup-fields";
import { SettingsDialog, SettingsDialogFooter } from "./settings/settings-dialog";
import { usePendingChoice } from "./use-pending-choice";

/**
 * Promise-based 新增文件 dialog: paper cards on the left, orientation / size / margins on the right.
 * Every time it opens it starts from A4 portrait with 15 mm margins.
 *
 * Returns:
 *   The dialog element to render and a `choose` function that opens it and resolves with the chosen
 *   setup, or null when the user cancels (取消, Esc, or clicking outside).
 */
export function useNewDocumentDialog(): { readonly dialog: ReactElement; readonly choose: ChooseNewSetup } {
  const { pending, ask, choose: answer } = usePendingChoice<null, PageSetup | null>();
  const choose = useCallback<ChooseNewSetup>(() => ask(null), [ask]);

  const dialog = (
    <SettingsDialog open={pending !== null} onOpenChange={(open) => !open && answer(null)} className="sm:max-w-3xl">
      <NewDocumentForm onCreate={answer} />
    </SettingsDialog>
  );

  return { dialog, choose };
}

function NewDocumentForm({ onCreate }: { readonly onCreate: (setup: PageSetup) => void }) {
  // Radix 關閉時卸載內容，所以每次開啟都從預設值開始
  const [draft, setDraft] = useState<PageSetup>(DEFAULT_NEW_PAGE_SETUP);
  const errors = validatePageSetup(draft.size, draft.margins);
  const canCreate = isPageSetupValid(errors);

  return (
    <>
      <DialogHeader>
        <DialogTitle>新增文件</DialogTitle>
        <DialogDescription>選擇紙張與邊界，按「建立」後開始編輯；之後可以在「設定 → 文件 → 頁面設定」修改。</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-[minmax(0,1fr)_17rem] gap-5">
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          <PaperPresetGrid
            size={draft.size}
            onSelect={(id) => setDraft({ ...draft, size: presetSize(id, orientationOf(draft.size)) })}
          />
        </div>
        <PageSetupFields value={draft} onChange={setDraft} sizeHeading="方向與尺寸" errors={Object.values(errors)} />
      </div>
      <SettingsDialogFooter onApply={() => canCreate && onCreate(draft)} applyDisabled={!canCreate} applyLabel="建立" />
    </>
  );
}
