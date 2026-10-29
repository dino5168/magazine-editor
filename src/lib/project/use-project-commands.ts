import { useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { fontsToCheckBeforePublishing } from "@/lib/editor/font-catalog";
import type { PageSetup } from "@/lib/editor/page-setup";
import type { Margins } from "@/lib/editor/types";
import { useLibraryControl } from "@/lib/library/library-context";
import { buildExportRequest, skippedShapeCount, type ExportRequest } from "@/lib/export/export-request";
import { pptxExportProblem } from "@/lib/export/pptx-export";
import { measureLineWidth, measureTextLayout } from "@/lib/export/text-layout";
import { useProject } from "./project-context";
import { describeCommandError, isDesktop, projectApi } from "./project-api";
import type { ExportFormat } from "./project-types";

export type UnsavedChoice = "save" | "discard" | "cancel";

/** Asks the user what to do with unsaved changes. */
export type ConfirmUnsaved = () => Promise<UnsavedChoice>;

/** What 新增文件 creates: a blank document of the chosen paper, or a copy of a document template. */
export type NewDocumentChoice =
  | { readonly kind: "blank"; readonly setup: PageSetup }
  | { readonly kind: "template"; readonly id: string; readonly margins: Margins };

/**
 * Shows the 新增文件 dialog; null when the user cancels. With a template id the dialog starts on
 * that template (文件範本 window's 用這個範本新增專案).
 */
export type ChooseNewSetup = (templateId?: string) => Promise<NewDocumentChoice | null>;

/**
 * Before a flip book export: the book carries these fonts' whole files; resolves true to go on.
 */
export type ConfirmFontLicense = (fontNames: readonly string[]) => Promise<boolean>;

export interface ProjectCommands {
  /** Each resolves to true when the operation completed (false: cancelled or failed). */
  /** Optionally starts the 新增文件 dialog on a document template. */
  readonly newProject: (templateId?: string) => Promise<boolean>;
  readonly openProject: () => Promise<boolean>;
  readonly save: () => Promise<boolean>;
  readonly saveAs: () => Promise<boolean>;
  /** Handles unsaved changes before the window closes; true means it may close. */
  readonly confirmClose: () => Promise<boolean>;
  /** Exports every page of the current (possibly unsaved) content to PDF. */
  readonly exportPdf: () => Promise<boolean>;
  /** Exports the same content as an HTML5 flip book folder. */
  readonly exportFlipbook: () => Promise<boolean>;
  /** Exports the same flip book as one `.zip` file (for a web host or the website upload page). */
  readonly exportFlipbookZip: () => Promise<boolean>;
  /** Exports the same content as PowerPoint, one picture per slide (slide-size documents only). */
  readonly exportPptx: () => Promise<boolean>;
}

/** What each export format is called in messages, and which command renders it. */
const EXPORT_FORMATS = {
  pdf: { name: "PDF", run: projectApi.exportPdf },
  flipbook: { name: "翻頁電子書", run: projectApi.exportFlipbook },
  flipbookZip: { name: "翻頁電子書（Zip）", run: projectApi.exportFlipbookZip },
  pptx: { name: "PowerPoint", run: projectApi.exportPptx },
} as const satisfies Record<ExportFormat, { name: string; run: (request: ExportRequest) => unknown }>;

export const DESKTOP_ONLY_MESSAGE = "檔案功能僅在桌面版可用（npm run tauri dev）";

/**
 * Builds the file commands (new / open / save / save as / close / export PDF or flip book).
 *
 * Args:
 *   confirmUnsaved: Shows the "save changes?" prompt; injected so this hook stays UI-free.
 *   chooseNewSetup: Shows the 新增文件 dialog (paper and margins of a new project); injected too.
 *   confirmFontLicense: Asks whether to export a flip book with fonts whose licence the user should
 *     check (system fonts, own files); injected too.
 *
 * Returns:
 *   Command functions; they read the latest state when invoked.
 */
export function useProjectCommands(
  confirmUnsaved: ConfirmUnsaved,
  chooseNewSetup: ChooseNewSetup,
  confirmFontLicense: ConfirmFontLicense,
): ProjectCommands {
  const { ready, getSnapshot, createNew, createFromTemplate, loadOpened, markSaved } = useProject();
  // 素材庫是立即寫入的：換專案（Rust 端拒絕寫到別的專案）與另存（Rust 從磁碟複製素材庫）之前先寫完
  const { flush: flushLibrary } = useLibraryControl();
  // 連按 Ctrl+S、或對話框開著時又觸發指令（包括關閉視窗），會造成兩個寫入同時進行
  const busyRef = useRef(false);

  const exclusive = useCallback(
    <A extends unknown[]>(run: (...args: A) => Promise<boolean>) => async (...args: A): Promise<boolean> => {
      if (!isDesktop) {
        toast.info(DESKTOP_ONLY_MESSAGE);
        return false;
      }
      if (!ready || busyRef.current) return false;
      busyRef.current = true;
      try {
        return await run(...args);
      } finally {
        busyRef.current = false;
      }
    },
    [ready],
  );

  const saveAsImpl = useCallback(async (): Promise<boolean> => {
    await flushLibrary();
    const { content } = getSnapshot();
    const result = await projectApi.saveAsDialog(content, content.document.name);
    if (result.error) {
      toast.error(`另存失敗：${describeCommandError(result.error)}`);
      return false;
    }
    if (result.data === null) return false;
    markSaved(result.data, content.document);
    toast.success("已另存專案");
    return true;
  }, [flushLibrary, getSnapshot, markSaved]);

  const saveImpl = useCallback(async (): Promise<boolean> => {
    const { info, content } = getSnapshot();
    if (info === null) return false;
    if (info.untitled) return saveAsImpl();
    const result = await projectApi.save(content);
    if (result.error) {
      toast.error(`儲存失敗：${describeCommandError(result.error)}`);
      return false;
    }
    markSaved(info, content.document);
    toast.success("已儲存");
    return true;
  }, [getSnapshot, markSaved, saveAsImpl]);

  // 回傳 true 表示可以繼續（沒有未存檔的變更、已存檔，或使用者選擇不儲存）
  const resolveUnsaved = useCallback(async (): Promise<boolean> => {
    if (!getSnapshot().dirty) return true;
    const choice = await confirmUnsaved();
    if (choice === "cancel") return false;
    if (choice === "save") return saveImpl();
    return true;
  }, [confirmUnsaved, getSnapshot, saveImpl]);

  // 先處理未存檔再選紙張；在紙張對話框按取消時留在目前的文件（對話框開著時 busyRef 擋住其他檔案指令）
  const newImpl = useCallback(
    async (templateId?: string): Promise<boolean> => {
      if (!(await resolveUnsaved())) return false;
      const choice = await chooseNewSetup(templateId);
      if (choice === null) return false;
      await flushLibrary();
      return choice.kind === "blank" ? createNew(choice.setup) : createFromTemplate(choice.id, choice.margins);
    },
    [chooseNewSetup, createNew, createFromTemplate, flushLibrary, resolveUnsaved],
  );

  const openImpl = useCallback(async (): Promise<boolean> => {
    if (!(await resolveUnsaved())) return false;
    await flushLibrary();
    const opened = await projectApi.openDialog();
    if (opened.error) {
      toast.error(`無法開啟專案：${describeCommandError(opened.error)}`);
      return false;
    }
    if (opened.data === null) return false;
    loadOpened(opened.data);
    return true;
  }, [flushLibrary, loadOpened, resolveUnsaved]);

  const runExport = useCallback(
    async (format: ExportFormat): Promise<boolean> => {
      const { name, run } = EXPORT_FORMATS[format];
      // 匯出的是目前畫面上的內容（包含未存檔的修改）；對話框開著時使用者無法編輯，先取快照即可
      const { document } = getSnapshot().content;
      // 翻頁書把整個字型檔放進資料夾：放上網站前要確認授權允許散布（PDF / EPUB 照嵌入的規則，不另外問）
      // 選單已經停用；MCP 或其他入口仍可能呼叫，在選存檔位置之前就說明（Rust 也會再擋）
      if (format === "pptx") {
        const problem = pptxExportProblem(document);
        if (problem !== null) {
          toast.error(`無法匯出 PowerPoint：${problem}（設定 → 文件 → 頁面設定）`);
          return false;
        }
      }
      if (format === "flipbook" || format === "flipbookZip") {
        const fonts = fontsToCheckBeforePublishing(document);
        if (fonts.length > 0 && !(await confirmFontLicense(fonts.map((font) => font.name)))) return false;
      }
      const chosen = await projectApi.chooseExportPath(format, document.name);
      if (chosen.error) {
        toast.error(`無法匯出${name}：${describeCommandError(chosen.error)}`);
        return false;
      }
      if (chosen.data === null) return false;
      const toastId = toast.loading(`正在匯出「${chosen.data}」…`);
      const request = buildExportRequest(document, measureTextLayout, measureLineWidth);
      const exported = await run(request);
      if (exported.error) {
        toast.error(`匯出${name}失敗：${describeCommandError(exported.error)}`, { id: toastId });
        return false;
      }
      toast.success(`已匯出「${chosen.data}」（${exported.data.pages} 頁）`, {
        id: toastId,
        action: { label: "開啟", onClick: () => void openLastExport() },
      });
      if (exported.data.skippedImages > 0) {
        toast.warning(`有 ${exported.data.skippedImages} 張圖片找不到檔案或無法輸出（例如 SVG 連結了外部檔案），已略過`);
      }
      const skippedShapes = skippedShapeCount(request);
      if (skippedShapes > 0) {
        toast.warning(`有 ${skippedShapes} 個圖形是這個版本不認得的圖形庫圖形，已略過`);
      }
      return true;
    },
    [confirmFontLicense, getSnapshot],
  );
  const exportPdfImpl = useCallback(() => runExport("pdf"), [runExport]);
  const exportFlipbookImpl = useCallback(() => runExport("flipbook"), [runExport]);
  const exportFlipbookZipImpl = useCallback(() => runExport("flipbookZip"), [runExport]);
  const exportPptxImpl = useCallback(() => runExport("pptx"), [runExport]);

  return useMemo(
    () => ({
      newProject: exclusive(newImpl),
      openProject: exclusive(openImpl),
      save: exclusive(saveImpl),
      saveAs: exclusive(saveAsImpl),
      confirmClose: exclusive(resolveUnsaved),
      exportPdf: exclusive(exportPdfImpl),
      exportFlipbook: exclusive(exportFlipbookImpl),
      exportFlipbookZip: exclusive(exportFlipbookZipImpl),
      exportPptx: exclusive(exportPptxImpl),
    }),
    [exclusive, newImpl, openImpl, saveImpl, saveAsImpl, resolveUnsaved, exportPdfImpl, exportFlipbookImpl, exportFlipbookZipImpl, exportPptxImpl],
  );
}

/** The 「開啟」 button of the success toast: the PDF, or the flip book's index.html in the browser. */
async function openLastExport(): Promise<void> {
  const opened = await projectApi.openLastExport();
  if (opened.error) toast.error(describeCommandError(opened.error));
}
