import { useEffect } from "react";
import { selectSelectedElement } from "./editor-reducer";
import { useEditorDispatch, useEditorState } from "./editor-context";

const NUDGE_PT = 1;
const NUDGE_LARGE_PT = 10;

const ARROW_DELTAS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

// 焦點在輸入元件或對話框/選單內時不攔截，避免打字時誤刪物件
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest("input, textarea, select")) return true;
  return target.closest('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;
}

/**
 * Registers global keyboard shortcuts for the editor (delete, undo/redo, deselect, nudge).
 */
export function useEditorShortcuts(): void {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const selected = selectSelectedElement(state);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (mod && key === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "history/redo" : "history/undo" });
        return;
      }
      if (mod && key === "y") {
        event.preventDefault();
        dispatch({ type: "history/redo" });
        return;
      }
      if (!selected) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        dispatch({ type: "element/delete", id: selected.id });
      } else if (event.key === "Escape") {
        dispatch({ type: "selection/set", id: null });
      } else if (event.key in ARROW_DELTAS && !mod) {
        event.preventDefault();
        const [dx, dy] = ARROW_DELTAS[event.key];
        const step = event.shiftKey ? NUDGE_LARGE_PT : NUDGE_PT;
        dispatch({ type: "element/update", id: selected.id, patch: { x: selected.x + dx * step, y: selected.y + dy * step } });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch, selected]);
}
