import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useLibraryControl } from "@/lib/library/library-context";
import { isDesktop } from "./project-api";
import { useProject } from "./project-context";

/**
 * Asks before closing the window with unsaved changes, and lets pending asset library writes
 * finish first.
 *
 * Args:
 *   confirmClose: `ProjectCommands.confirmClose`; the window closes only when it resolves to true.
 */
export function useCloseGuard(confirmClose: () => Promise<boolean>): void {
  const { getSnapshot } = useProject();
  const { flush, hasPendingWrites } = useLibraryControl();

  useEffect(() => {
    if (!isDesktop) return;
    const window = getCurrentWindow();
    let closing = false;
    const unlisten = window.onCloseRequested(async (event) => {
      if (closing) return;
      const dirty = getSnapshot().dirty;
      if (!dirty && !hasPendingWrites()) return;
      // 必須在第一個 await 之前呼叫，否則視窗已經關閉
      event.preventDefault();
      await flush();
      if (dirty && !(await confirmClose())) return;
      closing = true;
      await window.destroy();
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [confirmClose, flush, getSnapshot, hasPendingWrites]);
}
