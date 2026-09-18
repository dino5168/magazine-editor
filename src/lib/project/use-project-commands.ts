import { useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useProject } from "./project-context";
import { describeCommandError, isDesktop, projectApi } from "./project-api";

export type UnsavedChoice = "save" | "discard" | "cancel";

/** Asks the user what to do with unsaved changes. */
export type ConfirmUnsaved = () => Promise<UnsavedChoice>;

export interface ProjectCommands {
  /** Each resolves to true when the operation completed (false: cancelled or failed). */
  readonly newProject: () => Promise<boolean>;
  readonly openProject: () => Promise<boolean>;
  readonly save: () => Promise<boolean>;
  readonly saveAs: () => Promise<boolean>;
  /** Handles unsaved changes before the window closes; true means it may close. */
  readonly confirmClose: () => Promise<boolean>;
}

const DESKTOP_ONLY_MESSAGE = "檔案功能僅在桌面版可用（npm run tauri dev）";

/**
 * Builds the file commands (new / open / save / save as / close).
 *
 * Args:
 *   confirmUnsaved: Shows the "save changes?" prompt; injected so this hook stays UI-free.
 *
 * Returns:
 *   Command functions; they read the latest state when invoked.
 */
export function useProjectCommands(confirmUnsaved: ConfirmUnsaved): ProjectCommands {
  const { ready, getSnapshot, createNew, loadOpened, markSaved } = useProject();
  // 連按 Ctrl+S、或對話框開著時又觸發指令（包括關閉視窗），會造成兩個寫入同時進行
  const busyRef = useRef(false);

  const exclusive = useCallback(
    (run: () => Promise<boolean>) => async (): Promise<boolean> => {
      if (!isDesktop) {
        toast.info(DESKTOP_ONLY_MESSAGE);
        return false;
      }
      if (!ready || busyRef.current) return false;
      busyRef.current = true;
      try {
        return await run();
      } finally {
        busyRef.current = false;
      }
    },
    [ready],
  );

  const saveAsImpl = useCallback(async (): Promise<boolean> => {
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
  }, [getSnapshot, markSaved]);

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

  const newImpl = useCallback(
    async (): Promise<boolean> => (await resolveUnsaved()) && createNew(),
    [createNew, resolveUnsaved],
  );

  const openImpl = useCallback(async (): Promise<boolean> => {
    if (!(await resolveUnsaved())) return false;
    const opened = await projectApi.openDialog();
    if (opened.error) {
      toast.error(`無法開啟專案：${describeCommandError(opened.error)}`);
      return false;
    }
    if (opened.data === null) return false;
    loadOpened(opened.data);
    return true;
  }, [loadOpened, resolveUnsaved]);

  return useMemo(
    () => ({
      newProject: exclusive(newImpl),
      openProject: exclusive(openImpl),
      save: exclusive(saveImpl),
      saveAs: exclusive(saveAsImpl),
      confirmClose: exclusive(resolveUnsaved),
    }),
    [exclusive, newImpl, openImpl, saveImpl, saveAsImpl, resolveUnsaved],
  );
}
