import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { selectIsDirty } from "@/lib/editor/editor-reducer";
import { createBlankDocument } from "@/lib/editor/element-factory";
import type { PageSetup } from "@/lib/editor/page-setup";
import type { EditorDocument } from "@/lib/editor/types";
import { resolveAssetUrl } from "./asset-url";
import { describeCommandError, isDesktop, projectApi } from "./project-api";
import type { OpenedProject, ProjectContent, ProjectInfo, RecoveryEntry } from "./project-types";
import { useAutosave } from "./use-autosave";

export const APP_TITLE = "雜誌編輯軟體";

/** Values read at call time by async commands, so they never act on a stale render. */
export interface ProjectSnapshot {
  readonly info: ProjectInfo | null;
  readonly content: ProjectContent;
  readonly dirty: boolean;
}

interface ProjectContextValue {
  /** False until the startup project has been loaded. */
  readonly ready: boolean;
  /** The document differs from the last saved (or loaded) version. */
  readonly dirty: boolean;
  readonly resolveSrc: (src: string) => string;
  readonly getSnapshot: () => ProjectSnapshot;
  /**
   * Creates an untitled project with one blank page of the given paper and margins (default: A4
   * portrait, 15 mm). Resolves to false (after a toast) on failure.
   */
  readonly createNew: (setup?: PageSetup) => Promise<boolean>;
  /** Replaces the editor content with an opened project (clears undo history). */
  readonly loadOpened: (opened: OpenedProject) => void;
  readonly markSaved: (info: ProjectInfo, document: EditorDocument) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

/**
 * Answer to the startup "restore unsaved content?" prompt. There is deliberately no "later": the
 * project would be edited meanwhile and the next autosave would overwrite the old backup anyway.
 */
export type RecoveryChoice = "restore" | "discard";

interface ProjectProviderProps {
  readonly children: ReactNode;
  /** Shows the recovery prompt; injected so this provider stays UI-free. */
  readonly confirmRecovery: (entry: RecoveryEntry) => Promise<RecoveryChoice>;
}

/**
 * Formats the window title.
 *
 * Args:
 *   name: Document name.
 *   dirty: Whether there are unsaved changes.
 *
 * Returns:
 *   Title such as "● 我的雜誌 — 雜誌編輯軟體".
 */
export function formatWindowTitle(name: string, dirty: boolean): string {
  return `${dirty ? "● " : ""}${name} — ${APP_TITLE}`;
}

/**
 * Owns the open project: offers crash recovery and otherwise loads the last project at startup,
 * writes automatic backups, reports unsaved changes and keeps the window title in sync.
 * Must be inside `EditorProvider`.
 *
 * Args:
 *   props.children: Editor UI.
 *   props.confirmRecovery: Asks whether to restore a backup found at startup.
 *
 * Returns:
 *   Context provider.
 */
export function ProjectProvider({ children, confirmRecovery }: ProjectProviderProps) {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [ready, setReady] = useState(!isDesktop);

  const present = state.history.present;
  // 瀏覽器模式沒有專案可存，不算未存檔
  const dirty = info !== null && selectIsDirty(state);

  const snapshotRef = useRef<ProjectSnapshot>({ info, content: { document: present, assets: state.assets }, dirty });
  useLayoutEffect(() => {
    snapshotRef.current = { info, content: { document: present, assets: state.assets }, dirty };
  }, [info, present, state.assets, dirty]);
  const getSnapshot = useCallback(() => snapshotRef.current, []);

  const load = useCallback(
    (nextInfo: ProjectInfo, content: ProjectContent, saved: boolean) => {
      dispatch({ type: "document/load", document: content.document, assets: content.assets, saved });
      setInfo(nextInfo);
    },
    [dispatch],
  );

  const loadOpened = useCallback(
    (opened: OpenedProject) => {
      load(opened.info, opened.content, !opened.recoveredFromBackup);
      if (opened.recoveredFromBackup) {
        toast.warning("專案檔案已損壞，已改用上一次存檔的版本開啟。請檢查內容後重新儲存。");
      }
    },
    [load],
  );

  const createNew = useCallback(async (setup?: PageSetup) => {
    const created = await projectApi.create();
    if (created.error) {
      toast.error(`無法建立新專案：${describeCommandError(created.error)}`);
      return false;
    }
    load(created.data, { document: createBlankDocument(setup), assets: [] }, true);
    return true;
  }, [load]);

  const markSaved = useCallback(
    (nextInfo: ProjectInfo, document: EditorDocument) => {
      dispatch({ type: "document/markSaved", document });
      setInfo(nextInfo);
    },
    [dispatch],
  );

  // 回傳 true 表示已經載入備份的內容
  const offerRecovery = useCallback(async (): Promise<boolean> => {
    const listed = await projectApi.listRecovery();
    // 只處理最新的一份；正常情況下同時只會有一份（切換專案時會刪除前一個專案的備份）
    const entry = listed.data?.[0];
    if (!entry) return false;
    if ((await confirmRecovery(entry)) === "discard") {
      const discarded = await projectApi.discardRecovery(entry.id);
      if (discarded.error) toast.error(`無法刪除備份：${describeCommandError(discarded.error)}`);
      return false;
    }
    const restored = await projectApi.restoreRecovery(entry.id);
    if (restored.error) {
      toast.error(`無法復原：${describeCommandError(restored.error)}`);
      return false;
    }
    load(restored.data.info, restored.data.content, false);
    toast.success("已復原上次未儲存的內容，請記得存檔。");
    return true;
  }, [confirmRecovery, load]);

  // StrictMode 會執行兩次 effect；ref 在兩次之間保留，避免建立兩個專案
  const startedRef = useRef(false);
  useEffect(() => {
    if (!isDesktop || startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      if (await offerRecovery()) {
        setReady(true);
        return;
      }
      const last = await projectApi.openLast();
      if (last.error) toast.error(`無法開啟上次的專案：${describeCommandError(last.error)}`);
      if (last.data) loadOpened(last.data);
      else await createNew();
      setReady(true);
    })();
  }, [offerRecovery, loadOpened, createNew]);

  useAutosave(getSnapshot, ready);

  useEffect(() => {
    if (!isDesktop) return;
    getCurrentWindow()
      .setTitle(formatWindowTitle(present.name, dirty))
      .catch(() => undefined);
  }, [present.name, dirty]);

  const root = info?.root ?? null;
  const resolveSrc = useCallback((src: string) => resolveAssetUrl(src, root, convertFileSrc), [root]);

  const value = useMemo<ProjectContextValue>(
    () => ({ ready, dirty, resolveSrc, getSnapshot, createNew, loadOpened, markSaved }),
    [ready, dirty, resolveSrc, getSnapshot, createNew, loadOpened, markSaved],
  );
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

/**
 * Reads the project context.
 *
 * Returns:
 *   Project state and operations.
 *
 * Raises:
 *   Error: When used outside `ProjectProvider`.
 */
export function useProject(): ProjectContextValue {
  const value = useContext(ProjectContext);
  if (value === null) throw new Error("useProject must be used within ProjectProvider");
  return value;
}
