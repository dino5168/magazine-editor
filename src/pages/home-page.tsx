import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppMenubar } from "@/components/app/app-menubar";
import { DockArea } from "@/components/dock/dock-area";
import { DockDragGhost } from "@/components/dock/dock-drag-ghost";
import { DOCK_CENTER_PROPS } from "@/components/dock/dock-splitter";
import { useDockDrag } from "@/components/dock/use-dock-drag";
import { SETTINGS_DIALOGS } from "@/components/app/settings";
import { useNewDocumentDialog } from "@/components/app/new-document-dialog";
import { useRecoveryDialog } from "@/components/app/recovery-dialog";
import { useUnsavedChangesDialog } from "@/components/app/unsaved-changes-dialog";
import { BottomToolbar } from "@/components/editor/bottom-toolbar";
import { EditorCanvas } from "@/components/editor/editor-canvas";
import { MasterEditBanner } from "@/components/editor/master-edit-banner";
import { PageDialogsProvider } from "@/components/editor/page-dialogs";
import { EditorPageBar } from "@/components/editor/editor-page-bar";
import { EditorTopBar } from "@/components/editor/editor-top-bar";
import { useAddImage } from "@/components/editor/panels/use-add-image";
import {
  CANVAS_MIN_WIDTH,
  DEFAULT_DOCK_LAYOUT,
  closePanel,
  dropPanel,
  isPanelVisible,
  setDockWidth,
  toggleCollapsed,
  togglePanel,
  type DockLayout,
  type DockSide,
  type DropTarget,
} from "@/lib/dock/dock-layout";
import { getBrowserStorage, loadDockLayout, saveDockLayout } from "@/lib/dock/dock-storage";
import { PANEL_IDS, type PanelId } from "@/lib/dock/panels";
import { EditorProvider } from "@/lib/editor/editor-context";
import { createInitialState } from "@/lib/editor/editor-reducer";
import { createBlankDocument, createSampleDocument } from "@/lib/editor/element-factory";
import { pickImageFiles } from "@/lib/editor/image";
import { useEditorShortcuts } from "@/lib/editor/use-editor-shortcuts";
import {
  createPlaceholderHandlers,
  panelCommandId,
  settingsCommandId,
  viewCommandId,
  type CommandHandlers,
  type CommandId,
} from "@/lib/menu/commands";
import { PreferencesProvider, usePreferences, useSetPreferences } from "@/lib/preferences/preferences-context";
import { SETTINGS_PAGES, type SettingsPageId } from "@/lib/preferences/settings-pages";
import { VIEW_TOGGLES } from "@/lib/preferences/view-toggles";
import { isDesktop } from "@/lib/project/project-api";
import { ProjectProvider } from "@/lib/project/project-context";
import { useCloseGuard } from "@/lib/project/use-close-guard";
import { LibraryDialog } from "@/components/library/library-dialog";
import { LibraryProvider } from "@/lib/library/library-context";
import { useLibraryImport } from "@/lib/library/use-library-import";
import { useProjectCommands } from "@/lib/project/use-project-commands";
import { cn } from "@/lib/utils";


function EditorLayout() {
  // 工具面板的停靠版面（App 偏好，不進復原歷史，也不存進專案檔）；記在 localStorage，重開 App 後還原
  const [dockLayout, setDockLayout] = useState<DockLayout>(() => loadDockLayout(getBrowserStorage()));
  // 版面只在放開拖曳、切換面板等確定時才改變，每次變化直接寫入即可
  useEffect(() => saveDockLayout(getBrowserStorage(), dockLayout), [dockLayout]);
  useEditorShortcuts();

  const { dialog: unsavedDialog, confirm: confirmUnsaved } = useUnsavedChangesDialog();
  const { dialog: newDocumentDialog, choose: chooseNewSetup } = useNewDocumentDialog();
  const project = useProjectCommands(confirmUnsaved, chooseNewSetup);
  useCloseGuard(project.confirmClose);
  const { importFiles } = useLibraryImport();
  const addImage = useAddImage();

  const updateDock = useCallback(
    (update: (layout: DockLayout, id: PanelId) => DockLayout) => (id: PanelId) =>
      setDockLayout((layout) => update(layout, id)),
    [],
  );
  // 「檔案 → 匯入 → 圖片」與底部工具列的圖片按鈕共用
  const importImage = useCallback(
    () =>
      void (async () => {
        // 匯入素材庫的未分類，再放到頁面上
        const items = await importFiles(await pickImageFiles(), null, ["image"]);
        for (const item of items) if (item.kind === "image") addImage(item.src, item);
      })(),
    [importFiles, addImage],
  );
  const preferences = usePreferences();
  const { showRulers } = preferences;
  const setPreferences = useSetPreferences();
  const isChecked = useCallback(
    (command: CommandId) =>
      VIEW_TOGGLES.some((toggle) => viewCommandId(toggle.id) === command && toggle.read(preferences)) ||
      PANEL_IDS.some((id) => panelCommandId(id) === command && isPanelVisible(dockLayout, id)),
    [dockLayout, preferences],
  );

  // 設定 → 文件 / 偏好設定：同時最多開一個設定對話框
  const [openSettings, setOpenSettings] = useState<SettingsPageId | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  // 匯出 PNG / JPEG / EPUB、匯入其他專案的頁面、外觀等仍是佔位（toast「尚未實作」）
  const menuHandlers = useMemo<CommandHandlers>(
    () => ({
      ...createPlaceholderHandlers((title) => toast.info(`「${title}」尚未實作`)),
      "file.new": () => void project.newProject(),
      "file.open": () => void project.openProject(),
      "file.save": () => void project.save(),
      "file.saveAs": () => void project.saveAs(),
      "file.exportPdf": () => void project.exportPdf(),
      "file.importImage": importImage,
      "file.library": () => setLibraryOpen(true),
      ...Object.fromEntries(VIEW_TOGGLES.map((toggle) => [viewCommandId(toggle.id), () => setPreferences(toggle.toggle)])),
      ...Object.fromEntries(SETTINGS_PAGES.map(({ id }) => [settingsCommandId(id), () => setOpenSettings(id)])),
      ...Object.fromEntries(PANEL_IDS.map((id) => [panelCommandId(id), () => updateDock(togglePanel)(id)])),
      "panel.resetLayout": () => setDockLayout(DEFAULT_DOCK_LAYOUT),
    }),
    [project, importImage, updateDock, setPreferences],
  );

  const onDropPanel = useCallback(
    (id: PanelId, target: DropTarget) => setDockLayout((layout) => dropPanel(layout, id, target)),
    [],
  );
  const { drag, startDrag, ghostRef } = useDockDrag(onDropPanel);
  // 放下後位置不變（例如拖到自己的上下緣）時不顯示提示線
  const dropTarget = drag?.target && dropPanel(dockLayout, drag.id, drag.target) !== dockLayout ? drag.target : null;
  const dropSlotOf = (side: DockSide) =>
    dropTarget?.side === side ? dropTarget.slot : null;

  // 參考固定，停靠區拖曳寬度時面板內容才不會重新 render
  const dockProps = useMemo(
    () => ({
      onToggleCollapsed: updateDock(toggleCollapsed),
      onClose: updateDock(closePanel),
      onDragStart: startDrag,
      draggingId: drag?.id ?? null,
    }),
    [updateDock, startDrag, drag?.id],
  );
  const resizeLeft = useCallback((px: number) => setDockLayout((l) => setDockWidth(l, "left", px)), []);
  const resizeRight = useCallback((px: number) => setDockLayout((l) => setDockWidth(l, "right", px)), []);

  return (
    // 選單列與頁籤列橫跨全寬；中間是三欄：左停靠區｜系統控制列 + 畫布｜右停靠區
    // grid-cols 必須是 minmax(0,1fr)：隱含的 auto 欄會被頁籤列的內容撐寬（頁面多時整個畫面變寬、頁籤無法捲動）
    <div className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] bg-background text-foreground">
      <AppMenubar handlers={menuHandlers} isChecked={isChecked} />
      {/* relative：空白側的放置區疊在這一列的左右邊緣 */}
      <div className="relative flex min-h-0 min-w-0">
        <DockArea
          side="left"
          panels={dockLayout.left}
          width={dockLayout.width.left}
          onResize={resizeLeft}
          dropSlot={dropSlotOf("left")}
          {...dockProps}
        />
        <div {...DOCK_CENTER_PROPS} style={{ minWidth: CANVAS_MIN_WIDTH }} className="flex flex-1 flex-col overflow-hidden">
          <EditorTopBar onExportPdf={() => void project.exportPdf()} onOpenGridSettings={() => setOpenSettings("grid")} />
          {/* 底部工具列疊在畫布上，不佔版面（畫布尺寸不受影響）；bottom 留出水平捲軸的高度 */}
          <div className="relative flex min-h-0 flex-1 flex-col">
            <EditorCanvas />
            {/* 開尺規時往下移，不蓋住上方尺規（top-8 = 尺規 20 px + 12 px） */}
            <MasterEditBanner className={cn("absolute inset-x-0 z-10", showRulers ? "top-8" : "top-3")} />
            <BottomToolbar onImportImage={importImage} className="absolute inset-x-0 bottom-6 z-10" />
          </div>
        </div>
        <DockArea
          side="right"
          panels={dockLayout.right}
          width={dockLayout.width.right}
          onResize={resizeRight}
          dropSlot={dropSlotOf("right")}
          {...dockProps}
        />
      </div>
      <EditorPageBar />
      <DockDragGhost ref={ghostRef} id={drag?.id ?? null} />
      {unsavedDialog}
      {newDocumentDialog}
      <LibraryDialog open={libraryOpen} onOpenChange={setLibraryOpen} />
      {SETTINGS_PAGES.map(({ id }) => {
        const SettingsPageDialog = SETTINGS_DIALOGS[id];
        return (
          <SettingsPageDialog key={id} open={openSettings === id} onOpenChange={(open) => setOpenSettings(open ? id : null)} />
        );
      })}
    </div>
  );
}

/**
 * Home page: the magazine page editor.
 *
 * Returns:
 *   Editor with its state provider.
 */
export function HomePage() {
  // 桌面版啟動時由 ProjectProvider 載入上次的專案（或建立新專案）；瀏覽器模式沒有檔案存取，顯示示範內容
  const initialState = useMemo(
    () => createInitialState(isDesktop ? createBlankDocument() : createSampleDocument()),
    [],
  );
  const { dialog: recoveryDialog, confirm: confirmRecovery } = useRecoveryDialog();
  return (
    <EditorProvider initialState={initialState}>
      {/* 素材庫在 ProjectProvider 外：開啟專案時要一起載入 */}
      <LibraryProvider>
        <ProjectProvider confirmRecovery={confirmRecovery}>
          <PreferencesProvider>
            <PageDialogsProvider>
              <EditorLayout />
            </PageDialogsProvider>
          </PreferencesProvider>
          {recoveryDialog}
        </ProjectProvider>
      </LibraryProvider>
    </EditorProvider>
  );
}
