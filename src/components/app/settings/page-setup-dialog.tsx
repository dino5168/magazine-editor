import { useState } from "react";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActivePage, useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import {
  isPageSetupValid,
  orientationOf,
  presetIdOf,
  presetIdsInGroup,
  presetSize,
  validatePageSetup,
  type PageSetup,
  type PageSizePresetId,
} from "@/lib/editor/page-setup";
import type { Margins } from "@/lib/editor/types";
import { formatNumber } from "@/lib/editor/properties";
import { PAGE_SIZE_GROUPS, PAGE_SIZE_PRESETS } from "@/lib/editor/units";
import { PageSetupFields } from "./page-setup-fields";
import { SettingsDialog, SettingsDialogFooter, type SettingsDialogProps } from "./settings-dialog";

/**
 * 設定 → 文件 → 頁面設定: paper size (all pages) and margins of the current document. One undo step
 * on「確定」; cancel / Esc discards the edits.
 *
 * Args:
 *   props: Open state and close callback.
 *
 * Returns:
 *   Dialog element.
 */
export function PageSetupDialog({ open, onOpenChange }: SettingsDialogProps) {
  return (
    <SettingsDialog open={open} onOpenChange={onOpenChange}>
      <PageSetupForm onDone={() => onOpenChange(false)} />
    </SettingsDialog>
  );
}

function samePageSetup(a: PageSetup, b: PageSetup): boolean {
  const m = (key: keyof Margins) => a.margins[key] === b.margins[key];
  return a.size.width === b.size.width && a.size.height === b.size.height && m("top") && m("right") && m("bottom") && m("left");
}

const CUSTOM_SIZE = "custom";

function PageSetupForm({ onDone }: { readonly onDone: () => void }) {
  const dispatch = useEditorDispatch();
  const page = useActivePage();
  const { pages, margins: documentMargins } = useEditorState().history.present;
  const [initial] = useState<PageSetup>(() => ({
    size: { width: page.width, height: page.height },
    margins: documentMargins,
  }));
  const [draft, setDraft] = useState(initial);
  const mixed = pages.some((p) => p.width !== pages[0].width || p.height !== pages[0].height);

  // 沒動過就不套用：頁面尺寸不一致的文件，按「確定」不應該把所有頁面改成同一個尺寸，也不多一筆復原
  const changed = !samePageSetup(draft, initial);
  const pageErrors = changed ? validatePageSetup(draft.size, draft.margins) : {};
  const canApply = isPageSetupValid(pageErrors);

  const apply = (): void => {
    if (!canApply) return;
    if (changed) dispatch({ type: "document/setPageSetup", size: draft.size, margins: draft.margins });
    onDone();
  };

  const presetId = presetIdOf(draft.size);
  const paperPicker = (
    <Select
      value={presetId ?? CUSTOM_SIZE}
      onValueChange={(id) =>
        id !== CUSTOM_SIZE && setDraft({ ...draft, size: presetSize(id as PageSizePresetId, orientationOf(draft.size)) })
      }
    >
      <SelectTrigger size="sm" className="h-7 flex-1" aria-label="紙張">
        {/* 只顯示名稱：選項裡的尺寸是直式，橫式時會和下面的寬、高對不上 */}
        <SelectValue>{presetId ? PAGE_SIZE_PRESETS[presetId].label : "自訂"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {PAGE_SIZE_GROUPS.map((group) => (
          <SelectGroup key={group.id}>
            <SelectLabel>{group.label}</SelectLabel>
            {presetIdsInGroup(group.id).map((id) => (
              <SelectItem key={id} value={id}>
                {PAGE_SIZE_PRESETS[id].label}
                <span className="ml-2 text-xs text-muted-foreground">
                  {formatNumber(PAGE_SIZE_PRESETS[id].widthMm)} × {formatNumber(PAGE_SIZE_PRESETS[id].heightMm)} mm
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
        <SelectSeparator />
        <SelectItem value={CUSTOM_SIZE} disabled>
          自訂（直接輸入寬、高）
        </SelectItem>
      </SelectContent>
    </Select>
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>頁面設定</DialogTitle>
        <DialogDescription>紙張與邊界，存進目前的文件，可以復原。</DialogDescription>
      </DialogHeader>
      <PageSetupFields
        value={draft}
        onChange={setDraft}
        sizeHeading="紙張（套用到所有頁面）"
        paperPicker={paperPicker}
        sizeNote={
          mixed && (
            <p className="text-xs text-muted-foreground">
              這份文件的頁面尺寸不一致；修改紙張或邊界後按「確定」，所有頁面都會改成同一個尺寸。
            </p>
          )
        }
        errors={Object.values(pageErrors)}
      />
      <SettingsDialogFooter onApply={apply} applyDisabled={!canApply} />
    </>
  );
}
