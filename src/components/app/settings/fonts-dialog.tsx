import { useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { Download, FileUp, LoaderCircle, Monitor, Plus, Trash, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IconButton } from "@/components/editor/icon-button";
import { usePendingChoice } from "@/components/app/use-pending-choice";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import {
  addDraftFont,
  draftFontNameErrors,
  draftFontUsage,
  editDraftFont,
  finishFontDraft,
  FONT_FILE_ACCEPT,
  isFontCollection,
  isFontFileName,
  pairImportedFonts,
  removeDraftFont,
  startFontDraft,
  type FontDraft,
} from "@/lib/editor/font-draft";
import { catalogFontNaming, catalogIdsInUse } from "@/lib/editor/font-catalog";
import { DEFAULT_FONT_OPTION, FONT_OPTIONS, projectFontOption } from "@/lib/editor/fonts";
import { pickFiles } from "@/lib/editor/image";
import { fontUsage } from "@/lib/editor/project-fonts";
import type { FontFile, ProjectFont } from "@/lib/editor/types";
import { checkFontFileLoads, loadFontOption } from "@/lib/editor/use-fonts-ready";
import { describeCommandError, isDesktop, projectApi } from "@/lib/project/project-api";
import { cn } from "@/lib/utils";
import { CollectionFaceDialog, type CollectionFaceQuestion } from "./collection-face-dialog";
import { FontCatalogPicker } from "./font-catalog-picker";
import { SettingsDialog, SettingsDialogFooter, type SettingsDialogProps } from "./settings-dialog";
import { SystemFontPicker } from "./system-font-picker";

/**
 * 設定 → 文件 → 字型...: fonts imported into the project. Importing copies the file into
 * `assets/fonts/` at once (unused files are cleaned when the project is next opened); everything
 * else goes into a draft that「確定」sends as one `font/applyEdits` (one undo step).
 *
 * Args:
 *   props: Open state and close callback.
 *
 * Returns:
 *   Dialog element.
 */
export function FontsDialog({ open, onOpenChange }: SettingsDialogProps) {
  // 拖放的目標是整個對話框，處理在表單裡（表單持有草稿）
  const dropRef = useRef<((files: File[]) => void) | null>(null);
  return (
    <SettingsDialog open={open} onOpenChange={onOpenChange} className="sm:max-w-xl" onDropFiles={(files) => dropRef.current?.(files)}>
      <FontsForm onDone={() => onOpenChange(false)} dropRef={dropRef} />
    </SettingsDialog>
  );
}

/** Text drawn in each font's preview. */
const PREVIEW_TEXT = "Aa 永字";
/** Apple baseline shifts smaller than this (em) are not mentioned. */
const APPLE_SHIFT_NOTICE_EM = 0.005;

const GENERIC_LABELS = {
  "sans-serif": "黑體類（缺字用 Noto Sans TC）",
  serif: "明體類（缺字用 Noto Serif TC）",
} as const satisfies Record<ProjectFont["generic"], string>;

/** Asks which face of a font collection to use; null = skip the file. */
type ChooseFace = (question: CollectionFaceQuestion) => Promise<number | null>;

/**
 * Stores one font file in the project; for a collection (`.ttc`) the face is asked when more than
 * one can be used.
 *
 * Args:
 *   file: Picked or dropped file.
 *   chooseFace: Asks the user which face of a collection to use.
 *
 * Returns:
 *   The stored file, or null when skipped or refused (a toast says why).
 */
async function importFontFile(file: File, chooseFace: ChooseFace): Promise<FontFile | null> {
  const fail = (reason: string): null => {
    toast.error(`無法匯入「${file.name}」：${reason}`);
    return null;
  };
  const bytes = new Uint8Array(await file.arrayBuffer());
  let index: number | undefined;
  if (isFontCollection(bytes)) {
    const faces = await projectApi.fontCollectionFaces(bytes);
    if (faces.error) return fail(describeCommandError(faces.error));
    const usable = faces.data.filter((face) => face.problem === null);
    if (usable.length === 0) return fail(faces.data[0]?.problem ?? "集合裡沒有字型");
    const chosen = usable.length === 1 ? usable[0].index : await chooseFace({ fileName: file.name, faces: faces.data });
    if (chosen === null) return null;
    index = chosen;
  }
  const result = await projectApi.importFont(bytes, index);
  if (result.error) return fail(describeCommandError(result.error));
  const problem = await checkFontFileLoads(result.data);
  return problem ? fail(problem) : result.data;
}

/**
 * Stores several font files, one after another (a collection may ask which face to use).
 *
 * Args:
 *   files: Picked or dropped files; files that are not `.ttf` / `.otf` / `.ttc` are refused.
 *   chooseFace: Asks the user which face of a collection to use.
 *
 * Returns:
 *   The stored files, in the given order.
 */
async function importFontFiles(files: readonly File[], chooseFace: ChooseFace): Promise<FontFile[]> {
  if (!isDesktop) {
    toast.info("匯入字型僅在桌面版可用");
    return [];
  }
  const stored: FontFile[] = [];
  for (const file of files) {
    if (!isFontFileName(file.name)) {
      toast.error(`「${file.name}」不是字型檔（.ttf、.otf、.ttc）`);
      continue;
    }
    const result = await importFontFile(file, chooseFace);
    if (result) stored.push(result);
  }
  return stored;
}

/** Makes sure a font's faces are registered and loaded, so its preview draws in it. */
function usePreviewFont(font: ProjectFont): boolean {
  const option = useMemo(() => projectFontOption(font), [font]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    void loadFontOption(option).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [option]);
  return ready;
}

interface FontsFormProps {
  readonly onDone: () => void;
  /** Set to the handler for files dropped on the dialog. */
  readonly dropRef: MutableRefObject<((files: File[]) => void) | null>;
}

function FontsForm({ onDone, dropRef }: FontsFormProps) {
  const document = useEditorState().history.present;
  const dispatch = useEditorDispatch();
  const [draft, setDraft] = useState<FontDraft>(() => startFontDraft(document));
  const [selectedId, setSelectedId] = useState<string | null>(document.fonts[0]?.id ?? null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const faceChoice = usePendingChoice<CollectionFaceQuestion, number | null>();

  const documentIds = useMemo(() => new Set(document.fonts.map((font) => font.id)), [document.fonts]);
  const usage = useMemo(
    () => draftFontUsage(draft, new Map(document.fonts.map((font) => [font.id, fontUsage(document, font.id)]))),
    [draft, document],
  );
  const errors = draftFontNameErrors(draft);
  const selected = draft.fonts.find((font) => font.id === selectedId) ?? null;

  // 匯入時字型檔已經複製進專案；取消對話框時清單不變，檔案在下次開檔時清掉
  const runImport = async (files: readonly File[], use: (stored: FontFile[]) => void): Promise<void> => {
    if (files.length === 0) return;
    setBusy(true);
    try {
      const stored = await importFontFiles(files, faceChoice.ask);
      if (stored.length > 0) use(stored);
    } finally {
      setBusy(false);
    }
  };
  // 同一家族的檔案配成一套（一般 + 粗體），其他各自一套；選取第一套新的
  const addFiles = (files: readonly File[]): void =>
    void runImport(files, (stored) => {
      const added = pairImportedFonts(stored).map((pair) => ({ id: crypto.randomUUID(), ...pair }));
      setDraft((current) => added.reduce((next, { id, regular, bold }) => addDraftFont(next, id, regular, bold), current));
      setSelectedId(added[0].id);
    });
  const add = async (): Promise<void> => {
    if (!isDesktop) {
      toast.info("匯入字型僅在桌面版可用");
      return;
    }
    addFiles(await pickFiles(FONT_FILE_ACCEPT));
  };
  const pickBold = async (id: string): Promise<void> => {
    const [file] = await pickFiles(FONT_FILE_ACCEPT);
    if (file) void runImport([file], ([bold]) => setDraft((current) => editDraftFont(current, id, { bold })));
  };
  useEffect(() => {
    dropRef.current = (files) => {
      if (!busy) addFiles(files);
    };
    return () => {
      dropRef.current = null;
    };
  });
  const remove = (id: string, replaceWith: string): void => {
    const index = draft.fonts.findIndex((font) => font.id === id);
    const next = removeDraftFont(draft, id, replaceWith, documentIds);
    setDraft(next);
    if (selectedId === id) setSelectedId(next.fonts[Math.min(index, next.fonts.length - 1)]?.id ?? null);
  };
  const requestRemove = (id: string): void => {
    if ((usage.get(id) ?? 0) > 0) setPendingDelete(id);
    else remove(id, DEFAULT_FONT_OPTION.family);
  };
  const apply = (): void => {
    const { fonts, deletions } = finishFontDraft(draft);
    dispatch({ type: "font/applyEdits", fonts, deletions });
    onDone();
  };

  const firstError = [...errors.values()][0] ?? null;
  return (
    <>
      <DialogHeader>
        <DialogTitle>字型</DialogTitle>
        <DialogDescription>
          從這台電腦安裝的字型加入、下載精選的免費字型，或匯入字型檔（.ttf、.otf、.ttc）。字型檔會存在專案資料夾裡，畫面、PDF、EPUB 與翻頁書用同一個檔案。加入後在屬性面板的字型選單「專案字型」選用。
        </DialogDescription>
      </DialogHeader>

      <FontList
        draft={draft}
        usage={usage}
        errors={errors}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onRename={(id) => {
          setSelectedId(id);
          requestAnimationFrame(() => nameRef.current?.select());
        }}
        onRemove={requestRemove}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={busy || !isDesktop} onClick={() => setPickerOpen(true)}>
          <Monitor />
          從系統字型加入...
        </Button>
        <Button variant="outline" size="sm" disabled={busy || !isDesktop} onClick={() => setCatalogOpen(true)}>
          <Download />
          下載免費字型...
        </Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void add()}>
          {busy ? <LoaderCircle className="animate-spin" /> : <Plus />}
          匯入字型檔...
        </Button>
      </div>
      <FontCatalogPicker
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        inUse={catalogIdsInUse(draft.fonts)}
        onAdd={({ regular, bold }, font) => {
          const id = crypto.randomUUID();
          setDraft((current) => addDraftFont(current, id, regular, bold, catalogFontNaming(font)));
          setSelectedId(id);
        }}
      />
      <SystemFontPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onAdd={({ regular, bold }) => {
          const id = crypto.randomUUID();
          setDraft((current) => addDraftFont(current, id, regular, bold));
          setSelectedId(id);
        }}
      />

      {selected && (
        <FontEditor
          key={selected.id}
          font={selected}
          error={errors.get(selected.id) ?? null}
          nameRef={nameRef}
          busy={busy}
          onChange={(change) => setDraft((current) => editDraftFont(current, selected.id, change))}
          onPickBold={() => void pickBold(selected.id)}
        />
      )}

      <CollectionFaceDialog question={faceChoice.pending?.payload ?? null} onChoose={faceChoice.choose} />

      <SettingsDialogFooter onApply={apply} applyDisabled={firstError !== null || busy} note={firstError} />

      <ReplaceDialog
        font={draft.fonts.find((font) => font.id === pendingDelete) ?? null}
        uses={pendingDelete ? (usage.get(pendingDelete) ?? 0) : 0}
        others={draft.fonts.filter((font) => font.id !== pendingDelete)}
        onConfirm={(replaceWith) => {
          if (pendingDelete) remove(pendingDelete, replaceWith);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}

interface FontListProps {
  readonly draft: FontDraft;
  readonly usage: ReadonlyMap<string, number>;
  readonly errors: ReadonlyMap<string, string>;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onRename: (id: string) => void;
  readonly onRemove: (id: string) => void;
}

// 字型列表：點一列選取、雙擊名稱改名
function FontList({ draft, usage, errors, selectedId, onSelect, onRename, onRemove }: FontListProps) {
  if (draft.fonts.length === 0) {
    return <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">還沒有專案字型。</p>;
  }
  return (
    <ul className="flex max-h-56 flex-col overflow-y-auto rounded-md border p-1" aria-label="專案字型">
      {draft.fonts.map((font) => (
        <li
          key={font.id}
          className={cn(
            "flex items-center gap-3 rounded-sm px-2 py-1.5 text-sm",
            font.id === selectedId ? "bg-muted" : "hover:bg-muted/60",
          )}
          onClick={() => onSelect(font.id)}
        >
          <FontPreview font={font} className="w-24 shrink-0 truncate text-base" />
          <span
            className={cn("min-w-0 flex-1 truncate", errors.has(font.id) && "text-destructive")}
            onDoubleClick={() => onRename(font.id)}
          >
            {font.name.trim() || "（未命名）"}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{font.bold ? "一般 + 粗體" : "只有一般"}</span>
          <span className="w-14 shrink-0 text-right text-xs text-muted-foreground">使用 {usage.get(font.id) ?? 0}</span>
          <IconButton
            label={`刪除「${font.name}」`}
            onClick={(event) => {
              event.stopPropagation();
              onRemove(font.id);
            }}
          >
            <Trash />
          </IconButton>
        </li>
      ))}
    </ul>
  );
}

// 用那套字型畫的預覽；載入完成前是淡色，避免先用替代字型閃一下
function FontPreview({ font, className }: { readonly font: ProjectFont; readonly className?: string }) {
  const ready = usePreviewFont(font);
  return (
    <span
      aria-hidden
      className={cn(className, !ready && "opacity-30")}
      style={{ fontFamily: projectFontOption(font).family }}
    >
      {PREVIEW_TEXT}
    </span>
  );
}

interface FontEditorProps {
  readonly font: ProjectFont;
  readonly error: string | null;
  readonly nameRef: RefObject<HTMLInputElement | null>;
  readonly busy: boolean;
  readonly onChange: (change: { readonly name?: string; readonly generic?: ProjectFont["generic"]; readonly bold?: FontFile | null }) => void;
  readonly onPickBold: () => void;
}

// 選中的字型：名稱、後備字型、一般 / 粗體檔、授權與 Apple 基線的提示
function FontEditor({ font, error, nameRef, busy, onChange, onPickBold }: FontEditorProps) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 rounded-md border p-3 text-sm">
      <Label htmlFor="font-name">名稱</Label>
      <Input
        id="font-name"
        ref={nameRef}
        value={font.name}
        aria-invalid={error !== null}
        onChange={(event) => onChange({ name: event.target.value })}
      />
      {error && <p className="col-start-2 text-xs text-destructive">{error}</p>}

      <Label htmlFor="font-generic">缺字</Label>
      <Select value={font.generic} onValueChange={(generic) => onChange({ generic: generic as ProjectFont["generic"] })}>
        <SelectTrigger id="font-generic" size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(GENERIC_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="text-sm font-medium">一般</span>
      <FileSummary file={font.regular} />

      <span className="text-sm font-medium">粗體</span>
      <div className="flex min-w-0 items-center gap-2">
        {font.bold ? (
          <FileSummary file={font.bold} className="min-w-0 flex-1" />
        ) : (
          <span className="flex-1 text-xs text-muted-foreground">沒有（粗體看起來和一般相同）</span>
        )}
        <Button variant="outline" size="sm" disabled={busy} onClick={onPickBold}>
          <FileUp />
          選擇檔案...
        </Button>
        {font.bold && (
          <IconButton label="清除粗體檔" onClick={() => onChange({ bold: null })}>
            <X />
          </IconButton>
        )}
      </div>

      <FontNotices font={font} />
    </div>
  );
}

function FileSummary({ file, className }: { readonly file: FontFile; readonly className?: string }) {
  const name = [file.fileFamily, file.fileStyle].filter(Boolean).join(" ") || "（檔案沒有名稱）";
  return (
    <span className={cn("truncate text-xs", className)} title={file.src}>
      {name}
      <span className="text-muted-foreground">（字重 {file.weight}）</span>
    </span>
  );
}

// 授權與 Apple 裝置基線的提醒；一般與粗體檔各自檢查
function FontNotices({ font }: { readonly font: ProjectFont }) {
  const files = [font.regular, ...(font.bold ? [font.bold] : [])];
  const notices: { readonly key: string; readonly text: string; readonly warn: boolean }[] = [];
  if (files.some((file) => file.embedding === "previewAndPrint")) {
    notices.push({
      key: "preview",
      warn: true,
      text: "授權只允許「預覽與列印」嵌入：可以用在 PDF；EPUB 與翻頁書會把整個字型檔交給讀者，使用前請確認授權允許。",
    });
  } else if (files.some((file) => file.embedding === "editable")) {
    notices.push({
      key: "editable",
      warn: false,
      text: "授權允許「可編輯」嵌入。EPUB 與翻頁書會把整個字型檔交給讀者，請確認授權允許散布。",
    });
  }
  const shift = Math.max(...files.map((file) => Math.abs(file.appleBaselineShift)));
  if (shift >= APPLE_SHIFT_NOTICE_EM) {
    const direction = font.regular.appleBaselineShift > 0 ? "低" : "高";
    notices.push({
      key: "apple",
      warn: false,
      text: `在 Apple 裝置（Apple Books、Safari）看 EPUB 或翻頁書時，每行文字會比畫面${direction}約 ${(shift * 100).toFixed(1)}% 字級（PDF 與其他閱讀器不受影響）。`,
    });
  }
  if (notices.length === 0) return null;
  return (
    <ul className="col-span-2 flex flex-col gap-1 text-xs">
      {notices.map(({ key, text, warn }) => (
        <li key={key} className={cn("rounded-sm px-2 py-1", warn ? "bg-amber-500/10 text-amber-800 dark:text-amber-300" : "bg-muted text-muted-foreground")}>
          {text}
        </li>
      ))}
    </ul>
  );
}

interface ReplaceDialogProps {
  /** Font being deleted; null = closed. */
  readonly font: ProjectFont | null;
  readonly uses: number;
  readonly others: readonly ProjectFont[];
  readonly onConfirm: (replaceWith: string) => void;
  readonly onCancel: () => void;
}

// 刪除有人用的字型：用到它的地方換成內建或另一套專案字型（預設黑體）
function ReplaceDialog({ font, uses, others, onConfirm, onCancel }: ReplaceDialogProps) {
  const [choice, setChoice] = useState(DEFAULT_FONT_OPTION.family);
  const reset = (): void => setChoice(DEFAULT_FONT_OPTION.family);
  return (
    <AlertDialog
      open={font !== null}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onCancel();
        }
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>刪除「{font?.name}」？</AlertDialogTitle>
          <AlertDialogDescription>這套字型用在 {uses} 處（文字、圖形內文字、文字樣式、頁碼）。刪除後換成：</AlertDialogDescription>
        </AlertDialogHeader>
        <Select value={choice} onValueChange={setChoice}>
          <SelectTrigger aria-label="換成哪一套字型">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>內建</SelectLabel>
              {FONT_OPTIONS.map((option) => (
                <SelectItem key={option.id} value={option.family}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
            {others.length > 0 && (
              <SelectGroup>
                <SelectLabel>專案字型</SelectLabel>
                {others.map((other) => {
                  const option = projectFontOption(other);
                  return (
                    <SelectItem key={option.id} value={option.family}>
                      {other.name.trim() || "（未命名）"}
                    </SelectItem>
                  );
                })}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              onConfirm(choice);
              reset();
            }}
          >
            刪除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
