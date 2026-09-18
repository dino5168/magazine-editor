import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isDesktop } from "./project-api";
import { useProject } from "./project-context";
import type { ConfirmUnsaved } from "./use-project-commands";

/**
 * Asks before closing the window with unsaved changes.
 *
 * Args:
 *   confirmUnsaved: Shows the "save changes?" prompt.
 *   save: Saves the project; closing is aborted when it returns false.
 */
export function useCloseGuard(confirmUnsaved: ConfirmUnsaved, save: () => Promise<boolean>): void {
  const { getSnapshot } = useProject();

  useEffect(() => {
    if (!isDesktop) return;
    const window = getCurrentWindow();
    let closing = false;
    const unlisten = window.onCloseRequested(async (event) => {
      if (closing || !getSnapshot().dirty) return;
      // 必須在第一個 await 之前呼叫，否則視窗已經關閉
      event.preventDefault();
      const choice = await confirmUnsaved();
      if (choice === "cancel") return;
      if (choice === "save" && !(await save())) return;
      closing = true;
      await window.destroy();
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [confirmUnsaved, getSnapshot, save]);
}
