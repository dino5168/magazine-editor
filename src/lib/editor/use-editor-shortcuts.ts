import { useEffect } from "react";
import { selectSelectedElement } from "./editor-reducer";
import { useEditorDispatch, useEditorState } from "./editor-context";
import { createId } from "./element-factory";
import { findPageShortcut, stepPageIndex } from "./page-navigation";
import { findToolShortcut } from "./tools";

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
 * Registers global keyboard shortcuts for the editor (delete, undo/redo, duplicate, deselect, nudge,
 * tool keys, page switching).
 */
export function useEditorShortcuts(): void {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const selected = selectSelectedElement(state);
  const { tool, activePageId } = state;
  const { pages } = state.history.present;

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
      // Ctrl+D 以實體按鍵比對；WebView2 預設是「加入我的最愛」，一律攔下
      if (mod && !event.shiftKey && !event.altKey && event.code === "KeyD") {
        event.preventDefault();
        if (selected) dispatch({ type: "element/duplicate", id: selected.id, newId: createId() });
        return;
      }
      // PageUp / PageDown / Ctrl+Home / Ctrl+End 換頁；按住不放可以連續翻頁
      const pageStep = findPageShortcut(event);
      if (pageStep) {
        event.preventDefault();
        const index = stepPageIndex(pageStep, pages.findIndex((page) => page.id === activePageId), pages.length);
        if (index !== null) dispatch({ type: "page/select", id: pages[index].id });
        return;
      }
      // 按住不放會連續觸發 keydown，工具鍵只處理第一次；選字中（isComposing）不當成快捷鍵
      const toolShortcut = event.repeat || event.isComposing ? null : findToolShortcut(event);
      if (toolShortcut) {
        event.preventDefault();
        dispatch({ type: "tool/set", tool: toolShortcut.tool, shape: toolShortcut.shape });
        return;
      }
      if (event.key === "Escape" && !selected && tool !== "select") {
        dispatch({ type: "tool/set", tool: "select" });
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
  }, [dispatch, selected, tool, pages, activePageId]);
}
