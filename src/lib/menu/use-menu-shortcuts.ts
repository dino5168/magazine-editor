import { useEffect, useRef } from "react";
import { findCommandByEvent, type CommandHandlers } from "./commands";
import { findMenuByMnemonic, type MenuId } from "./menu-structure";

interface UseMenuShortcutsOptions {
  readonly handlers: CommandHandlers;
  readonly onOpenMenu: (id: MenuId) => void;
}

// 對話框開啟時不觸發檔案類快捷鍵，避免在確認視窗中誤觸儲存等動作
function isInsideDialog(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[role="dialog"], [role="alertdialog"]') !== null;
}

/**
 * Registers global menu shortcuts (Ctrl+N/O/S…) and Alt+letter mnemonics.
 *
 * 與編輯器快捷鍵不同，檔案類快捷鍵在輸入框與文字編輯中也要生效（與 Word、draw.io 一致）。
 *
 * Args:
 *   options.handlers: Command handlers.
 *   options.onOpenMenu: Opens a top-level menu.
 */
export function useMenuShortcuts({ handlers, onOpenMenu }: UseMenuShortcutsOptions): void {
  const latest = useRef({ handlers, onOpenMenu });

  useEffect(() => {
    latest.current = { handlers, onOpenMenu };
  }, [handlers, onOpenMenu]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing || event.defaultPrevented || isInsideDialog(event.target)) return;

      const menu = findMenuByMnemonic(event);
      if (menu) {
        event.preventDefault();
        latest.current.onOpenMenu(menu);
        return;
      }

      const command = findCommandByEvent(event);
      if (command) {
        // 阻止 WebView2 預設行為（例如 Ctrl+S 另存網頁、Ctrl+O 開檔）
        event.preventDefault();
        latest.current.handlers[command]();
      }
    };
    // capture 階段註冊，確保焦點在任何元件內都能先收到
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
}
