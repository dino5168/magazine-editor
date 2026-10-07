import { createContext, useContext, useId, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsDialog, SettingsDialogFooter } from "@/components/app/settings/settings-dialog";
import {
  ADD_PAGES_MAX,
  addMasterError,
  addPagesDefaults,
  addPagesError,
  addPagesIndex,
  buildAddedPages,
  type AddPagesAnchor,
  type AddPagesForm,
  type InsertSide,
} from "@/lib/editor/add-pages";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { createMasterPage } from "@/lib/editor/element-factory";
import { canSetParent, nextMasterName } from "@/lib/editor/master-pages";
import type { PageId } from "@/lib/editor/types";
import { PAGE_NAME_MAX_LENGTH } from "@/lib/editor/validation";
import { cn } from "@/lib/utils";

interface PageDialogs {
  /** Opens 「新增頁面」: after the last page (「+」) or after the current page (「插入頁面」). */
  readonly openAddPages: (anchor: AddPagesAnchor) => void;
  readonly openAddMaster: () => void;
}

const PageDialogsContext = createContext<PageDialogs | null>(null);

/** Radio / select value for 「無」 (no master page); ids are UUIDs, so it never collides. */
const NONE = "none";

type OpenDialog = { readonly kind: "pages"; readonly anchor: AddPagesAnchor } | { readonly kind: "master" } | null;

/**
 * Hosts the 「新增頁面」 and 「新增主頁」 dialogs so the page tabs, the page menu and the Pages panel
 * open the same dialogs. Must be inside `EditorProvider`.
 *
 * Args:
 *   props.children: Editor UI.
 *
 * Returns:
 *   Provider with the dialogs.
 */
export function PageDialogsProvider({ children }: { readonly children: ReactNode }) {
  const [open, setOpen] = useState<OpenDialog>(null);
  const value = useMemo<PageDialogs>(
    () => ({ openAddPages: (anchor) => setOpen({ kind: "pages", anchor }), openAddMaster: () => setOpen({ kind: "master" }) }),
    [],
  );
  const close = (isOpen: boolean) => !isOpen && setOpen(null);
  return (
    <PageDialogsContext.Provider value={value}>
      {children}
      <SettingsDialog open={open?.kind === "pages"} onOpenChange={close}>
        {open?.kind === "pages" && <AddPagesFormView anchor={open.anchor} onDone={() => setOpen(null)} />}
      </SettingsDialog>
      <SettingsDialog open={open?.kind === "master"} onOpenChange={close}>
        <AddMasterFormView onDone={() => setOpen(null)} />
      </SettingsDialog>
    </PageDialogsContext.Provider>
  );
}

/**
 * Opens the page dialogs.
 *
 * Returns:
 *   `openAddPages` / `openAddMaster`.
 *
 * Raises:
 *   Error: When used outside `PageDialogsProvider`.
 */
export function usePageDialogs(): PageDialogs {
  const dialogs = useContext(PageDialogsContext);
  if (dialogs === null) throw new Error("usePageDialogs must be used within PageDialogsProvider");
  return dialogs;
}

function Field({ label, htmlFor, children }: { readonly label: string; readonly htmlFor?: string; readonly children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] items-center gap-3">
      <label htmlFor={htmlFor} className="text-right text-sm text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function MasterSelect({
  value,
  onChange,
  label,
  noneLabel,
  isDisabled,
}: {
  readonly value: PageId | null;
  readonly onChange: (id: PageId | null) => void;
  readonly label: string;
  readonly noneLabel: string;
  readonly isDisabled?: (id: PageId) => boolean;
}) {
  const { masters } = useEditorState().history.present;
  return (
    <Select value={value ?? NONE} onValueChange={(next) => onChange(next === NONE ? null : next)}>
      <SelectTrigger size="sm" className="h-8 w-full" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{noneLabel}</SelectItem>
        {masters.map((master) => (
          <SelectItem key={master.id} value={master.id} disabled={isDisabled?.(master.id)}>
            {master.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// 數字欄位的草稿是字串：輸入到一半（空白）也要能顯示，確定時才檢查
function parseCount(text: string): number {
  return /^\s*\d+\s*$/.test(text) ? Number(text) : Number.NaN;
}

const SIDES: readonly { readonly value: InsertSide; readonly label: string }[] = [
  { value: "before", label: "之前" },
  { value: "after", label: "之後" },
];

function AddPagesFormView({ anchor, onDone }: { readonly anchor: AddPagesAnchor; readonly onDone: () => void }) {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const document = state.history.present;
  const [initial] = useState(() => addPagesDefaults(document, state.activePageId, anchor));
  const [masterId, setMasterId] = useState(initial.masterId);
  const [side, setSide] = useState(initial.side);
  const [countText, setCountText] = useState(String(initial.count));
  const [pageText, setPageText] = useState(String(initial.pageNumber));
  const countId = useId();
  const pageId = useId();

  const form: AddPagesForm = { masterId, side, count: parseCount(countText), pageNumber: parseCount(pageText) };
  const error = addPagesError(form, document);

  const apply = (): void => {
    if (error) return;
    dispatch({ type: "page/addMany", pages: buildAddedPages(document, form), index: addPagesIndex(form) });
    onDone();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>新增頁面</DialogTitle>
        <DialogDescription>新頁面會套用選擇的主頁；之後也可以在「頁面」面板改。</DialogDescription>
      </DialogHeader>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <Field label="主頁">
          <MasterSelect value={masterId} onChange={setMasterId} label="主頁" noneLabel="無" />
        </Field>
        <Field label="頁數" htmlFor={countId}>
          <Input
            id={countId}
            inputMode="numeric"
            value={countText}
            onChange={(event) => setCountText(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            className="h-8 w-24 tabular-nums"
            aria-describedby={`${countId}-hint`}
          />
        </Field>
        <Field label="插入">
          <div className="flex gap-1" role="radiogroup" aria-label="插入位置">
            {SIDES.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant="outline"
                size="sm"
                role="radio"
                aria-checked={side === option.value}
                className={cn("h-8 flex-1", side === option.value && "bg-muted font-medium")}
                onClick={() => setSide(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </Field>
        <Field label="頁" htmlFor={pageId}>
          <div className="flex items-center gap-2">
            <Input
              id={pageId}
              inputMode="numeric"
              value={pageText}
              onChange={(event) => setPageText(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              className="h-8 w-24 tabular-nums"
            />
            <span className="text-sm text-muted-foreground">/ {document.pages.length}</span>
          </div>
        </Field>
        <p id={`${countId}-hint`} className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")} role={error ? "alert" : undefined}>
          {error ?? `一次最多 ${ADD_PAGES_MAX} 頁；新增後切到第一個新頁面，一次復原就全部撤銷。`}
        </p>
        {/* Enter 送出表單 */}
        <button type="submit" hidden />
      </form>
      <SettingsDialogFooter onApply={apply} applyDisabled={error !== null} />
    </>
  );
}

function AddMasterFormView({ onDone }: { readonly onDone: () => void }) {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const document = state.history.present;
  const { masters, pages } = document;
  const [name, setName] = useState(() => nextMasterName(masters));
  const editing = masters.find((master) => master.id === state.activePageId);
  // 正在編輯某個主頁時，預設以它為基礎（建立子主頁最常見的情況）
  const [parentId, setParentId] = useState<PageId | null>(editing?.id ?? null);
  const nameId = useId();
  const error = addMasterError(name, parentId, masters);

  const apply = (): void => {
    if (error) return;
    // 尺寸和目前的頁面一樣（頁面設定一次改所有頁面與主頁）
    const size = pages.find((page) => page.id === state.activePageId) ?? editing ?? pages[0];
    dispatch({ type: "master/add", master: createMasterPage(name.trim(), size, "#ffffff", parentId) });
    onDone();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>新增主頁</DialogTitle>
        <DialogDescription>主頁放每一頁都要有的內容。以另一個主頁為基礎時，會先畫那個主頁的內容。</DialogDescription>
      </DialogHeader>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <Field label="名稱" htmlFor={nameId}>
          <Input
            id={nameId}
            value={name}
            maxLength={PAGE_NAME_MAX_LENGTH}
            onChange={(event) => setName(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            className="h-8"
          />
        </Field>
        <Field label="以…為基礎">
          <MasterSelect
            value={parentId}
            onChange={setParentId}
            label="以…為基礎"
            noneLabel="無（最上層）"
            isDisabled={(id) => !canSetParent(masters, "", id)}
          />
        </Field>
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        <button type="submit" hidden />
      </form>
      <SettingsDialogFooter onApply={apply} applyDisabled={error !== null} />
    </>
  );
}
