import { useId, useState } from "react";
import { RectangleHorizontal, RectangleVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NumberField } from "@/components/editor/number-field";
import { cn } from "@/lib/utils";
import { useActivePage, useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import {
  PAGE_SIZE_PRESET_IDS,
  isPageSetupValid,
  orientationOf,
  presetIdOf,
  presetSize,
  validatePageSetup,
  withOrientation,
  type Orientation,
  type PageSizePresetId,
} from "@/lib/editor/page-setup";
import { formatNumber } from "@/lib/editor/properties";
import type { Margins, Size } from "@/lib/editor/types";
import { PAGE_SIZE_PRESETS, mmToPt, ptToMm } from "@/lib/editor/units";
import { MARGIN_MAX_PT, PAGE_SIZE_MAX_PT, PAGE_SIZE_MIN_PT, clamp } from "@/lib/editor/validation";
import { GRID_SPACING, type Preferences } from "@/lib/preferences/preferences";
import { usePreferences, useSetPreferences } from "@/lib/preferences/preferences-context";

export type PreferencesTab = "page" | "grid";

interface PreferencesDialogProps {
  readonly open: boolean;
  readonly tab: PreferencesTab;
  readonly onTabChange: (tab: PreferencesTab) => void;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * Preferences dialog: page setup of the current document and app preferences (grid, guides).
 * Nothing is written until「確定」; cancel / Esc discards the edits.
 *
 * Args:
 *   props.open: Whether the dialog is shown.
 *   props.tab: Selected tab (kept by the caller so the next Ctrl+, reopens it).
 *   props.onTabChange: Called when the user switches tabs.
 *   props.onOpenChange: Called to close the dialog.
 *
 * Returns:
 *   Dialog element.
 */
export function PreferencesDialog({ open, tab, onTabChange, onOpenChange }: PreferencesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Radix 關閉時會卸載內容，下次開啟時草稿重新從目前的值開始 */}
        <PreferencesForm tab={tab} onTabChange={onTabChange} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
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

interface PreferencesFormProps {
  readonly tab: PreferencesTab;
  readonly onTabChange: (tab: PreferencesTab) => void;
  readonly onDone: () => void;
}

function PreferencesForm({ tab, onTabChange, onDone }: PreferencesFormProps) {
  const dispatch = useEditorDispatch();
  const setPreferences = useSetPreferences();
  const page = useActivePage();
  const document = useEditorState().history.present;
  // 草稿放在這裡而不是分頁裡：Radix Tabs 會卸載沒顯示的分頁，切換分頁不能讓草稿消失
  const [initialPage] = useState<PageSetupDraft>(() => ({
    size: { width: page.width, height: page.height },
    margins: document.margins,
  }));
  const [pageDraft, setPageDraft] = useState(initialPage);
  const [draft, setDraft] = useState<Preferences>(usePreferences());

  // 沒動過頁面設定時不套用：頁面尺寸不一致的文件，只改格線不應該把所有頁面改成同一個尺寸
  const pageChanged = !samePageSetup(pageDraft, initialPage);
  const pageErrors = pageChanged ? validatePageSetup(pageDraft.size, pageDraft.margins) : {};
  const canApply = isPageSetupValid(pageErrors);

  const apply = (): void => {
    if (!canApply) return;
    if (pageChanged) dispatch({ type: "document/setPageSetup", size: pageDraft.size, margins: pageDraft.margins });
    setPreferences(draft);
    onDone();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>偏好設定</DialogTitle>
        <DialogDescription className="sr-only">目前文件的頁面設定，以及格線等顯示偏好。</DialogDescription>
      </DialogHeader>
      <Tabs value={tab} onValueChange={(value) => onTabChange(value as PreferencesTab)}>
        <TabsList>
          <TabsTrigger value="page">頁面</TabsTrigger>
          <TabsTrigger value="grid">格線</TabsTrigger>
        </TabsList>
        <TabsContent value="page" className="pt-3">
          <PageTab draft={pageDraft} onChange={setPageDraft} errors={Object.values(pageErrors)} />
        </TabsContent>
        <TabsContent value="grid" className="pt-3">
          <GridTab draft={draft} onChange={setDraft} />
        </TabsContent>
      </Tabs>
      <DialogFooter>
        {!canApply && tab !== "page" && (
          <p className="mr-auto self-center text-xs text-destructive">「頁面」分頁的設定有錯誤</p>
        )}
        <DialogClose asChild>
          <Button variant="outline">取消</Button>
        </DialogClose>
        <Button onClick={apply} disabled={!canApply}>
          確定
        </Button>
      </DialogFooter>
    </>
  );
}

const CUSTOM_SIZE = "custom";
const ORIENTATIONS = [
  { value: "portrait", label: "直式", icon: RectangleVertical },
  { value: "landscape", label: "橫式", icon: RectangleHorizontal },
] as const satisfies readonly { value: Orientation; label: string; icon: unknown }[];

interface PageTabProps {
  readonly draft: PageSetupDraft;
  readonly onChange: (next: PageSetupDraft) => void;
  readonly errors: readonly string[];
}

function PageTab({ draft, onChange, errors }: PageTabProps) {
  const { pages } = useEditorState().history.present;
  const mixed = pages.some((p) => p.width !== pages[0].width || p.height !== pages[0].height);
  const { size, margins } = draft;
  const orientation = orientationOf(size);
  const presetId = presetIdOf(size);

  const setSize = (next: Size) => onChange({ ...draft, size: next });
  const sizeField = (key: keyof Size, label: string) => (
    <MmField
      label={label}
      pt={size[key]}
      min={PAGE_SIZE_MIN_PT}
      max={PAGE_SIZE_MAX_PT}
      onCommit={(pt) => setSize({ ...size, [key]: pt })}
    />
  );
  const marginField = (key: keyof Margins, label: string) => (
    <MmField
      label={label}
      pt={margins[key]}
      min={0}
      max={MARGIN_MAX_PT}
      onCommit={(pt) => onChange({ ...draft, margins: { ...margins, [key]: pt } })}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-col gap-2">
        <h3 className="text-xs text-muted-foreground">紙張（套用到所有頁面）</h3>
        <div className="flex items-center gap-2">
          <Select
            value={presetId ?? CUSTOM_SIZE}
            onValueChange={(id) => id !== CUSTOM_SIZE && setSize(presetSize(id as PageSizePresetId, orientation))}
          >
            <SelectTrigger size="sm" className="h-7 flex-1" aria-label="紙張">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_PRESET_IDS.map((id) => (
                <SelectItem key={id} value={id}>
                  {PAGE_SIZE_PRESETS[id].label}
                </SelectItem>
              ))}
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
  );
}

interface MmFieldProps {
  readonly label: string;
  /** Current value in pt. */
  readonly pt: number;
  readonly min: number;
  readonly max: number;
  /** Called with the new value in pt, clamped into [min, max]. */
  readonly onCommit: (pt: number) => void;
}

/** Number field that shows a pt value in millimetres. */
function MmField({ label, pt, min, max, onCommit }: MmFieldProps) {
  const mm = ptToMm(pt);
  return (
    <NumberField
      key={formatNumber(mm)}
      label={label}
      unit="mm"
      value={mm}
      onCommit={(value) => onCommit(clamp(mmToPt(value), min, max))}
    />
  );
}

interface GridTabProps {
  readonly draft: Preferences;
  readonly onChange: (next: Preferences) => void;
}

function GridTab({ draft, onChange }: GridTabProps) {
  const setGrid = (patch: Partial<Preferences["grid"]>) => onChange({ ...draft, grid: { ...draft.grid, ...patch } });
  const spacingMm = ptToMm(draft.grid.spacing);
  return (
    <div className="flex flex-col gap-3">
      <SwitchRow label="顯示格線" checked={draft.grid.visible} onChange={(visible) => setGrid({ visible })} />
      <NumberField
        key={formatNumber(spacingMm)}
        label="間距"
        unit="mm"
        value={spacingMm}
        onCommit={(mm) => setGrid({ spacing: clamp(mmToPt(mm), GRID_SPACING.min, GRID_SPACING.max) })}
        step={{ size: 1, min: ptToMm(GRID_SPACING.min), max: ptToMm(GRID_SPACING.max) }}
      />
      <SwitchRow label="吸附格線" checked={draft.grid.snap} onChange={(snap) => setGrid({ snap })} />
      <SwitchRow
        label="顯示邊界參考線"
        checked={draft.showMargins}
        onChange={(showMargins) => onChange({ ...draft, showMargins })}
      />
      <p className="text-xs text-muted-foreground">這一頁的設定存在這台電腦，不存進專案。</p>
    </div>
  );
}

interface SwitchRowProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

function SwitchRow({ label, checked, onChange }: SwitchRowProps) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id}>{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
