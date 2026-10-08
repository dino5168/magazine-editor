import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { describeCommandError, isDesktop, projectApi } from "@/lib/project/project-api";
import { libraryReducer, type LibraryAction } from "./library-reducer";
import { resetThumbnailCache } from "./thumbnails";
import { EMPTY_LIBRARY, type Library } from "./types";

/** Loading and persisting the library; used by `ProjectProvider` and the file commands. */
export interface LibraryControl {
  /** Replaces the library after a project was opened / created / restored (no write). */
  readonly load: (projectId: string | null, library: Library) => void;
  /** The latest library, including dispatches that have not rendered yet. */
  readonly getLibrary: () => Library;
  /**
   * Resolves once every change has been written. Call before the current project changes
   * (open / new / save as) or the window closes.
   */
  readonly flush: () => Promise<void>;
  readonly hasPendingWrites: () => boolean;
}

interface WriteJob {
  readonly projectId: string;
  readonly library: Library;
}

const LibraryStateContext = createContext<Library | null>(null);
const LibraryDispatchContext = createContext<Dispatch<LibraryAction> | null>(null);
const LibraryControlContext = createContext<LibraryControl | null>(null);

/**
 * Owns the asset library of the open project. Every change is written to `library.json` right away
 * (not part of undo, not part of "unsaved changes"). Writes run one at a time; changes made while a
 * write is in flight are merged into the next write. In the browser (`npm run dev`) the library
 * only lives in memory.
 *
 * Args:
 *   props.children: Content.
 *
 * Returns:
 *   Context providers.
 */
export function LibraryProvider({ children }: { readonly children: ReactNode }) {
  const [library, dispatchAction] = useReducer(libraryReducer, EMPTY_LIBRARY);
  const projectIdRef = useRef<string | null>(null);
  // 最新的素材庫（dispatch 後立即更新，不等 render）與最後一次載入 / 排入寫入的版本
  const latestRef = useRef<Library>(EMPTY_LIBRARY);
  const persistedRef = useRef<Library>(EMPTY_LIBRARY);
  const pendingRef = useRef<WriteJob | null>(null);
  const runningRef = useRef<Promise<void> | null>(null);

  const start = useCallback((): void => {
    if (runningRef.current) return;
    runningRef.current = (async () => {
      try {
        // 寫入期間又有變更時只留最新的一份，寫完再寫它
        while (pendingRef.current) {
          const job = pendingRef.current;
          pendingRef.current = null;
          const written = await projectApi.writeLibrary(job.projectId, job.library);
          // 每次都寫整份，下一次變更會再試
          if (written.error) toast.error(`素材庫沒有存好：${describeCommandError(written.error)}`);
        }
      } finally {
        runningRef.current = null;
        // 迴圈結束到這裡之間排入的寫入
        if (pendingRef.current) start();
      }
    })();
  }, []);

  useEffect(() => {
    if (library === persistedRef.current) return;
    persistedRef.current = library;
    const projectId = projectIdRef.current;
    if (!isDesktop || projectId === null) return;
    pendingRef.current = { projectId, library };
    start();
  }, [library, start]);

  const dispatch = useCallback<Dispatch<LibraryAction>>((action) => {
    latestRef.current = libraryReducer(latestRef.current, action);
    dispatchAction(action);
  }, []);

  const control = useMemo<LibraryControl>(
    () => ({
      load: (projectId, next) => {
        // 縮圖路徑屬於專案資料夾；換專案時重新要
        if (projectId !== projectIdRef.current) resetThumbnailCache();
        projectIdRef.current = projectId;
        // 先記成已存，effect 才不會把剛讀進來的內容寫回去
        persistedRef.current = next;
        latestRef.current = next;
        dispatchAction({ type: "library/load", library: next });
      },
      getLibrary: () => latestRef.current,
      flush: async () => {
        while (runningRef.current) await runningRef.current;
      },
      hasPendingWrites: () => runningRef.current !== null || pendingRef.current !== null,
    }),
    [],
  );

  return (
    <LibraryControlContext.Provider value={control}>
      <LibraryDispatchContext.Provider value={dispatch}>
        <LibraryStateContext.Provider value={library}>{children}</LibraryStateContext.Provider>
      </LibraryDispatchContext.Provider>
    </LibraryControlContext.Provider>
  );
}

function useRequired<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`${name} must be used within LibraryProvider`);
  return value;
}

/**
 * Reads the asset library.
 *
 * Returns:
 *   The library.
 *
 * Raises:
 *   Error: When used outside `LibraryProvider`.
 */
export function useLibrary(): Library {
  return useRequired(useContext(LibraryStateContext), "useLibrary");
}

/**
 * Returns the library dispatch (changes are written to disk automatically).
 *
 * Returns:
 *   Dispatch function.
 *
 * Raises:
 *   Error: When used outside `LibraryProvider`.
 */
export function useLibraryDispatch(): Dispatch<LibraryAction> {
  return useRequired(useContext(LibraryDispatchContext), "useLibraryDispatch");
}

/**
 * Returns load / flush controls for project-level code.
 *
 * Returns:
 *   Library control.
 *
 * Raises:
 *   Error: When used outside `LibraryProvider`.
 */
export function useLibraryControl(): LibraryControl {
  return useRequired(useContext(LibraryControlContext), "useLibraryControl");
}
