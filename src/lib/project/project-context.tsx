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
import type { EditorDocument } from "@/lib/editor/types";
import { resolveAssetUrl } from "./asset-url";
import { describeCommandError, isDesktop, projectApi } from "./project-api";
import type { OpenedProject, ProjectContent, ProjectInfo } from "./project-types";

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
  /** Creates an untitled project with a blank A4 page. Resolves to false (after a toast) on failure. */
  readonly createNew: () => Promise<boolean>;
  /** Replaces the editor content with an opened project (clears undo history). */
  readonly loadOpened: (opened: OpenedProject) => void;
  readonly markSaved: (info: ProjectInfo, document: EditorDocument) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

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
 * Owns the open project: loads the last project at startup, reports unsaved changes and keeps the
 * window title in sync. Must be inside `EditorProvider`.
 *
 * Args:
 *   props.children: Editor UI.
 *
 * Returns:
 *   Context provider.
 */
export function ProjectProvider({ children }: { readonly children: ReactNode }) {
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

  const createNew = useCallback(async () => {
    const created = await projectApi.create();
    if (created.error) {
      toast.error(`無法建立新專案：${describeCommandError(created.error)}`);
      return false;
    }
    load(created.data, { document: createBlankDocument(), assets: [] }, true);
    return true;
  }, [load]);

  const markSaved = useCallback(
    (nextInfo: ProjectInfo, document: EditorDocument) => {
      dispatch({ type: "document/markSaved", document });
      setInfo(nextInfo);
    },
    [dispatch],
  );

  // StrictMode 會執行兩次 effect；ref 在兩次之間保留，避免建立兩個專案
  const startedRef = useRef(false);
  useEffect(() => {
    if (!isDesktop || startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      const last = await projectApi.openLast();
      if (last.error) toast.error(`無法開啟上次的專案：${describeCommandError(last.error)}`);
      if (last.data) loadOpened(last.data);
      else await createNew();
      setReady(true);
    })();
  }, [loadOpened, createNew]);

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
