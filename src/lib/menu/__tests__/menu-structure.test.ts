import { describe, expect, it, vi } from "vitest";
import {
  COMMAND_IDS,
  createPlaceholderHandlers,
  findCommandByEvent,
  getCommand,
  getCommandTitle,
  panelCommandId,
  settingsCommandId,
} from "../commands";
import { PANEL_IDS } from "@/lib/dock/panels";
import { SETTINGS_PAGES } from "@/lib/preferences/settings-pages";
import { MENUS, collectCommands, findMenuByMnemonic } from "../menu-structure";
import { formatShortcut, type KeyboardEventLike } from "../shortcut";

function key(code: string, modifiers: Partial<Omit<KeyboardEventLike, "code">> = {}): KeyboardEventLike {
  return { code, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...modifiers };
}

// 編輯器既有快捷鍵（lib/editor/use-editor-shortcuts.ts），選單快捷鍵不可與之衝突
const EDITOR_SHORTCUTS = [
  "Ctrl+Z",
  "Ctrl+Y",
  "Ctrl+Shift+Z",
  "Ctrl+D",
  "Ctrl+Home",
  "Ctrl+End",
  "Ctrl+Shift+PageUp",
  "Ctrl+Shift+PageDown",
];

describe("menu structure", () => {
  it("places every command in the menus exactly once", () => {
    const used = MENUS.flatMap((menu) => collectCommands(menu.items));

    expect([...used].sort()).toEqual([...COMMAND_IDS].sort());
  });

  it("has no duplicate shortcuts and no conflicts with editor shortcuts", () => {
    const shortcuts = COMMAND_IDS.map((id) => getCommand(id).shortcut)
      .filter((shortcut) => shortcut !== undefined)
      .map(formatShortcut);

    expect(new Set(shortcuts).size).toBe(shortcuts.length);
    expect(shortcuts.filter((s) => EDITOR_SHORTCUTS.includes(s))).toEqual([]);
  });

  it("lists every tool panel as a checkbox under 設定 → 工具面板, then 重設版面", () => {
    const settings = MENUS.find((menu) => menu.id === "settings")!;
    const submenu = settings.items.find((node) => node.kind === "submenu" && node.label === "工具面板");

    expect(submenu?.kind === "submenu" && submenu.children).toEqual([
      ...PANEL_IDS.map((id) => ({ kind: "checkbox", command: panelCommandId(id) })),
      { kind: "separator" },
      { kind: "item", command: "panel.resetLayout" },
    ]);
    expect(getCommandTitle(panelCommandId("layers"))).toBe("工具面板：圖層");
  });

  it("opens with 設定 → 文件 ▸ and 偏好設定 ▸, built from the settings page list", () => {
    const settings = MENUS.find((menu) => menu.id === "settings")!;
    const [document, preferences] = settings.items;

    expect(document).toEqual({
      kind: "submenu",
      label: "文件",
      children: [
        { kind: "item", command: "settings.pageSetup" },
        { kind: "item", command: "settings.pageNumbers" },
      ],
    });
    expect(preferences).toEqual({ kind: "submenu", label: "偏好設定", children: [{ kind: "item", command: "settings.grid" }] });
    // 每個設定頁都有指令，指令名稱就是選單文字
    for (const page of SETTINGS_PAGES) expect(getCommand(settingsCommandId(page.id)).label).toBe(page.label);
    expect(getCommandTitle("settings.grid")).toBe("格線與參考線");
  });

  it("uses unique mnemonics", () => {
    const codes = MENUS.map((menu) => menu.mnemonic.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("findCommandByEvent", () => {
  it("resolves shortcuts to commands", () => {
    expect(findCommandByEvent(key("KeyS", { ctrlKey: true }))).toBe("file.save");
    expect(findCommandByEvent(key("KeyS", { ctrlKey: true, shiftKey: true }))).toBe("file.saveAs");
    expect(findCommandByEvent(key("Comma", { ctrlKey: true }))).toBe("settings.grid");
    expect(findCommandByEvent(key("KeyZ", { ctrlKey: true }))).toBeNull();
    expect(findCommandByEvent(key("KeyS"))).toBeNull();
  });
});

describe("findMenuByMnemonic", () => {
  it("opens menus with Alt+letter only", () => {
    expect(findMenuByMnemonic(key("KeyF", { altKey: true }))).toBe("file");
    expect(findMenuByMnemonic(key("KeyS", { altKey: true }))).toBe("settings");
    expect(findMenuByMnemonic(key("KeyF", { altKey: true, ctrlKey: true }))).toBeNull();
    expect(findMenuByMnemonic(key("KeyF"))).toBeNull();
  });
});

describe("placeholder handlers", () => {
  it("notifies with a readable title for every command", () => {
    const notify = vi.fn();
    const handlers = createPlaceholderHandlers(notify);

    for (const id of COMMAND_IDS) handlers[id]();

    expect(notify).toHaveBeenCalledTimes(COMMAND_IDS.length);
    expect(notify).toHaveBeenCalledWith("開啟");
    expect(notify).toHaveBeenCalledWith("匯出為 PNG");
    expect(getCommandTitle("file.saveAs")).toBe("另存新檔");
  });
});
