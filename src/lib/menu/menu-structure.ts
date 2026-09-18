import type { CommandId } from "./commands";
import type { KeyboardEventLike } from "./shortcut";

export type MenuNode =
  | { readonly kind: "item"; readonly command: CommandId }
  | { readonly kind: "separator" }
  | { readonly kind: "submenu"; readonly label: string; readonly children: readonly MenuNode[] }
  | { readonly kind: "radio"; readonly options: readonly CommandId[]; readonly selected: CommandId };

export interface MenuDefinition {
  readonly id: string;
  readonly label: string;
  /** Alt+letter mnemonic (Windows convention), matched by physical key code. */
  readonly mnemonic: { readonly code: string; readonly letter: string };
  readonly items: readonly MenuNode[];
}

const separator = { kind: "separator" } as const;

export const MENUS = [
  {
    id: "file",
    label: "檔案",
    mnemonic: { code: "KeyF", letter: "F" },
    items: [
      { kind: "item", command: "file.new" },
      { kind: "item", command: "file.open" },
      separator,
      { kind: "item", command: "file.save" },
      { kind: "item", command: "file.saveAs" },
      separator,
      {
        kind: "submenu",
        label: "匯入",
        children: [
          { kind: "item", command: "file.importImage" },
          { kind: "item", command: "file.importPages" },
        ],
      },
      {
        kind: "submenu",
        label: "匯出為",
        children: [
          { kind: "item", command: "file.exportPng" },
          { kind: "item", command: "file.exportJpeg" },
          separator,
          { kind: "item", command: "file.exportPdf" },
        ],
      },
    ],
  },
  {
    id: "settings",
    label: "設定",
    mnemonic: { code: "KeyS", letter: "S" },
    items: [
      { kind: "item", command: "settings.page" },
      { kind: "item", command: "settings.preferences" },
      separator,
      {
        kind: "submenu",
        label: "外觀",
        children: [
          {
            kind: "radio",
            options: ["settings.themeLight", "settings.themeDark", "settings.themeSystem"],
            // 主題切換尚未實作，固定顯示目前實際行為
            selected: "settings.themeSystem",
          },
        ],
      },
    ],
  },
] as const satisfies readonly MenuDefinition[];

export type MenuId = (typeof MENUS)[number]["id"];

/**
 * Lists every command referenced by menu nodes, depth-first.
 *
 * Args:
 *   nodes: Menu nodes.
 *
 * Returns:
 *   Command ids in menu order (duplicates preserved).
 */
export function collectCommands(nodes: readonly MenuNode[]): CommandId[] {
  return nodes.flatMap((node): CommandId[] => {
    switch (node.kind) {
      case "item":
        return [node.command];
      case "submenu":
        return collectCommands(node.children);
      case "radio":
        return [...node.options];
      case "separator":
        return [];
      default: {
        const exhaustive: never = node;
        return exhaustive;
      }
    }
  });
}

/**
 * Finds the menu opened by an Alt+letter mnemonic.
 *
 * Args:
 *   event: Keyboard event.
 *
 * Returns:
 *   Menu id, or null when the event is not a mnemonic.
 */
export function findMenuByMnemonic(event: KeyboardEventLike): MenuId | null {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  return MENUS.find((menu) => menu.mnemonic.code === event.code)?.id ?? null;
}
