import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { GripVertical, Plus, Trash } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColorPicker } from "@/components/editor/color-picker";
import { IconButton } from "@/components/editor/icon-button";
import { startPointerDrag } from "@/components/pointer-drag";
import { insertionSlot } from "@/lib/dock/dock-layout";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { slotToIndex } from "@/lib/editor/page-order";
import {
  addDraftSwatch,
  draftNameErrors,
  draftUsage,
  editDraftSwatch,
  finishSwatchDraft,
  moveDraftSwatch,
  removeDraftSwatch,
  startSwatchDraft,
  type SwatchDraft,
} from "@/lib/editor/swatch-draft";
import { parseSwatchHex, swatchUsage } from "@/lib/editor/swatches";
import type { Swatch } from "@/lib/editor/types";
import { cn } from "@/lib/utils";
import { SettingsDialog, SettingsDialogFooter, type SettingsDialogProps } from "./settings-dialog";

/**
 * 設定 → 文件 → 色票...: the document's swatches (named, opaque colors). Every change goes into a
 * draft;「確定」sends it as one `swatch/applyEdits` (one undo step), so uses of a recolored swatch
 * follow it and uses of a deleted one move to the chosen replacement.
 *
 * Args:
 *   props: Open state and close callback.
 *
 * Returns:
 *   Dialog element.
 */
export function SwatchesDialog({ open, onOpenChange }: SettingsDialogProps) {
  return (
    <SettingsDialog open={open} onOpenChange={onOpenChange} className="sm:max-w-lg">
      <SwatchesForm onDone={() => onOpenChange(false)} />
    </SettingsDialog>
  );
}

// 「不替換」在 Select 裡的值（Radix Select 不收空字串）
const NO_REPLACEMENT = "__none__";

function SwatchesForm({ onDone }: { readonly onDone: () => void }) {
  const document = useEditorState().history.present;
  const dispatch = useEditorDispatch();
  const [draft, setDraft] = useState<SwatchDraft>(() => startSwatchDraft(document));
  const [selectedId, setSelectedId] = useState<string | null>(document.swatches[0]?.id ?? null);
  // 刪除有人用的色票前，先問要換成哪一個
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const documentIds = useMemo(() => new Set(document.swatches.map((swatch) => swatch.id)), [document.swatches]);
  const usage = useMemo(() => draftUsage(draft, swatchUsage(document)), [draft, document]);
  const errors = draftNameErrors(draft);
  const selected = draft.swatches.find((swatch) => swatch.id === selectedId) ?? null;

  const add = (): void => {
    const id = crypto.randomUUID();
    setDraft(addDraftSwatch(draft, id, selected?.color ?? "#000000"));
    setSelectedId(id);
  };
  const remove = (id: string, replaceWith: string | null): void => {
    const index = draft.swatches.findIndex((swatch) => swatch.id === id);
    const next = removeDraftSwatch(draft, id, replaceWith, documentIds);
    setDraft(next);
    // 選取移到下一個（沒有就上一個）
    if (selectedId === id) setSelectedId(next.swatches[Math.min(index, next.swatches.length - 1)]?.id ?? null);
  };
  const requestRemove = (id: string): void => {
    if ((usage.get(id) ?? 0) > 0) setPendingDelete(id);
    else remove(id, null);
  };
  const apply = (): void => {
    const { swatches, deletions } = finishSwatchDraft(draft);
    dispatch({ type: "swatch/applyEdits", swatches, deletions });
    onDone();
  };

  const firstError = [...errors.values()][0] ?? null;
  return (
    <>
      <DialogHeader>
        <DialogTitle>色票</DialogTitle>
        <DialogDescription>
          文件裡的具名顏色，存進目前的文件。在調色板點色票就連到它；改色票時，連到它的地方一起變。
        </DialogDescription>
      </DialogHeader>

      <SwatchList
        draft={draft}
        usage={usage}
        errors={errors}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onRename={(id) => {
          setSelectedId(id);
          requestAnimationFrame(() => nameRef.current?.select());
        }}
        onMove={(from, to) => setDraft(moveDraftSwatch(draft, from, to))}
        onRemove={requestRemove}
      />
      <Button variant="outline" size="sm" className="self-start" onClick={add}>
        <Plus />
        新增色票
      </Button>

      {selected && (
        <SwatchEditor
          key={selected.id}
          swatch={selected}
          error={errors.get(selected.id) ?? null}
          nameRef={nameRef}
          onChange={(change) => setDraft(editDraftSwatch(draft, selected.id, change))}
        />
      )}

      <SettingsDialogFooter onApply={apply} applyDisabled={firstError !== null} note={firstError} />

      <ReplaceDialog
        swatch={draft.swatches.find((swatch) => swatch.id === pendingDelete) ?? null}
        uses={pendingDelete ? (usage.get(pendingDelete) ?? 0) : 0}
        others={draft.swatches.filter((swatch) => swatch.id !== pendingDelete)}
        onConfirm={(replaceWith) => {
          if (pendingDelete) remove(pendingDelete, replaceWith);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}

interface SwatchListProps {
  readonly draft: SwatchDraft;
  readonly usage: ReadonlyMap<string, number>;
  readonly errors: ReadonlyMap<string, string>;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onRename: (id: string) => void;
  readonly onMove: (from: number, to: number) => void;
  readonly onRemove: (id: string) => void;
}

// 色票列表：點一列選取、雙擊名稱改名、拖曳把手（或在把手上按 ↑ / ↓）排序
function SwatchList({ draft, usage, errors, selectedId, onSelect, onRename, onMove, onRemove }: SwatchListProps) {
  const listRef = useRef<HTMLUListElement>(null);
  // 拖曳中：被拖的那一列與放下的空隙（0 = 最上面之前）
  const [drag, setDrag] = useState<{ readonly from: number; readonly slot: number } | null>(null);

  const startDrag = (event: ReactPointerEvent, from: number): void => {
    if (event.button !== 0) return;
    let slot = from;
    startPointerDrag(event, {
      cursor: "grabbing",
      onStart: () => setDrag({ from, slot }),
      onMove: (e) => {
        const rows = [...(listRef.current?.querySelectorAll("[data-swatch-row]") ?? [])];
        const centers = rows.map((row) => {
          const rect = row.getBoundingClientRect();
          return rect.top + rect.height / 2;
        });
        slot = insertionSlot(centers, e.clientY);
        setDrag({ from, slot });
      },
      onEnd: (commit) => {
        setDrag(null);
        if (commit) onMove(from, slotToIndex(slot, from));
      },
    });
  };
  const moveWithKeys = (event: KeyboardEvent, index: number): void => {
    const to = event.key === "ArrowUp" ? index - 1 : event.key === "ArrowDown" ? index + 1 : null;
    if (to === null) return;
    event.preventDefault();
    onMove(index, to);
  };
  // 放下會改變位置時才畫插入線
  const lineSlot = drag && drag.slot !== drag.from && drag.slot !== drag.from + 1 ? drag.slot : null;

  if (draft.swatches.length === 0) {
    return <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">還沒有色票。</p>;
  }
  return (
    <ul ref={listRef} className="flex max-h-64 flex-col overflow-y-auto rounded-md border p-1" aria-label="色票">
      {draft.swatches.map((swatch, index) => (
        <li
          key={swatch.id}
          data-swatch-row=""
          className={cn(
            "relative flex items-center gap-2 rounded-sm py-1 pr-1 pl-0.5 text-sm",
            swatch.id === selectedId ? "bg-muted" : "hover:bg-muted/60",
            drag?.from === index && "opacity-50",
          )}
          onClick={() => onSelect(swatch.id)}
        >
          {lineSlot === index && <span className="pointer-events-none absolute inset-x-1 -top-px h-0.5 rounded bg-primary" />}
          {lineSlot === index + 1 && index === draft.swatches.length - 1 && (
            <span className="pointer-events-none absolute inset-x-1 -bottom-px h-0.5 rounded bg-primary" />
          )}
          <button
            type="button"
            aria-label={`拖曳調整「${swatch.name}」的順序（或按 ↑ / ↓）`}
            className="cursor-grab rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
            onPointerDown={(event) => startDrag(event, index)}
            onKeyDown={(event) => moveWithKeys(event, index)}
          >
            <GripVertical className="size-4" />
          </button>
          <span className="size-5 shrink-0 rounded-sm border border-foreground/10" style={{ backgroundColor: swatch.color }} />
          <span
            className={cn("min-w-0 flex-1 truncate", errors.has(swatch.id) && "text-destructive")}
            onDoubleClick={() => onRename(swatch.id)}
          >
            {swatch.name.trim() || "（未命名）"}
          </span>
          <span className="font-mono text-xs text-muted-foreground">{swatch.color}</span>
          <span className="w-14 shrink-0 text-right text-xs text-muted-foreground">使用 {usage.get(swatch.id) ?? 0}</span>
          <IconButton
            label={`刪除「${swatch.name}」`}
            onClick={(event) => {
              event.stopPropagation();
              onRemove(swatch.id);
            }}
          >
            <Trash />
          </IconButton>
        </li>
      ))}
    </ul>
  );
}

interface SwatchEditorProps {
  readonly swatch: Swatch;
  readonly error: string | null;
  readonly nameRef: RefObject<HTMLInputElement | null>;
  readonly onChange: (change: Partial<Pick<Swatch, "name" | "color">>) => void;
}

// 選中的色票：名稱、hex（Enter / 失焦才讀）、從 Tailwind 色票選
function SwatchEditor({ swatch, error, nameRef, onChange }: SwatchEditorProps) {
  const [hex, setHex] = useState(swatch.color);
  const [hexError, setHexError] = useState<string | null>(null);
  const commitHex = (): void => {
    const color = parseSwatchHex(hex);
    if (color === null) {
      setHexError("請輸入 6 位（或 3 位）的 hex 顏色，例如 #be123c");
      return;
    }
    setHexError(null);
    setHex(color);
    if (color !== swatch.color) onChange({ color });
  };

  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 rounded-md border p-3">
      <Label htmlFor="swatch-name">名稱</Label>
      <Input
        id="swatch-name"
        ref={nameRef}
        value={swatch.name}
        aria-invalid={error !== null}
        onChange={(event) => onChange({ name: event.target.value })}
      />
      {error && <p className="col-start-2 text-xs text-destructive">{error}</p>}
      <Label htmlFor="swatch-hex">顏色</Label>
      <div className="flex items-center gap-2">
        <Input
          id="swatch-hex"
          className="w-32 font-mono"
          value={hex}
          aria-invalid={hexError !== null}
          onChange={(event) => setHex(event.target.value)}
          onBlur={commitHex}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitHex();
            }
          }}
        />
        <ColorPicker
          value={swatch.color}
          label="從 Tailwind 色票選"
          allowAlpha={false}
          onCommit={(color) => {
            setHex(color);
            setHexError(null);
            onChange({ color });
          }}
        />
        <span className="text-xs text-muted-foreground">不透明；透明度在使用的地方設定</span>
      </div>
      {hexError && <p className="col-start-2 text-xs text-destructive">{hexError}</p>}
    </div>
  );
}

interface ReplaceDialogProps {
  /** Swatch being deleted; null = closed. */
  readonly swatch: Swatch | null;
  readonly uses: number;
  readonly others: readonly Swatch[];
  readonly onConfirm: (replaceWith: string | null) => void;
  readonly onCancel: () => void;
}

// 刪除有人用的色票：換成另一個色票，或保留顏色、取消連結（預設，不改任何顏色）
function ReplaceDialog({ swatch, uses, others, onConfirm, onCancel }: ReplaceDialogProps) {
  const [choice, setChoice] = useState(NO_REPLACEMENT);
  return (
    <AlertDialog
      open={swatch !== null}
      onOpenChange={(open) => {
        if (!open) {
          setChoice(NO_REPLACEMENT);
          onCancel();
        }
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>刪除「{swatch?.name}」？</AlertDialogTitle>
          <AlertDialogDescription>這個色票用在 {uses} 處。刪除後，這些地方要：</AlertDialogDescription>
        </AlertDialogHeader>
        <Select value={choice} onValueChange={setChoice}>
          <SelectTrigger aria-label="刪除後的處理">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_REPLACEMENT}>不替換（保留顏色、取消連結）</SelectItem>
            {others.map((other) => (
              <SelectItem key={other.id} value={other.id}>
                <span className="size-3 rounded-sm border border-foreground/10" style={{ backgroundColor: other.color }} />
                換成「{other.name}」
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              onConfirm(choice === NO_REPLACEMENT ? null : choice);
              setChoice(NO_REPLACEMENT);
            }}
          >
            刪除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
