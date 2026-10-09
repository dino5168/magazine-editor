/**
 * MCP 的指令工具：列出與執行選單指令（`COMMANDS`），和選單、快捷鍵呼叫同一個 handler。
 *
 * 會開對話框的指令（開啟、另存、匯出…）只負責觸發：結果由使用者在 App 裡決定，工具不等待。
 */
import {
  COMMAND_IDS,
  getCommand,
  getCommandTitle,
  isPlaceholderHandler,
  type CommandHandlers,
  type CommandId,
} from "@/lib/menu/commands";
import { MENUS, type MenuNode } from "@/lib/menu/menu-structure";
import { formatShortcut } from "@/lib/menu/shortcut";
import type { Result } from "@/lib/editor/validation";

/** What the command tools need from the app (built in `home-page.tsx`). */
export interface CommandAccess {
  readonly handlers: CommandHandlers;
  /** Checked state of checkbox commands (視圖, 工具面板). */
  readonly isChecked: (id: CommandId) => boolean;
}

export interface CommandSummary {
  readonly id: CommandId;
  readonly name: string;
  /** Where it is in the menu bar, e.g. `檔案 › 匯出為 › PDF...`. */
  readonly menu: string;
  readonly shortcut: string | null;
  /** Only for checkbox commands: whether it is on now. */
  readonly checked?: boolean;
  readonly available: boolean;
  /** Why it cannot run: disabled, or not implemented yet. */
  readonly unavailableReason?: string;
}

interface MenuEntry {
  readonly path: string;
  readonly checkbox: boolean;
}

function collectEntries(nodes: readonly MenuNode[], path: string, into: Map<CommandId, MenuEntry>): void {
  for (const node of nodes) {
    switch (node.kind) {
      case "item":
      case "checkbox":
        into.set(node.command, {
          path: `${path} › ${getCommand(node.command).label}`,
          checkbox: node.kind === "checkbox",
        });
        break;
      case "radio":
        for (const command of node.options) {
          into.set(command, { path: `${path} › ${getCommand(command).label}`, checkbox: false });
        }
        break;
      case "submenu":
        collectEntries(node.children, `${path} › ${node.label}`, into);
        break;
      case "separator":
        break;
      default: {
        const exhaustive: never = node;
        return exhaustive;
      }
    }
  }
}

// 選單結構是靜態的，算一次即可；每個指令都在選單裡出現恰好一次（menu-structure.test.ts 守著）
const MENU_ENTRIES: ReadonlyMap<CommandId, MenuEntry> = (() => {
  const entries = new Map<CommandId, MenuEntry>();
  for (const menu of MENUS) collectEntries(menu.items, menu.label, entries);
  return entries;
})();

function unavailableReason(access: CommandAccess, id: CommandId): string | undefined {
  const { disabledReason } = getCommand(id);
  if (disabledReason !== undefined) return disabledReason;
  if (isPlaceholderHandler(access.handlers[id])) return "尚未實作";
  return undefined;
}

/**
 * Every menu command with where to find it and whether it can run (tool `list_commands`).
 *
 * Args:
 *   access: Handlers and checked state from the app.
 *
 * Returns:
 *   Commands in menu order.
 */
export function listCommands(access: CommandAccess): CommandSummary[] {
  return COMMAND_IDS.map((id) => {
    const entry = MENU_ENTRIES.get(id);
    const { shortcut } = getCommand(id);
    const reason = unavailableReason(access, id);
    return {
      id,
      name: getCommandTitle(id),
      menu: entry?.path ?? "",
      shortcut: shortcut ? formatShortcut(shortcut) : null,
      ...(entry?.checkbox && { checked: access.isChecked(id) }),
      available: reason === undefined,
      ...(reason !== undefined && { unavailableReason: reason }),
    };
  });
}

/**
 * Runs a menu command like clicking it in the menu (tool `run_command`).
 *
 * Args:
 *   access: Handlers and checked state from the app.
 *   id: Command to run (already validated against `COMMAND_IDS`).
 *
 * Returns:
 *   What happened, or an error when the command is disabled or not implemented (nothing runs).
 */
export function runCommand(
  access: CommandAccess,
  id: CommandId,
): Result<{ id: CommandId; name: string; checked?: boolean; note: string }> {
  const name = getCommandTitle(id);
  const reason = unavailableReason(access, id);
  if (reason !== undefined) return { data: null, error: new Error(`「${name}」目前不能執行：${reason}`) };
  const checkbox = MENU_ENTRIES.get(id)?.checkbox ?? false;
  const before = checkbox ? access.isChecked(id) : undefined;
  access.handlers[id]();
  return {
    data: {
      id,
      name,
      // 勾選項目按一下就是切換；畫面要到下一次 render 才更新，所以由執行前的狀態推算
      ...(before !== undefined && { checked: !before }),
      note: "已在 App 執行。若 App 顯示對話框（開啟、另存、匯出、設定…），要由使用者在 App 裡完成，這個工具不等待結果。",
    },
    error: null,
  };
}
