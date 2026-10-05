import { useEffect } from "react";
import { selectSelectedElements } from "./editor-reducer";
import { useEditorDispatch, useEditorState } from "./editor-context";
import { findPageMoveShortcut, findPageShortcut, stepPageIndex } from "./page-navigation";
import { shiftedPageOrder } from "./page-order";
import { deleteSelection, duplicateSelection, nudgeSelection } from "./selection-actions";
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
  // 刪除、複製、方向鍵、Esc 都作用在整組選取
  const selected = selectSelectedElements(state);
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
        if (selected.length > 0) dispatch(duplicateSelection(selected));
        return;
      }
      // Ctrl+Shift+PageUp / PageDown 把目前頁面往前 / 往後移一格（每次一筆復原）
      const pageMove = findPageMoveShortcut(event);
      if (pageMove) {
        event.preventDefault();
        const order = shiftedPageOrder(pages, activePageId, pageMove);
        if (order) dispatch({ type: "page/reorder", order });
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
      if (event.key === "Escape" && selected.length === 0 && tool !== "select") {
        dispatch({ type: "tool/set", tool: "select" });
        return;
      }
      if (selected.length === 0) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        dispatch(deleteSelection(selected));
      } else if (event.key === "Escape") {
        dispatch({ type: "selection/set", id: null });
      } else if (event.key in ARROW_DELTAS && !mod) {
        event.preventDefault();
        const [dx, dy] = ARROW_DELTAS[event.key];
        const step = event.shiftKey ? NUDGE_LARGE_PT : NUDGE_PT;
        dispatch(nudgeSelection(selected, dx * step, dy * step));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch, selected, tool, pages, activePageId]);
}
