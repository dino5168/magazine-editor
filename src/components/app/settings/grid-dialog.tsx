import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { LineStyleFields, type LineWidthField } from "@/components/editor/style-controls";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ptToMm } from "@/lib/editor/units";
import {
  FACTORY_LINE_STYLES,
  GRID_SPACING,
  GUIDE_LINE_WIDTH,
  clampGuideLineWidth,
  defaultLineStyles,
  sameLineStyles,
  type GuideLineStyle,
  type GuideLineStyles,
  type Preferences,
} from "@/lib/preferences/preferences";
import { usePreferences, useSetPreferences, useSetPreviewPreferences } from "@/lib/preferences/preferences-context";
import { SettingsDialog, SettingsDialogFooter, type SettingsDialogProps } from "./settings-dialog";
import { MmField, SwitchRow } from "./settings-fields";

// 參考線的粗細是螢幕像素：縮放時在螢幕上一樣粗
const GUIDE_WIDTH_FIELD: LineWidthField = {
  label: "粗細",
  unit: "px",
  normalize: clampGuideLineWidth,
  step: { size: GUIDE_LINE_WIDTH.step, min: GUIDE_LINE_WIDTH.min, max: GUIDE_LINE_WIDTH.max },
};

/**
 * 設定 → 偏好設定 → 格線與參考線: grid, content guides and margin guides — whether each is shown
 * and its color / width / dash — plus grid spacing and snapping. App preferences (this computer,
 * not the project, no undo), written on「確定」. The canvas previews the draft while the dialog is
 * open (the dialog sits at the right and does not dim the window); closing without「確定」restores it.
 *
 * Args:
 *   props: Open state and close callback.
 *
 * Returns:
 *   Dialog element.
 */
export function GridDialog({ open, onOpenChange }: SettingsDialogProps) {
  return (
    <SettingsDialog open={open} onOpenChange={onOpenChange} className="sm:max-w-lg" seeThrough>
      <GridForm onDone={() => onOpenChange(false)} />
    </SettingsDialog>
  );
}

/** One titled part of the form. */
function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t pt-3 first:border-t-0 first:pt-0" aria-label={title}>
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function GridForm({ onDone }: { readonly onDone: () => void }) {
  const setPreferences = useSetPreferences();
  const setPreview = useSetPreviewPreferences();
  const [draft, setDraft] = useState<Preferences>(usePreferences());
  // 即時預覽：畫布顯示草稿，但不寫入；對話框關閉（確定 / 取消 / Esc / ✕）時 Radix 卸載內容，清除預覽。
  // 按「確定」時同一批更新先寫入偏好、再清預覽，畫面不會閃回舊值
  useEffect(() => setPreview(draft), [draft, setPreview]);
  useEffect(() => () => setPreview(null), [setPreview]);
  const setGrid = (patch: Partial<Preferences["grid"]>) => setDraft({ ...draft, grid: { ...draft.grid, ...patch } });
  const lineStyle = (kind: keyof GuideLineStyles, name: string) => (
    <LineStyleFields
      id={`guide-${kind}`}
      value={draft.lineStyles[kind]}
      onChange={(next: GuideLineStyle) => setDraft({ ...draft, lineStyles: { ...draft.lineStyles, [kind]: next } })}
      colorLabel={`${name}顏色`}
      dashLabel={`${name}線型`}
      width={GUIDE_WIDTH_FIELD}
    />
  );

  const apply = (): void => {
    setPreferences(draft);
    onDone();
  };

  // 預設值只管三種線的樣式（顏色 / 線型 / 粗細），不含顯示開關、間距與吸附
  const myDefaults = defaultLineStyles(draft);
  const setLineStyles = (lineStyles: GuideLineStyles) => setDraft({ ...draft, lineStyles });
  // 「設為預設」立即存檔（不等「確定」，取消也保留）；草稿也要記下，否則按「確定」會用舊的預設蓋回去
  const saveAsDefault = (): void => {
    const lineStyleDefaults = draft.lineStyles;
    setPreferences((current) => ({ ...current, lineStyleDefaults }));
    setDraft({ ...draft, lineStyleDefaults });
    toast.success("已把目前的線條樣式設為預設");
  };
  const defaultButtons = (
    <>
      <Button
        variant="outline"
        size="sm"
        title="把三種線的樣式改回「設為預設」存的樣式（沒存過時是原廠設定）"
        disabled={sameLineStyles(draft.lineStyles, myDefaults)}
        onClick={() => setLineStyles(myDefaults)}
      >
        恢復預設
      </Button>
      <Button
        variant="outline"
        size="sm"
        title="把目前三種線的樣式存成預設"
        disabled={sameLineStyles(draft.lineStyles, draft.lineStyleDefaults)}
        onClick={saveAsDefault}
      >
        設為預設
      </Button>
      <Button
        variant="link"
        size="sm"
        className="px-1 text-muted-foreground"
        title="把三種線的樣式改回軟體原本的樣式（不會改變存好的預設）"
        disabled={sameLineStyles(draft.lineStyles, FACTORY_LINE_STYLES)}
        onClick={() => setLineStyles(FACTORY_LINE_STYLES)}
      >
        原廠設定
      </Button>
    </>
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>格線與參考線</DialogTitle>
        <DialogDescription>存在這台電腦，不存進專案；粗細以螢幕像素計，縮放時不變。</DialogDescription>
      </DialogHeader>
      {/* 三區加上頁尾在矮的視窗放不下：內容區自己捲動，頁尾固定 */}
      <div className="-mx-4 flex max-h-[min(60vh,32rem)] flex-col gap-3 overflow-y-auto px-4">
        <Section title="格線">
          <SwitchRow label="顯示格線" checked={draft.grid.visible} onChange={(visible) => setGrid({ visible })} />
          <MmField
            label="間距"
            pt={draft.grid.spacing}
            min={GRID_SPACING.min}
            max={GRID_SPACING.max}
            step={{ size: 1, min: ptToMm(GRID_SPACING.min), max: ptToMm(GRID_SPACING.max) }}
            onCommit={(spacing) => setGrid({ spacing })}
          />
          <SwitchRow label="吸附格線" checked={draft.grid.snap} onChange={(snap) => setGrid({ snap })} />
          {lineStyle("grid", "格線")}
        </Section>
        <Section title="內容區對齊線（邊界內的 1/4、1/2、3/4）">
          <SwitchRow
            label="顯示對齊線"
            checked={draft.showContentGuides}
            onChange={(showContentGuides) => setDraft({ ...draft, showContentGuides })}
          />
          {lineStyle("contentGuides", "對齊線")}
          <p className="text-xs text-muted-foreground">1/2 的線會自動畫得比 1/4、3/4 粗而明顯。</p>
        </Section>
        <Section title="邊界參考線">
          <SwitchRow
            label="顯示邊界參考線"
            checked={draft.showMargins}
            onChange={(showMargins) => setDraft({ ...draft, showMargins })}
          />
          {lineStyle("margins", "邊界參考線")}
        </Section>
      </div>
      <SettingsDialogFooter onApply={apply} start={defaultButtons} />
    </>
  );
}
