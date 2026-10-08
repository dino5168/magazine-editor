import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import { libraryDropResult, type LibraryDragPayload, type LibraryDropTarget, type LibraryDropResult } from "@/lib/library/library-drop";
import type { LibraryAction } from "@/lib/library/library-reducer";
import { treeDropZone } from "@/lib/library/library-tree";
import type { Library } from "@/lib/library/types";
import { moveDragGhost } from "../drag-ghost";
import { startPointerDrag } from "../pointer-drag";

/** The drop under the pointer, for highlighting rows (null when nothing would happen there). */
export interface LibraryDropHint {
  readonly target: LibraryDropTarget;
  /** False when the drop is refused (the message is shown on release). */
  readonly valid: boolean;
}

/** `data-drop` value for a row: `into`, `before`, `after` or `invalid`. */
export function dropMarker(hint: LibraryDropHint | null, target: LibraryDropTarget): string | undefined {
  if (!hint || hint.target.type !== target.type) return undefined;
  if (target.type === "folder" && (hint.target.type !== "folder" || hint.target.id !== target.id)) return undefined;
  if (!hint.valid) return "invalid";
  return hint.target.type === "folder" ? hint.target.zone : "into";
}

/** Reads the drop target under a point from the rows' data attributes. */
function targetAt(x: number, y: number, payload: LibraryDragPayload): LibraryDropTarget | null {
  const element = document.elementFromPoint(x, y);
  const row = element?.closest<HTMLElement>("[data-library-folder], [data-library-sys], [data-library-root]");
  if (!row || !row.closest("[data-library-dialog]")) return null;
  const folderId = row.dataset.libraryFolder;
  if (folderId !== undefined) {
    // 素材放在資料夾列的哪裡都是放進去；資料夾才分前 / 中 / 後
    if (payload.type === "items") return { type: "folder", id: folderId, zone: "into" };
    const rect = row.getBoundingClientRect();
    return { type: "folder", id: folderId, zone: treeDropZone(rect.top, rect.height, y) };
  }
  if (row.dataset.libraryRoot !== undefined) return { type: "root" };
  const sys = row.dataset.librarySys;
  return sys === "unsorted" || sys === "trash" || sys === "all" ? { type: sys } : null;
}

const sameTarget = (a: LibraryDropTarget | null, b: LibraryDropTarget | null): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Drags items (cards) and folders (tree rows) in the asset manager. Same pattern as the tool panel
 * and page tab drags: pointer events through `startPointerDrag` (4 px threshold so clicks and
 * double-click rename still work, Esc cancels), React state only when the target changes, the
 * floating label moved through direct style updates.
 *
 * Args:
 *   library: Current library (read when the drop happens).
 *   dispatch: Applies the drop.
 *   onItemsTrashed: Called after items were dropped on 垃圾桶 (for the confirmation toast).
 *
 * Returns:
 *   hint: Drop under the pointer; dragging: what is dragged; startDrag: pointer-down handler;
 *   ghostRef: ref for the floating label.
 */
export function useLibraryDrag(library: Library, dispatch: (action: LibraryAction) => void, onItemsTrashed: (count: number) => void) {
  const [hint, setHint] = useState<LibraryDropHint | null>(null);
  const [dragging, setDragging] = useState<LibraryDragPayload | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const libraryRef = useRef(library);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    libraryRef.current = library;
  }, [library]);
  useEffect(() => () => cancelRef.current?.(), []);

  const startDrag = useCallback(
    (payload: LibraryDragPayload, event: ReactPointerEvent, onDragStart?: () => void) => {
      if (event.button !== 0 || cancelRef.current) return;
      let target: LibraryDropTarget | null = null;
      let result: LibraryDropResult = null;

      const update = (x: number, y: number): void => {
        const next = targetAt(x, y, payload);
        if (sameTarget(next, target)) return;
        target = next;
        result = next ? libraryDropResult(libraryRef.current, payload, next, new Date().toISOString()) : null;
        const valid = result !== null && "action" in result;
        setHint(result === null || target === null ? null : { target, valid });
        // 不能放的地方顯示禁止游標（startPointerDrag 結束時會清掉）
        document.body.style.cursor = result !== null && !valid ? "not-allowed" : "grabbing";
      };

      cancelRef.current = startPointerDrag(event, {
        onStart: (e) => {
          onDragStart?.();
          setDragging(payload);
          update(e.clientX, e.clientY);
        },
        onMove: (e) => {
          update(e.clientX, e.clientY);
          moveDragGhost(ghostRef.current, e.clientX, e.clientY);
        },
        onEnd: (commit) => {
          setHint(null);
          setDragging(null);
          const final = result as LibraryDropResult;
          if (!commit || final === null) return;
          if ("error" in final) {
            toast.error(final.error);
            return;
          }
          dispatch(final.action);
          if (final.action.type === "item/trash") onItemsTrashed(final.action.ids.length);
        },
        onDone: () => {
          cancelRef.current = null;
        },
      });
    },
    [dispatch, onItemsTrashed],
  );

  return { hint, dragging, startDrag, ghostRef };
}
