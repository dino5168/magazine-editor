import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isDesktop } from "./project-api";
import { useProject } from "./project-context";

/**
 * Asks before closing the window with unsaved changes.
 *
 * Args:
 *   confirmClose: `ProjectCommands.confirmClose`; the window closes only when it resolves to true.
 */
export function useCloseGuard(confirmClose: () => Promise<boolean>): void {
  const { getSnapshot } = useProject();

  useEffect(() => {
    if (!isDesktop) return;
    const window = getCurrentWindow();
    let closing = false;
    const unlisten = window.onCloseRequested(async (event) => {
      if (closing || !getSnapshot().dirty) return;
      // 必須在第一個 await 之前呼叫，否則視窗已經關閉
      event.preventDefault();
      if (!(await confirmClose())) return;
      closing = true;
      await window.destroy();
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [confirmClose, getSnapshot]);
}
