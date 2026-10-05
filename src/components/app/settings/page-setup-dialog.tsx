import { useState } from "react";
import { RectangleHorizontal, RectangleVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { useActivePage, useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import {
  isPageSetupValid,
  orientationOf,
  presetIdOf,
  presetIdsInGroup,
  presetSize,
  validatePageSetup,
  withOrientation,
  type Orientation,
  type PageSizePresetId,
} from "@/lib/editor/page-setup";
import type { Margins, Size } from "@/lib/editor/types";
import { formatNumber } from "@/lib/editor/properties";
import { PAGE_SIZE_GROUPS, PAGE_SIZE_PRESETS } from "@/lib/editor/units";
import { MARGIN_MAX_PT, PAGE_SIZE_MAX_PT, PAGE_SIZE_MIN_PT } from "@/lib/editor/validation";
import { SettingsDialog, SettingsDialogFooter, type SettingsDialogProps } from "./settings-dialog";
import { MmField } from "./settings-fields";

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

interface PageSetupDraft {
  readonly size: Size;
  readonly margins: Margins;
}

function samePageSetup(a: PageSetupDraft, b: PageSetupDraft): boolean {
  const m = (key: keyof Margins) => a.margins[key] === b.margins[key];
  return a.size.width === b.size.width && a.size.height === b.size.height && m("top") && m("right") && m("bottom") && m("left");
}

const CUSTOM_SIZE = "custom";
const ORIENTATIONS = [
  { value: "portrait", label: "直式", icon: RectangleVertical },
  { value: "landscape", label: "橫式", icon: RectangleHorizontal },
] as const satisfies readonly { value: Orientation; label: string; icon: unknown }[];

function PageSetupForm({ onDone }: { readonly onDone: () => void }) {
  const dispatch = useEditorDispatch();
  const page = useActivePage();
  const { pages, margins: documentMargins } = useEditorState().history.present;
  const [initial] = useState<PageSetupDraft>(() => ({
    size: { width: page.width, height: page.height },
    margins: documentMargins,
  }));
  const [draft, setDraft] = useState(initial);
  const mixed = pages.some((p) => p.width !== pages[0].width || p.height !== pages[0].height);

  // 沒動過就不套用：頁面尺寸不一致的文件，按「確定」不應該把所有頁面改成同一個尺寸，也不多一筆復原
  const changed = !samePageSetup(draft, initial);
  const pageErrors = changed ? validatePageSetup(draft.size, draft.margins) : {};
  const errors = Object.values(pageErrors);
  const canApply = isPageSetupValid(pageErrors);

  const apply = (): void => {
    if (!canApply) return;
    if (changed) dispatch({ type: "document/setPageSetup", size: draft.size, margins: draft.margins });
    onDone();
  };

  const { size, margins } = draft;
  const orientation = orientationOf(size);
  const presetId = presetIdOf(size);
  const setSize = (next: Size) => setDraft({ ...draft, size: next });
  const sizeField = (key: keyof Size, label: string) => (
    <MmField label={label} pt={size[key]} min={PAGE_SIZE_MIN_PT} max={PAGE_SIZE_MAX_PT} onCommit={(pt) => setSize({ ...size, [key]: pt })} />
  );
  const marginField = (key: keyof Margins, label: string) => (
    <MmField
      label={label}
      pt={margins[key]}
      min={0}
      max={MARGIN_MAX_PT}
      onCommit={(pt) => setDraft({ ...draft, margins: { ...margins, [key]: pt } })}
    />
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>頁面設定</DialogTitle>
        <DialogDescription>紙張與邊界，存進目前的文件，可以復原。</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <section className="flex flex-col gap-2">
          <h3 className="text-xs text-muted-foreground">紙張（套用到所有頁面）</h3>
          <div className="flex items-center gap-2">
            <Select
              value={presetId ?? CUSTOM_SIZE}
              onValueChange={(id) => id !== CUSTOM_SIZE && setSize(presetSize(id as PageSizePresetId, orientation))}
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
            {ORIENTATIONS.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant="outline"
                size="sm"
                aria-pressed={orientation === value}
                className={cn("h-7", orientation === value && "bg-muted")}
                onClick={() => setSize(withOrientation(size, value))}
              >
                <Icon />
                {label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {sizeField("width", "寬")}
            {sizeField("height", "高")}
          </div>
          {mixed && (
            <p className="text-xs text-muted-foreground">
              這份文件的頁面尺寸不一致；修改紙張或邊界後按「確定」，所有頁面都會改成同一個尺寸。
            </p>
          )}
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="text-xs text-muted-foreground">邊界（只顯示參考線，不會輸出）</h3>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {marginField("top", "上")}
            {marginField("bottom", "下")}
            {marginField("left", "左")}
            {marginField("right", "右")}
          </div>
        </section>
        {errors.length > 0 && (
          <ul className="text-xs text-destructive" role="alert">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
      </div>
      <SettingsDialogFooter onApply={apply} applyDisabled={!canApply} />
    </>
  );
}
