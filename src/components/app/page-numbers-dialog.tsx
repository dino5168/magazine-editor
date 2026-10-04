import { useId, useState } from "react";
import { Plus } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { NumberField } from "@/components/editor/number-field";
import { StrokeFields, TextStyleFields } from "@/components/editor/style-controls";
import { cn } from "@/lib/utils";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { createId } from "@/lib/editor/element-factory";
import {
  PAGE_NUMBER_AFFIX_MAX_LENGTH,
  PAGE_NUMBER_MAX,
  PAGE_NUMBER_POSITION_LABELS,
  createPageNumberRule,
  describePageNumberRule,
  describePageRange,
  nextPageNumberRange,
  pageNumberRuleError,
  sortPageNumberRules,
} from "@/lib/editor/page-numbers";
import type { PageNumberFace, PageNumberPosition, PageNumberRule, PageNumberStyle } from "@/lib/editor/types";
import { clamp } from "@/lib/editor/validation";
import { usePreferences, useSetPreferences } from "@/lib/preferences/preferences-context";

interface PageNumbersDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * 「頁碼管理」dialog: edits the document's page number rules. The list and the form are drafts;
 * 「確定」writes the whole list in one undo step, cancel / Esc discards it.
 *
 * Args:
 *   props.open: Whether the dialog is shown.
 *   props.onOpenChange: Called to close the dialog.
 *
 * Returns:
 *   Dialog element.
 */
export function PageNumbersDialog({ open, onOpenChange }: PageNumbersDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-4xl">
        {/* Radix 關閉時會卸載內容，下次開啟時草稿重新從文件目前的設定開始 */}
        <PageNumbersForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

const sameRule = (a: PageNumberRule, b: PageNumberRule): boolean => JSON.stringify(a) === JSON.stringify(b);

function PageNumbersForm({ onDone }: { readonly onDone: () => void }) {
  const dispatch = useEditorDispatch();
  const document = useEditorState().history.present;
  const pageCount = document.pages.length;
  const blankRule = (list: readonly PageNumberRule[]): PageNumberRule => {
    const { from, to } = nextPageNumberRange(list, pageCount);
    return createPageNumberRule(createId(), from, to);
  };

  const showId = useId();
  const preferences = usePreferences();
  const setPreferences = useSetPreferences();
  // App 偏好（只影響畫布）：和頁碼設定一起在「確定」時寫入
  const [showOnCanvas, setShowOnCanvas] = useState(preferences.showPageNumbers);
  const [rules, setRules] = useState<readonly PageNumberRule[]>(document.pageNumberRules);
  const [selectedId, setSelectedId] = useState<string | null>(rules[0]?.id ?? null);
  // 表單：選中列表的一段時是那一段的副本，按「修改設定」才寫回列表
  const [form, setForm] = useState<PageNumberRule>(() => rules[0] ?? blankRule(rules));

  const selected = rules.find((rule) => rule.id === selectedId) ?? null;
  const addError = pageNumberRuleError(rules, form, null);
  const modifyError = selected ? pageNumberRuleError(rules, form, selected.id) : null;
  const formPending = selected ? !sameRule(form, selected) : false;
  const error = selected ? modifyError : addError;

  const select = (rule: PageNumberRule): void => {
    setSelectedId(rule.id);
    setForm(rule);
  };
  const startNew = (list: readonly PageNumberRule[]): void => {
    setSelectedId(null);
    setForm(blankRule(list));
  };
  const add = (): void => {
    if (addError) return;
    const rule = { ...form, id: createId() };
    setRules(sortPageNumberRules([...rules, rule]));
    select(rule);
  };
  const modify = (): void => {
    if (!selected || modifyError) return;
    setRules(sortPageNumberRules(rules.map((rule) => (rule.id === selected.id ? form : rule))));
  };
  const remove = (): void => {
    if (!selected) return;
    const remaining = rules.filter((rule) => rule.id !== selected.id);
    setRules(remaining);
    startNew(remaining);
  };
  const apply = (): void => {
    // 內容沒變時 reducer 回傳同一個 state，不會多一筆復原
    dispatch({ type: "document/setPageNumbering", rules });
    if (showOnCanvas !== preferences.showPageNumbers) setPreferences({ ...preferences, showPageNumbers: showOnCanvas });
    onDone();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>頁碼管理</DialogTitle>
        <DialogDescription>
          把文件分成幾段，每段各自設定頁碼。沒有設定到的頁面不顯示頁碼。目前文件共 {pageCount} 頁。
        </DialogDescription>
      </DialogHeader>
      <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
        <div>
          <Label htmlFor={showId}>在編輯畫面顯示頁碼</Label>
          <p className="text-xs text-muted-foreground">只影響畫面，匯出時照常有頁碼。這個設定存在這台電腦，不存進專案。</p>
        </div>
        <Switch id={showId} checked={showOnCanvas} onCheckedChange={setShowOnCanvas} />
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex flex-col gap-4">
          <StyleSection form={form} onChange={setForm} />
          <RangeSection form={form} onChange={setForm} />
          <div className="grid grid-cols-2 gap-4">
            <FaceSection title="奇數頁" face={form.odd} onChange={(odd) => setForm({ ...form, odd })} />
            <FaceSection title="偶數頁" face={form.even} onChange={(even) => setForm({ ...form, even })} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={add} disabled={addError !== null}>
              加入設定
            </Button>
            <Button size="sm" variant="outline" onClick={modify} disabled={!selected || modifyError !== null || !formPending}>
              修改設定
            </Button>
            <Button size="sm" variant="outline" onClick={remove} disabled={!selected}>
              刪除
            </Button>
          </div>
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <RuleList rules={rules} selectedId={selectedId} onSelect={select} onNew={() => startNew(rules)} />
      </div>
      <DialogFooter>
        {formPending && (
          <p className="mr-auto self-center text-xs text-muted-foreground">表單的修改還沒有按「修改設定」，按「確定」不會套用。</p>
        )}
        <DialogClose asChild>
          <Button variant="outline">取消</Button>
        </DialogClose>
        <Button onClick={apply}>確定</Button>
      </DialogFooter>
    </>
  );
}

// 「頁碼型態」：字型、字級、粗體、顏色、框線（和屬性面板同一套控制項；對齊由位置決定，不顯示）
function StyleSection({ form, onChange }: { readonly form: PageNumberRule; readonly onChange: (next: PageNumberRule) => void }) {
  const setStyle = (patch: Partial<PageNumberStyle>): void => onChange({ ...form, style: { ...form.style, ...patch } });
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs text-muted-foreground">頁碼型態（整段共用）</h3>
      <div className="grid gap-x-6 gap-y-2 rounded-md border p-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <TextStyleFields id={`pn-${form.id}`} style={form.style} onChange={setStyle} />
        </div>
        <div className="flex flex-col gap-2">
          <StrokeFields id={`pn-${form.id}`} stroke={form.style.stroke} onChange={(stroke) => setStyle({ stroke })} switchLabel="加框線" />
        </div>
      </div>
    </section>
  );
}

const toPageNumber = (value: number, min: number): number => clamp(Math.round(value), min, PAGE_NUMBER_MAX);

function RangeSection({ form, onChange }: { readonly form: PageNumberRule; readonly onChange: (next: PageNumberRule) => void }) {
  const setFrom = (value: number): void => {
    const from = toPageNumber(value, 1);
    // 起始值原本跟著起始頁（預設情況）時一起改
    onChange({ ...form, from, start: form.start === form.from ? from : form.start });
  };
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs text-muted-foreground">套用頁面</h3>
      <div className="grid grid-cols-3 gap-3">
        <NumberField key={`from-${form.from}`} label="第" unit="頁" value={form.from} onCommit={setFrom} />
        <NumberField
          key={`to-${form.to}`}
          label="到"
          unit="頁"
          value={form.to}
          onCommit={(value) => onChange({ ...form, to: toPageNumber(value, 1) })}
        />
        <NumberField
          key={`start-${form.start}`}
          label="起始"
          unit=""
          value={form.start}
          onCommit={(value) => onChange({ ...form, start: toPageNumber(value, 0) })}
        />
      </div>
      <p className="text-xs text-muted-foreground">「起始」是第一頁顯示的數字，之後每頁加 1。</p>
    </section>
  );
}

// 3×3 的位置格，中央沒有頁碼（和參考圖一樣）
const POSITION_GRID: readonly (PageNumberPosition | null)[] = [
  "topLeft",
  "topCenter",
  "topRight",
  "middleLeft",
  null,
  "middleRight",
  "bottomLeft",
  "bottomCenter",
  "bottomRight",
];

interface FaceSectionProps {
  readonly title: string;
  readonly face: PageNumberFace;
  readonly onChange: (next: PageNumberFace) => void;
}

// 前後置文字只能單行，最多 PAGE_NUMBER_AFFIX_MAX_LENGTH 個字（以字元計，不是 UTF-16 長度）
const toAffix = (value: string): string =>
  Array.from(value.replace(/[\r\n]/g, "")).slice(0, PAGE_NUMBER_AFFIX_MAX_LENGTH).join("");

function FaceSection({ title, face, onChange }: FaceSectionProps) {
  const affixField = (key: "prefix" | "suffix", label: string, placeholder: string) => (
    <label className="flex items-center gap-1.5">
      <span className="w-14 shrink-0 text-xs text-muted-foreground">{label}</span>
      <Input
        value={face[key]}
        placeholder={placeholder}
        aria-label={`${title}${label}`}
        onChange={(event) => onChange({ ...face, [key]: toAffix(event.target.value) })}
        className="h-7 min-w-0 flex-1 px-2 text-sm"
      />
    </label>
  );
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs text-muted-foreground">{title}</h3>
      {affixField("prefix", "前置文字", "例：第")}
      {affixField("suffix", "後置文字", "例：頁")}
      <div role="radiogroup" aria-label={`${title}位置`} className="grid w-fit grid-cols-3 gap-1 rounded-md border p-1">
        {POSITION_GRID.map((position, index) =>
          position === null ? (
            <div key={index} aria-hidden className="size-10" />
          ) : (
            <button
              key={position}
              type="button"
              role="radio"
              aria-checked={face.position === position}
              onClick={() => onChange({ ...face, position })}
              className={cn(
                "size-10 rounded text-xs transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                face.position === position && "bg-primary text-primary-foreground hover:bg-primary",
              )}
            >
              {PAGE_NUMBER_POSITION_LABELS[position]}
            </button>
          ),
        )}
      </div>
    </section>
  );
}

interface RuleListProps {
  readonly rules: readonly PageNumberRule[];
  readonly selectedId: string | null;
  readonly onSelect: (rule: PageNumberRule) => void;
  readonly onNew: () => void;
}

function RuleList({ rules, selectedId, onSelect, onNew }: RuleListProps) {
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-md border p-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs text-muted-foreground">設定列表（依頁序）</h3>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onNew}>
          <Plus />
          新的一段
        </Button>
      </div>
      <ScrollArea className="h-72">
        {rules.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">還沒有設定，所有頁面都不顯示頁碼。</p>
        ) : (
          <ul className="flex flex-col gap-1" aria-label="頁碼設定">
            {rules.map((rule) => (
              <li key={rule.id}>
                <button
                  type="button"
                  aria-pressed={rule.id === selectedId}
                  onClick={() => onSelect(rule)}
                  className={cn(
                    "w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
                    rule.id === selectedId && "bg-accent text-accent-foreground",
                  )}
                >
                  <span className="block font-medium">{describePageRange(rule)}</span>
                  <span className="block text-xs text-muted-foreground">{describePageNumberRule(rule)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </section>
  );
}
