import { useState } from "react";
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { cn } from "@/lib/utils";
import type { CommandDisabledReason } from "@/lib/menu/command-availability";
import { getCommand, type CommandHandlers, type CommandId } from "@/lib/menu/commands";
import { MENUS, type MenuNode } from "@/lib/menu/menu-structure";
import { formatShortcut } from "@/lib/menu/shortcut";
import { useMenuShortcuts } from "@/lib/menu/use-menu-shortcuts";

interface MenuNodesProps {
  readonly nodes: readonly MenuNode[];
  readonly handlers: CommandHandlers;
  readonly isChecked: (command: CommandId) => boolean;
  readonly disabledReason: CommandDisabledReason;
}

function MenuNodes({ nodes, handlers, isChecked, disabledReason }: MenuNodesProps) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.kind) {
          case "item": {
            const command = getCommand(node.command);
            const reason = disabledReason(node.command);
            return (
              <MenubarItem key={node.command} disabled={reason !== undefined} onSelect={() => handlers[node.command]()}>
                {command.label}
                {reason && <span className="text-xs text-muted-foreground">（{reason}）</span>}
                {command.shortcut && (
                  <MenubarShortcut className="pl-6 tracking-normal">{formatShortcut(command.shortcut)}</MenubarShortcut>
                )}
              </MenubarItem>
            );
          }
          case "checkbox": {
            const command = getCommand(node.command);
            return (
              // checked 由外部狀態決定，不接 onCheckedChange：handler 負責切換，選單只反映結果
              <MenubarCheckboxItem
                key={node.command}
                checked={isChecked(node.command)}
                disabled={disabledReason(node.command) !== undefined}
                onSelect={() => handlers[node.command]()}
              >
                {command.label}
                {command.shortcut && (
                  <MenubarShortcut className="pl-6 tracking-normal">{formatShortcut(command.shortcut)}</MenubarShortcut>
                )}
              </MenubarCheckboxItem>
            );
          }
          case "separator":
            return <MenubarSeparator key={`separator-${index}`} />;
          case "submenu":
            return (
              <MenubarSub key={node.label}>
                <MenubarSubTrigger>{node.label}</MenubarSubTrigger>
                <MenubarSubContent className="min-w-44">
                  <MenuNodes nodes={node.children} handlers={handlers} isChecked={isChecked} disabledReason={disabledReason} />
                </MenubarSubContent>
              </MenubarSub>
            );
          case "radio":
            return (
              // value 固定不接 onValueChange：主題切換尚未實作，選取狀態不應改變
              <MenubarRadioGroup key={`radio-${index}`} value={node.selected}>
                {node.options.map((option) => (
                  <MenubarRadioItem key={option} value={option} onSelect={() => handlers[option]()}>
                    {getCommand(option).label}
                  </MenubarRadioItem>
                ))}
              </MenubarRadioGroup>
            );
          default: {
            const exhaustive: never = node;
            return exhaustive;
          }
        }
      })}
    </>
  );
}

interface AppMenubarProps {
  readonly handlers: CommandHandlers;
  /** Checked state of checkbox items (e.g. whether a tool panel is shown). */
  readonly isChecked: (command: CommandId) => boolean;
  /**
   * Why a command is disabled now (fixed reasons and ones that depend on the document). Read when
   * a menu opens (Radix mounts the items then), so it may read the latest state without making the
   * menu bar follow every edit.
   */
  readonly disabledReason: CommandDisabledReason;
  readonly className?: string;
}

/**
 * Application menu bar (File / Settings / View / Tool panels) rendered below the native title bar.
 *
 * Args:
 *   props.handlers: Command handlers invoked by menu items and shortcuts.
 *   props.isChecked: Checked state of checkbox items.
 *   props.disabledReason: Why a command is disabled now.
 *   props.className: Extra classes for grid placement.
 *
 * Returns:
 *   Menubar with Alt+letter mnemonics and global shortcuts.
 */
export function AppMenubar({ handlers, isChecked, disabledReason, className }: AppMenubarProps) {
  // 受控 value 讓 Alt+F / Alt+P / Alt+S / Alt+V / Alt+W 能以程式開啟選單（Radix Menubar 不支援助記鍵）。
  // 焦點不需自行處理：Alt+F 是真實 keydown，Radix Menu 會標記為鍵盤操作，開啟時自動聚焦第一個項目
  const [openMenu, setOpenMenu] = useState("");
  useMenuShortcuts({ handlers, onOpenMenu: setOpenMenu });

  return (
    <Menubar
      value={openMenu}
      onValueChange={setOpenMenu}
      className={cn("h-8 rounded-none border-0 border-b bg-background px-1.5", className)}
    >
      {MENUS.map((menu) => (
        <MenubarMenu key={menu.id} value={menu.id}>
          <MenubarTrigger className="px-2 font-normal" aria-keyshortcuts={`Alt+${menu.mnemonic.letter}`}>
            {menu.label}(<span className="underline underline-offset-2">{menu.mnemonic.letter}</span>)
          </MenubarTrigger>
          <MenubarContent className="min-w-60" sideOffset={2} alignOffset={0}>
            <MenuNodes nodes={menu.items} handlers={handlers} isChecked={isChecked} disabledReason={disabledReason} />
          </MenubarContent>
        </MenubarMenu>
      ))}
    </Menubar>
  );
}
