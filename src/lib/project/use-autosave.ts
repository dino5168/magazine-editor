import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { AssetInfo, EditorDocument } from "@/lib/editor/types";
import { describeCommandError, isDesktop, projectApi } from "./project-api";
import type { ProjectSnapshot } from "./project-context";

/** How often unsaved content is written to the recovery file. */
export const AUTOSAVE_INTERVAL_MS = 60_000;

/** What the recovery file currently holds for a project. */
export interface WrittenBackup {
  readonly projectId: string;
  readonly document: EditorDocument;
  readonly assets: readonly AssetInfo[];
}

export type AutosaveAction = "write" | "clear" | "none";

/**
 * Decides what an autosave tick should do.
 *
 * Args:
 *   snapshot: Current project state.
 *   written: Content last written to a recovery file, or null.
 *
 * Returns:
 *   "write" for new unsaved content, "clear" when a backup exists but nothing is unsaved any more
 *   (saved, or undone back to the saved version), otherwise "none".
 */
export function decideAutosave(snapshot: ProjectSnapshot, written: WrittenBackup | null): AutosaveAction {
  const { info, content, dirty } = snapshot;
  if (info === null) return "none";
  // 切換專案時 Rust 端已經刪除前一個專案的備份
  const current = written?.projectId === info.id ? written : null;
  if (dirty) {
    const unchanged = current?.document === content.document && current.assets === content.assets;
    return unchanged ? "none" : "write";
  }
  return current ? "clear" : "none";
}

/**
 * Periodically writes unsaved content to the recovery file (desktop only).
 *
 * Args:
 *   getSnapshot: Reads the latest project state.
 *   enabled: False until the startup project is loaded.
 */
export function useAutosave(getSnapshot: () => ProjectSnapshot, enabled: boolean): void {
  const writtenRef = useRef<WrittenBackup | null>(null);

  useEffect(() => {
    if (!isDesktop || !enabled) return;
    let running = false;
    // 失敗只提示一次，避免每分鐘跳出同樣的錯誤
    let warned = false;

    const tick = async (): Promise<void> => {
      if (running) return;
      const snapshot = getSnapshot();
      const action = decideAutosave(snapshot, writtenRef.current);
      if (action === "none" || snapshot.info === null) return;
      running = true;
      try {
        if (action === "write") {
          const result = await projectApi.writeRecovery(snapshot.content);
          if (result.error) {
            if (!warned) toast.warning(`自動備份失敗：${describeCommandError(result.error)}`);
            warned = true;
            return;
          }
          warned = false;
          writtenRef.current = { projectId: snapshot.info.id, ...snapshot.content };
        } else {
          await projectApi.clearRecovery();
          writtenRef.current = null;
        }
      } finally {
        running = false;
      }
    };

    const timer = window.setInterval(() => void tick(), AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [getSnapshot, enabled]);
}
