import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Copy, EllipsisVertical, FilePlus, Trash } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DockScrollArea } from "@/components/dock/dock-panel";
import { getBrowserStorage } from "@/lib/dock/dock-storage";
import {
  canResizeSections,
  loadPagesPanelLayout,
  savePagesPanelLayout,
  setMastersRatio,
  toggleSection,
  type PagesPanelSection,
} from "@/lib/dock/pages-panel-layout";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import type { EditorAction } from "@/lib/editor/editor-reducer";
import { createId } from "@/lib/editor/element-factory";
import { usedFontFamilies } from "@/lib/editor/fonts";
import { canSetParent, masterContent, pagesUsingMaster } from "@/lib/editor/master-pages";
import type { CanvasElement, EditorDocument, MasterPage, PageId, Sheet } from "@/lib/editor/types";
import { useFontsReady } from "@/lib/editor/use-fonts-ready";
import { resolveElementsVariables, variableValues } from "@/lib/editor/variables";
import { PAGE_NAME_MAX_LENGTH } from "@/lib/editor/validation";
import { cn } from "@/lib/utils";
import { IconButton } from "../icon-button";
import { InlineNameInput } from "../inline-name-input";
import { usePageDialogs } from "../page-dialogs";
import { SheetThumbnail } from "../sheet-thumbnail";
import { sectionFlex, useSectionResize } from "./use-section-resize";

/** Thumbnail width in CSS px. */
const THUMBNAIL_WIDTH = 96;
/** Radio value for 「無」 (no master); ids are UUIDs, so it never collides. */
const NONE = "";

type PendingDelete = { readonly kind: "page" | "master"; readonly id: PageId };

const NO_ELEMENTS: readonly CanvasElement[] = [];

/** Copies a page or master page with fresh ids (the reducer stays pure). */
function duplicateAction(kind: "page" | "master", sheet: Sheet): EditorAction {
  return {
    type: kind === "page" ? "page/duplicate" : "master/duplicate",
    id: sheet.id,
    newId: createId(),
    elementIds: sheet.elements.map(() => createId()),
  };
}

/**
 * Affinity-style Pages panel: master pages on top, pages below, each with a thumbnail.
 *
 * Click a thumbnail to show that page or to edit that master page; double-click the name to rename;
 * the `⋮` button (or a right click) opens the item's menu: apply a master page to a page, base a
 * master page on another one, duplicate, delete.
 *
 * Returns:
 *   Panel content.
 */
export function PagesPanel() {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const { openAddPages, openAddMaster } = usePageDialogs();
  const document = state.history.present;
  const { masters, pages } = document;
  const fontsReady = useFontsReady(useMemo(() => usedFontFamilies(document), [document]));
  // 每個主頁顯示的內容（含父主頁）；主頁沒變時陣列參考不變，縮圖就不會重畫
  const contentOf = useMemo(() => new Map(masters.map((master) => [master.id, masterContent(masters, master.id)])), [masters]);
  const inheritedOf = (masterId: PageId | null) => (masterId === null ? NO_ELEMENTS : (contentOf.get(masterId) ?? NO_ELEMENTS));
  // 頁面縮圖裡的變數（{頁碼} 等）換成各頁的值；文件沒變時不重算，縮圖的 memo 才有用
  const shownByPage = useMemo(
    () =>
      new Map(
        document.pages.map((page) => {
          const values = variableValues(document, page.id);
          const inherited = page.masterId === null ? NO_ELEMENTS : (contentOf.get(page.masterId) ?? NO_ELEMENTS);
          return [page.id, { inherited: resolveElementsVariables(inherited, values), elements: resolveElementsVariables(page.elements, values) }];
        }),
      ),
    [document, contentOf],
  );

  // 兩區的收合與高度是這台電腦的偏好（localStorage），不進復原歷史
  const [layout, setLayout] = useState(() => loadPagesPanelLayout(getBrowserStorage()));
  useEffect(() => savePagesPanelLayout(getBrowserStorage(), layout), [layout]);
  const [renamingId, setRenamingId] = useState<PageId | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const activePage = pages.find((page) => page.id === state.activePageId) ?? null;
  const activeMaster = masters.find((master) => master.id === state.activePageId) ?? null;


  const rename = (id: PageId, name: string) => {
    dispatch({ type: "page/rename", id, name });
    setRenamingId(null);
  };

  const nameOf = (id: PageId | null) => masters.find((master) => master.id === id)?.name ?? null;

  // 兩區都展開時依比例分高度；收起一區時另一區佔滿（收起的「頁面」標題列因此貼在底部）
  const mastersGrow = layout.pagesCollapsed ? 1 : layout.mastersRatio;
  const pagesGrow = layout.mastersCollapsed ? 1 : 1 - layout.mastersRatio;
  const rootRef = useRef<HTMLDivElement>(null);
  const resizable = canResizeSections(layout);
  const resize = useSectionResize(rootRef, layout.mastersRatio, resizable, (ratio) =>
    setLayout((current) => setMastersRatio(current, ratio)),
  );

  return (
    // 這個面板自己處理捲動（scroll: "self"）：兩區的標題列與內容是同一層的 flex 子元素，
    // 內容區以 flex-grow 分配標題列以外的高度，各自捲動
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      <Section
        id="masters"
        title="主頁"
        collapsed={layout.mastersCollapsed}
        grow={mastersGrow}
        onToggle={() => setLayout((current) => toggleSection(current, "masters"))}
        actions={
          <>
            <IconButton label="新增主頁" size="icon-xs" onClick={openAddMaster}>
              <FilePlus />
            </IconButton>
            <IconButton
              label="複製主頁"
              size="icon-xs"
              disabled={!activeMaster}
              onClick={() => activeMaster && dispatch(duplicateAction("master", activeMaster))}
            >
              <Copy />
            </IconButton>
            <IconButton
              label="刪除主頁"
              size="icon-xs"
              disabled={!activeMaster}
              onClick={() => activeMaster && setPendingDelete({ kind: "master", id: activeMaster.id })}
            >
              <Trash />
            </IconButton>
          </>
        }
      >
        {masters.length === 0 ? (
          <p className="px-1 text-sm text-muted-foreground">
            還沒有主頁。主頁放每一頁都要有的內容（刊頭、頁尾、色塊），新增頁面時可以選擇套用。
          </p>
        ) : (
          <TileGrid>
            {masters.map((master) => (
              <SheetTile
                key={master.id}
                sheet={master}
                inherited={inheritedOf(master.parentId)}
                elements={master.elements}
                fontsReady={fontsReady}
                active={master.id === state.activePageId}
                caption={nameOf(master.parentId) ? `以 ${nameOf(master.parentId)} 為基礎` : null}
                renaming={renamingId === master.id}
                onSelect={() => dispatch({ type: "page/select", id: master.id })}
                onStartRename={() => setRenamingId(master.id)}
                onRename={(name) => rename(master.id, name)}
                onCancelRename={() => setRenamingId(null)}
                menu={
                  <MasterMenuItems
                    master={master}
                    masters={masters}
                    onRename={() => setRenamingId(master.id)}
                    onDuplicate={() => dispatch(duplicateAction("master", master))}
                    onDelete={() => setPendingDelete({ kind: "master", id: master.id })}
                    onSetParent={(parentId) => dispatch({ type: "master/setParent", id: master.id, parentId })}
                  />
                }
              />
            ))}
          </TileGrid>
        )}
      </Section>

      <Section
        id="pages"
        title="頁面"
        collapsed={layout.pagesCollapsed}
        grow={pagesGrow}
        onToggle={() => setLayout((current) => toggleSection(current, "pages"))}
        resize={resizable ? { ...resize, ratio: layout.mastersRatio } : undefined}
        actions={
          <>
            <IconButton label="新增頁面" size="icon-xs" onClick={() => openAddPages("current")}>
              <FilePlus />
            </IconButton>
            <IconButton
              label="複製頁面"
              size="icon-xs"
              disabled={!activePage}
              onClick={() => activePage && dispatch(duplicateAction("page", activePage))}
            >
              <Copy />
            </IconButton>
            <IconButton
              label="刪除頁面"
              size="icon-xs"
              disabled={!activePage || pages.length <= 1}
              onClick={() => activePage && setPendingDelete({ kind: "page", id: activePage.id })}
            >
              <Trash />
            </IconButton>
          </>
        }
      >
        <TileGrid>
          {pages.map((page, index) => (
            <SheetTile
              key={page.id}
              sheet={page}
              inherited={shownByPage.get(page.id)?.inherited ?? NO_ELEMENTS}
              elements={shownByPage.get(page.id)?.elements ?? page.elements}
              fontsReady={fontsReady}
              active={page.id === state.activePageId}
              number={index + 1}
              badge={nameOf(page.masterId)}
              renaming={renamingId === page.id}
              onSelect={() => dispatch({ type: "page/select", id: page.id })}
              onStartRename={() => setRenamingId(page.id)}
              onRename={(name) => rename(page.id, name)}
              onCancelRename={() => setRenamingId(null)}
              menu={
                <>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>套用主頁</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuRadioGroup
                        value={page.masterId ?? NONE}
                        onValueChange={(value) =>
                          dispatch({ type: "page/setMaster", ids: [page.id], masterId: value === NONE ? null : value })
                        }
                      >
                        <DropdownMenuRadioItem value={NONE}>無</DropdownMenuRadioItem>
                        {masters.map((master) => (
                          <DropdownMenuRadioItem key={master.id} value={master.id}>
                            {master.name}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setRenamingId(page.id)}>重新命名</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => dispatch(duplicateAction("page", page))}>複製頁面</DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={pages.length <= 1}
                    onSelect={() => setPendingDelete({ kind: "page", id: page.id })}
                  >
                    刪除頁面
                  </DropdownMenuItem>
                </>
              }
            />
          ))}
        </TileGrid>
      </Section>

      <DeleteDialog pending={pendingDelete} document={document} onClose={() => setPendingDelete(null)} />
    </div>
  );
}

interface SectionProps {
  readonly id: PagesPanelSection;
  readonly title: string;
  readonly collapsed: boolean;
  /** Share of the free height for the body (flex-grow); ignored while collapsed. */
  readonly grow: number;
  readonly onToggle: () => void;
  readonly actions: ReactNode;
  readonly children: ReactNode;
  /** Given on the 頁面 section while both are open: its title bar is the boundary to drag. */
  readonly resize?: ReturnType<typeof useSectionResize> & { readonly ratio: number };
}

/**
 * One section of the Pages panel: a title bar with its own collapse button and actions, and a body
 * that scrolls on its own. Returns siblings (no wrapper) so the panel's flex column shares the
 * height between the two bodies.
 */
function Section({ id, title, collapsed, grow, onToggle, actions, children, resize }: SectionProps) {
  const bodyId = useId();
  return (
    <>
      <header
        data-pages-section={id}
        title={resize ? "上下拖曳調整主頁與頁面的高度，雙擊還原" : undefined}
        onPointerDown={resize?.onPointerDown}
        onDoubleClick={resize?.onDoubleClick}
        className={cn(
          "group/resize relative flex h-9 shrink-0 touch-none items-center gap-1 border-b bg-muted/30 pr-1 first:border-t-0 [&:not(:first-child)]:border-t",
          resize && "cursor-row-resize",
        )}
      >
        {resize && (
          // 鍵盤操作的分隔線（↑ / ↓），跨在兩區交界；滑鼠拖曳整個標題列都可以（事件冒泡到 header）
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="調整主頁與頁面的高度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(resize.ratio * 100)}
            tabIndex={0}
            onKeyDown={resize.onKeyDown}
            className="group/sep absolute inset-x-0 -top-1 z-10 flex h-2 items-center outline-none"
          >
            <div className="h-0.5 w-full transition-colors group-hover/resize:bg-primary/40 group-focus-visible/sep:bg-primary group-active/resize:bg-primary" />
          </div>
        )}
        {/* 只有箭頭是收合鈕：標題文字不是按鈕，按住「頁面」標題就能拖曳調整高度 */}
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          aria-label={collapsed ? `展開${title}` : `收合${title}`}
          onClick={onToggle}
          className="ml-1 flex size-6 shrink-0 cursor-default items-center justify-center rounded outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", collapsed && "-rotate-90")} />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium select-none">{title}</span>
        <div className="flex items-center gap-0.5">{actions}</div>
      </header>
      {!collapsed && (
        <div id={bodyId} role="region" aria-label={title} className="flex min-h-0 flex-col" style={{ flex: sectionFlex(grow) }}>
          <DockScrollArea>
            <div className="p-3">{children}</div>
          </DockScrollArea>
        </div>
      )}
    </>
  );
}

function TileGrid({ children }: { readonly children: ReactNode }) {
  return <ul className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-x-2 gap-y-3">{children}</ul>;
}

interface SheetTileProps {
  readonly sheet: Sheet;
  readonly inherited: readonly CanvasElement[];
  readonly elements: readonly CanvasElement[];
  readonly fontsReady: boolean;
  readonly active: boolean;
  /** Page number (pages only). */
  readonly number?: number;
  /** Name of the master page a page uses, shown on the thumbnail. */
  readonly badge?: string | null;
  /** Second line under the name (master pages: what they are based on). */
  readonly caption?: string | null;
  readonly renaming: boolean;
  readonly onSelect: () => void;
  readonly onStartRename: () => void;
  readonly onRename: (name: string) => void;
  readonly onCancelRename: () => void;
  /** Items of the `⋮` / right-click menu. */
  readonly menu: ReactNode;
}

function SheetTile(props: SheetTileProps) {
  const { sheet, active, number, badge, caption, renaming, menu } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <li
      data-sheet-id={sheet.id}
      className="group relative flex flex-col items-center gap-1"
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen(true);
      }}
    >
      {/* 縮圖與 ⋮ 放在同一個 relative 容器：⋮ 貼著縮圖的右上角，不是格子的右上角 */}
      <div className="relative">
        <button
          type="button"
          aria-current={active ? "page" : undefined}
          aria-label={number === undefined ? `編輯主頁 ${sheet.name}` : `第 ${number} 頁 ${sheet.name}`}
          onClick={props.onSelect}
          className={cn(
            "relative rounded-sm outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring/60",
            active ? "ring-2 ring-primary" : "ring-1 ring-border hover:ring-muted-foreground/50",
          )}
        >
          {props.fontsReady ? (
            <SheetThumbnail sheet={sheet} inherited={props.inherited} elements={props.elements} width={THUMBNAIL_WIDTH} className="rounded-sm" />
          ) : (
            <div className="rounded-sm bg-muted" style={{ width: THUMBNAIL_WIDTH, height: (THUMBNAIL_WIDTH * sheet.height) / sheet.width }} />
          )}
          {badge && (
            <span className="absolute right-1 bottom-1 max-w-[80%] truncate rounded bg-amber-100/90 px-1 text-[10px] leading-4 text-amber-900">
              {badge}
            </span>
          )}
        </button>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`${sheet.name} 的選單`}
              className={cn(
                "absolute top-1 right-1 rounded bg-background/90 p-0.5 shadow-sm hover:bg-muted",
                !active && !menuOpen && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
              )}
            >
              <EllipsisVertical className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-40">
            {menu}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {renaming ? (
        <InlineNameInput
          initialValue={sheet.name}
          maxLength={PAGE_NAME_MAX_LENGTH}
          label={number === undefined ? "主頁名稱" : "頁面名稱"}
          className="h-6 w-full text-xs"
          onCommit={props.onRename}
          onCancel={props.onCancelRename}
        />
      ) : (
        <span
          title="雙擊可重新命名"
          onDoubleClick={props.onStartRename}
          className={cn("max-w-full truncate text-xs", active ? "font-medium" : "text-muted-foreground")}
        >
          {number !== undefined && <span className="mr-1 tabular-nums">{number}</span>}
          {sheet.name}
        </span>
      )}
      {caption && <span className="-mt-1 max-w-full truncate text-[11px] text-muted-foreground">{caption}</span>}
    </li>
  );
}

interface MasterMenuItemsProps {
  readonly master: MasterPage;
  readonly masters: readonly MasterPage[];
  readonly onRename: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
  readonly onSetParent: (parentId: PageId | null) => void;
}

function MasterMenuItems({ master, masters, onRename, onDuplicate, onDelete, onSetParent }: MasterMenuItemsProps) {
  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>以…為基礎</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup
            value={master.parentId ?? NONE}
            onValueChange={(value) => onSetParent(value === NONE ? null : value)}
          >
            <DropdownMenuRadioItem value={NONE}>無（最上層）</DropdownMenuRadioItem>
            {/* 自己、自己的子孫（會形成循環）與太深的組合不能選 */}
            {masters
              .filter((candidate) => candidate.id !== master.id)
              .map((candidate) => (
                <DropdownMenuRadioItem
                  key={candidate.id}
                  value={candidate.id}
                  disabled={candidate.id !== master.parentId && !canSetParent(masters, master.id, candidate.id)}
                >
                  {candidate.name}
                </DropdownMenuRadioItem>
              ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onRename}>重新命名</DropdownMenuItem>
      <DropdownMenuItem onSelect={onDuplicate}>複製主頁</DropdownMenuItem>
      <DropdownMenuItem variant="destructive" onSelect={onDelete}>
        刪除主頁
      </DropdownMenuItem>
    </>
  );
}

function DeleteDialog({
  pending,
  document,
  onClose,
}: {
  readonly pending: PendingDelete | null;
  readonly document: EditorDocument;
  readonly onClose: () => void;
}) {
  const dispatch = useEditorDispatch();
  const sheet =
    pending === null
      ? undefined
      : pending.kind === "page"
        ? document.pages.find((page) => page.id === pending.id)
        : document.masters.find((master) => master.id === pending.id);
  let description = "";
  if (pending && sheet) {
    if (pending.kind === "page") {
      description = `「${sheet.name}」與頁面上的所有物件都會被刪除，可用復原（Ctrl+Z）還原。`;
    } else {
      const parent = document.masters.find((master) => master.id === (sheet as MasterPage).parentId);
      const users = document.pages.filter((page) => page.masterId === sheet.id).length;
      const children = document.masters.filter((master) => master.parentId === sheet.id).length;
      const moved = users + children > 0 ? `直接套用它的 ${users} 頁${children > 0 ? `與 ${children} 個子主頁` : ""}會改成${parent ? `套用「${parent.name}」` : "不套用主頁"}。` : "";
      const shown = pagesUsingMaster(document, sheet.id).length;
      description = `「${sheet.name}」與上面的物件都會被刪除${shown > 0 ? `（目前有 ${shown} 頁顯示它的內容）` : ""}。${moved}可用復原（Ctrl+Z）還原。`;
    }
  }

  return (
    <AlertDialog open={pending !== null && sheet !== undefined} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{pending?.kind === "master" ? "刪除主頁？" : "刪除頁面？"}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (pending) dispatch({ type: pending.kind === "page" ? "page/delete" : "master/delete", id: pending.id });
              onClose();
            }}
          >
            刪除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
