import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppMenubar } from "@/components/app/app-menubar";
import { useUnsavedChangesDialog } from "@/components/app/unsaved-changes-dialog";
import { AppSiderButton, getSiderButtonLabel, type SiderButtonId } from "@/components/app/app-siderbutton";
import { EditorCanvas } from "@/components/editor/editor-canvas";
import { EditorPageBar } from "@/components/editor/editor-page-bar";
import { EditorTopBar } from "@/components/editor/editor-top-bar";
import { PANELS } from "@/components/editor/panels";
import { SelectionToolbar } from "@/components/editor/selection-toolbar";
import { SiderPanel } from "@/components/editor/sider-panel";
import { useAddImage } from "@/components/editor/panels/use-add-image";
import { EditorProvider } from "@/lib/editor/editor-context";
import { createInitialState } from "@/lib/editor/editor-reducer";
import { createBlankDocument, createSampleDocument } from "@/lib/editor/element-factory";
import { pickImageFiles } from "@/lib/editor/image";
import { useEditorShortcuts } from "@/lib/editor/use-editor-shortcuts";
import { createPlaceholderHandlers, type CommandHandlers } from "@/lib/menu/commands";
import { isDesktop } from "@/lib/project/project-api";
import { ProjectProvider } from "@/lib/project/project-context";
import { useCloseGuard } from "@/lib/project/use-close-guard";
import { useImageImport } from "@/lib/project/use-image-import";
import { useProjectCommands } from "@/lib/project/use-project-commands";


function EditorLayout() {
  // 對照 UI-01 預設展開範本面板
  const [openPanel, setOpenPanel] = useState<SiderButtonId | null>("templates");
  useEditorShortcuts();

  const { dialog: unsavedDialog, confirm: confirmUnsaved } = useUnsavedChangesDialog();
  const project = useProjectCommands(confirmUnsaved);
  useCloseGuard(project.confirmClose);
  const { importFiles } = useImageImport();
  const addImage = useAddImage();

  // 匯出、頁面設定、偏好設定、匯入其他專案的頁面等仍是佔位（toast「尚未實作」）
  const menuHandlers = useMemo<CommandHandlers>(
    () => ({
      ...createPlaceholderHandlers((title) => toast.info(`「${title}」尚未實作`)),
      "file.new": () => void project.newProject(),
      "file.open": () => void project.openProject(),
      "file.save": () => void project.save(),
      "file.saveAs": () => void project.saveAs(),
      "file.importImage": () =>
        void (async () => {
          const assets = await importFiles(await pickImageFiles());
          for (const asset of assets) addImage(asset.src, asset);
        })(),
    }),
    [project, importFiles, addImage],
  );

  const Panel = openPanel ? PANELS[openPanel] : null;

  return (
    // 選單列橫跨全寬；UI-01 版面：按鈕列貫穿系統控制項與工作區兩列、頁籤列橫跨全寬
    <div className="grid h-full grid-cols-[84px_minmax(0,1fr)] grid-rows-[auto_auto_minmax(0,1fr)_auto] bg-background text-foreground">
      <AppMenubar className="col-span-2" handlers={menuHandlers} />
      <AppSiderButton
        className="row-span-2"
        activeId={openPanel}
        onToggle={(id) => setOpenPanel((current) => (current === id ? null : id))}
      />
      <EditorTopBar />
      <div className="flex min-h-0 min-w-0">
        {openPanel && Panel && (
          <SiderPanel title={getSiderButtonLabel(openPanel)} onCollapse={() => setOpenPanel(null)}>
            <Panel />
          </SiderPanel>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <SelectionToolbar />
          <EditorCanvas />
        </div>
      </div>
      <EditorPageBar className="col-span-2" />
      {unsavedDialog}
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
  return (
    <EditorProvider initialState={initialState}>
      <ProjectProvider>
        <EditorLayout />
      </ProjectProvider>
    </EditorProvider>
  );
}
