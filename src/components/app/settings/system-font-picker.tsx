import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { filterSystemFontFamilies, groupSystemFonts, type SystemFontFamily } from "@/lib/editor/system-fonts";
import { checkFontFileLoads } from "@/lib/editor/use-fonts-ready";
import { describeCommandError, projectApi } from "@/lib/project/project-api";
import type { ImportedFonts, SystemFont } from "@/lib/project/project-types";
import { cn } from "@/lib/utils";
import { SettingsDialog, SettingsDialogFooter } from "./settings-dialog";

/** Value of the bold select meaning「no bold file」(Radix Select does not take an empty string). */
const NO_BOLD = "__none__";
const CHINESE_PREVIEW = "永字 雜誌 Aa";
const LATIN_PREVIEW = "Aa Bb Gg 123";

interface SystemFontPickerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Called with the stored files once they are in the project. */
  readonly onAdd: (fonts: ImportedFonts) => void;
}

/**
 * 「從系統字型加入」: lists the fonts installed on this computer by family, with the regular and
 * bold files picked automatically (changeable), and adds the chosen pair to the project.
 *
 * Args:
 *   props: Open state, close callback and what to do with the added files.
 *
 * Returns:
 *   Dialog element.
 */
export function SystemFontPicker({ open, onOpenChange, onAdd }: SystemFontPickerProps) {
  return (
    <SettingsDialog open={open} onOpenChange={onOpenChange} className="sm:max-w-2xl">
      <PickerBody
        onAdd={(fonts) => {
          onAdd(fonts);
          onOpenChange(false);
        }}
      />
    </SettingsDialog>
  );
}

function faceLabel(face: SystemFont): string {
  return `${face.style || "Regular"}（${face.weight}）・${face.file}${face.source === "user" ? "・使用者" : ""}`;
}

function PickerBody({ onAdd }: { readonly onAdd: (fonts: ImportedFonts) => void }) {
  const [families, setFamilies] = useState<readonly SystemFontFamily[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [chineseOnly, setChineseOnly] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [regularId, setRegularId] = useState<string | null>(null);
  const [boldId, setBoldId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void projectApi.listSystemFonts().then((result) => {
      if (cancelled) return;
      if (result.error) setLoadError(describeCommandError(result.error));
      else setFamilies(groupSystemFonts(result.data));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = useMemo(() => (families ? filterSystemFontFamilies(families, query, chineseOnly) : []), [families, query, chineseOnly]);
  const selected = families?.find((family) => family.key === selectedKey) ?? null;

  const select = (family: SystemFontFamily): void => {
    setSelectedKey(family.key);
    setRegularId(family.regular?.id ?? null);
    setBoldId(family.bold?.id ?? null);
    setAddError(null);
  };

  const add = async (): Promise<void> => {
    if (!regularId) return;
    setBusy(true);
    setAddError(null);
    try {
      const result = await projectApi.importSystemFonts(regularId, boldId);
      if (result.error) {
        setAddError(describeCommandError(result.error));
        return;
      }
      for (const file of [result.data.regular, result.data.bold]) {
        const problem = file ? await checkFontFileLoads(file) : null;
        if (problem) {
          setAddError(problem);
          return;
        }
      }
      onAdd(result.data);
    } finally {
      setBusy(false);
    }
  };

  const usableFaces = selected?.faces.filter((face) => face.problem === null && !face.italic) ?? [];
  const regular = usableFaces.find((face) => face.id === regularId) ?? null;
  const boldFaces = usableFaces.filter((face) => face.id !== regularId && face.weight > (regular?.weight ?? 0));
  return (
    <>
      <DialogHeader>
        <DialogTitle>從系統字型加入</DialogTitle>
        <DialogDescription>
          這台電腦安裝的字型（含你自己安裝的）。加入後字型檔會複製進專案資料夾，換電腦也能開。
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋字型名稱（中英文都可以）" className="pl-8" aria-label="搜尋字型" />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="system-font-chinese" checked={chineseOnly} onCheckedChange={setChineseOnly} />
          <Label htmlFor="system-font-chinese" className="text-sm whitespace-nowrap">
            只看中文字型
          </Label>
        </div>
      </div>

      {loadError ? (
        <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-destructive">無法讀取系統字型：{loadError}</p>
      ) : !families ? (
        <p className="flex items-center justify-center gap-2 rounded-md border border-dashed px-3 py-10 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          正在讀取系統字型（第一次需要幾秒）…
        </p>
      ) : shown.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">沒有符合的字型。</p>
      ) : (
        <ul className="flex h-72 flex-col overflow-y-auto rounded-md border p-1" role="listbox" aria-label="系統字型">
          {shown.map((family) => (
            <li
              key={family.key}
              role="option"
              aria-selected={family.key === selectedKey}
              aria-disabled={family.problem !== null}
              className={cn(
                "flex cursor-default items-center gap-3 rounded-sm px-2 py-1.5 text-sm",
                family.key === selectedKey ? "bg-muted" : "hover:bg-muted/60",
                family.problem !== null && "opacity-50",
              )}
              onClick={() => select(family)}
            >
              <span className="w-32 shrink-0 truncate text-base" style={{ fontFamily: `"${family.cssFamily}", "${family.family}"` }} aria-hidden>
                {family.hasChinese ? CHINESE_PREVIEW : LATIN_PREVIEW}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {family.family}
                {family.cssFamily !== family.family && <span className="ml-1.5 text-xs text-muted-foreground">{family.cssFamily}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {family.problem ?? (family.bold ? "一般 + 粗體" : "只有一般")}
                {family.user && "・使用者"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {selected && selected.problem === null && (
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 rounded-md border p-3 text-sm">
          <Label htmlFor="system-font-regular">一般</Label>
          <Select value={regularId ?? undefined} onValueChange={(id) => {
            setRegularId(id);
            const weight = usableFaces.find((face) => face.id === id)?.weight ?? 0;
            if (boldId && (usableFaces.find((face) => face.id === boldId)?.weight ?? 0) <= weight) setBoldId(null);
          }}>
            <SelectTrigger id="system-font-regular" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {usableFaces.map((face) => (
                <SelectItem key={face.id} value={face.id}>
                  {faceLabel(face)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label htmlFor="system-font-bold">粗體</Label>
          <Select value={boldId ?? NO_BOLD} onValueChange={(id) => setBoldId(id === NO_BOLD ? null : id)}>
            <SelectTrigger id="system-font-bold" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_BOLD}>沒有（粗體看起來和一般相同）</SelectItem>
              {boldFaces.map((face) => (
                <SelectItem key={face.id} value={face.id}>
                  {faceLabel(face)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <SettingsDialogFooter
        onApply={() => void add()}
        applyLabel={busy ? "加入中…" : "加入"}
        applyDisabled={busy || !selected || selected.problem !== null || !regularId}
        note={addError && <span className="text-destructive">{addError}</span>}
      />
    </>
  );
}
