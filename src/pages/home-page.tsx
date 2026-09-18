import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppMenubar } from "@/components/app/app-menubar";
import { AppSiderButton, getSiderButtonLabel, type SiderButtonId } from "@/components/app/app-siderbutton";
import { EditorCanvas } from "@/components/editor/editor-canvas";
import { EditorPageBar } from "@/components/editor/editor-page-bar";
import { EditorTopBar } from "@/components/editor/editor-top-bar";
import { PANELS } from "@/components/editor/panels";
import { SelectionToolbar } from "@/components/editor/selection-toolbar";
import { SiderPanel } from "@/components/editor/sider-panel";
import { EditorProvider } from "@/lib/editor/editor-context";
import { useEditorShortcuts } from "@/lib/editor/use-editor-shortcuts";
import { createPlaceholderHandlers } from "@/lib/menu/commands";

function EditorLayout() {
  // 對照 UI-01 預設展開範本面板
  const [openPanel, setOpenPanel] = useState<SiderButtonId | null>("templates");
  useEditorShortcuts();

  // 檔案管理尚未實作：所有選單指令暫時只提示；下一階段在此換成實際 handler
  const menuHandlers = useMemo(() => createPlaceholderHandlers((title) => toast.info(`「${title}」尚未實作`)), []);

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
  return (
    <EditorProvider>
      <EditorLayout />
    </EditorProvider>
  );
}
