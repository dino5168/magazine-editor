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
  /** Tauri window with file access; false in browser-only dev mode. */
  readonly desktop: boolean;
  readonly info: ProjectInfo | null;
  /** False until the startup project has been loaded. */
  readonly ready: boolean;
  /** The document differs from the last saved (or loaded) version. */
  readonly dirty: boolean;
  readonly resolveSrc: (src: string) => string;
  readonly getSnapshot: () => ProjectSnapshot;
  /** Replaces the editor content with a project (clears undo history). */
  readonly load: (info: ProjectInfo, content: ProjectContent, options?: { readonly dirty?: boolean }) => void;
  readonly markSaved: (info: ProjectInfo, document: EditorDocument) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

/**
 * Computes whether the document has unsaved changes.
 *
 * Args:
 *   info: Open project, or null in browser-only mode.
 *   present: Current document.
 *   saved: Document as last saved / loaded, or null when it must be saved (e.g. restored from backup).
 *
 * Returns:
 *   True when there are unsaved changes.
 */
export function isDirty(info: ProjectInfo | null, present: EditorDocument, saved: EditorDocument | null): boolean {
  // 文件是不可變資料：比較參考即可；復原到存檔時的版本會自動變回「未修改」
  return info !== null && present !== saved;
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
 * Warns the user when a project was opened from its backup file.
 *
 * Args:
 *   opened: Result of opening a project.
 */
export function notifyIfRecoveredFromBackup(opened: OpenedProject): void {
  if (opened.recoveredFromBackup) {
    toast.warning("專案檔案已損壞，已改用上一次存檔的版本開啟。請檢查內容後重新儲存。");
  }
}

/**
 * Owns the open project: loads the last project at startup, tracks unsaved changes and keeps the
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
  const [savedDocument, setSavedDocument] = useState<EditorDocument | null>(null);
  const [ready, setReady] = useState(!isDesktop);

  const present = state.history.present;
  const dirty = isDirty(info, present, savedDocument);

  const snapshotRef = useRef<ProjectSnapshot>({ info, content: { document: present, assets: state.assets }, dirty });
  useLayoutEffect(() => {
    snapshotRef.current = { info, content: { document: present, assets: state.assets }, dirty };
  }, [info, present, state.assets, dirty]);
  const getSnapshot = useCallback(() => snapshotRef.current, []);

  const load = useCallback<ProjectContextValue["load"]>(
    (nextInfo, content, options) => {
      dispatch({ type: "document/load", document: content.document, assets: content.assets });
      setInfo(nextInfo);
      // reducer 直接保存 content.document 這個參考，所以之後可以用 === 判斷是否修改
      setSavedDocument(options?.dirty ? null : content.document);
    },
    [dispatch],
  );

  const markSaved = useCallback((nextInfo: ProjectInfo, document: EditorDocument) => {
    setInfo(nextInfo);
    setSavedDocument(document);
  }, []);

  // StrictMode 會執行兩次 effect；ref 在兩次之間保留，避免建立兩個專案
  const startedRef = useRef(false);
  useEffect(() => {
    if (!isDesktop || startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      const last = await projectApi.openLast();
      if (last.error) {
        toast.error(`無法開啟上次的專案：${describeCommandError(last.error)}`);
      } else if (last.data) {
        load(last.data.info, last.data.content, { dirty: last.data.recoveredFromBackup });
        notifyIfRecoveredFromBackup(last.data);
        setReady(true);
        return;
      }
      const created = await projectApi.create();
      if (created.error) {
        toast.error(`無法建立新專案：${describeCommandError(created.error)}`);
      } else {
        load(created.data, { document: createBlankDocument(), assets: [] });
      }
      setReady(true);
    })();
  }, [load]);

  useEffect(() => {
    if (!isDesktop) return;
    getCurrentWindow()
      .setTitle(formatWindowTitle(present.name, dirty))
      .catch(() => undefined);
  }, [present.name, dirty]);

  const root = info?.root ?? null;
  const resolveSrc = useCallback((src: string) => resolveAssetUrl(src, root, convertFileSrc), [root]);

  const value = useMemo<ProjectContextValue>(
    () => ({ desktop: isDesktop, info, ready, dirty, resolveSrc, getSnapshot, load, markSaved }),
    [info, ready, dirty, resolveSrc, getSnapshot, load, markSaved],
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

