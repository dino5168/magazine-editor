import { describe, expect, it, vi } from "vitest";
import {
  COMMAND_IDS,
  createPlaceholderHandlers,
  findCommandByEvent,
  getCommand,
  getCommandTitle,
  panelCommandId,
  settingsCommandId,
  viewCommandId,
  type CommandId,
} from "../commands";
import { getPanelCategory, PANEL_CATEGORIES, PANEL_IDS, panelsIn, type PanelId } from "@/lib/dock/panels";
import { SETTINGS_PAGES } from "@/lib/preferences/settings-pages";
import { VIEW_TOGGLES } from "@/lib/preferences/view-toggles";
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

  it("orders the menus 檔案、專案管理、設定、視圖、工具面板", () => {
    expect(MENUS.map((menu) => menu.id)).toEqual(["file", "project", "settings", "view", "panels"]);
    expect(MENUS.map((menu) => menu.label)).toEqual(["檔案", "專案管理", "設定", "視圖", "工具面板"]);
  });

  it("opens 素材管理 from 專案管理, not from 檔案", () => {
    const project = MENUS.find((menu) => menu.id === "project")!;
    const file = MENUS.find((menu) => menu.id === "file")!;

    expect(project.items).toEqual([{ kind: "item", command: "project.library" }]);
    expect(collectCommands(file.items)).not.toContain("project.library");
  });

  it("lists the tool panels by category (separators between categories), then 重設版面", () => {
    const panels = MENUS.find((menu) => menu.id === "panels")!;
    const checkbox = (id: PanelId) => ({ kind: "checkbox", command: panelCommandId(id) });
    const separator = { kind: "separator" };

    expect(panels.items).toEqual([
      ...(["templates", "text", "elements", "upload", "background", "draw"] as const).map(checkbox),
      separator,
      ...(["properties", "styles"] as const).map(checkbox),
      separator,
      ...(["pages", "layers"] as const).map(checkbox),
      separator,
      { kind: "item", command: "panel.resetLayout" },
    ]);
    expect(getCommandTitle(panelCommandId("layers"))).toBe("工具面板：圖層");
  });

  it("keeps the panel definitions grouped by category in category order", () => {
    const order = PANEL_CATEGORIES.map((category) => category.id);
    const categories = PANEL_IDS.map(getPanelCategory);
    // 定義順序 = 選單順序：類別依 PANEL_CATEGORIES 排、同類別連續
    expect(categories).toEqual([...categories].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    expect(order.flatMap((id) => panelsIn(id))).toEqual(PANEL_IDS);
  });

  it("keeps 設定 to 文件 ▸, 偏好設定 ▸ and 外觀 ▸ (工具面板 moved to the menu bar)", () => {
    const settings = MENUS.find((menu) => menu.id === "settings")!;

    expect(settings.items.map((node) => (node.kind === "submenu" ? node.label : node.kind))).toEqual([
      "文件",
      "偏好設定",
      "separator",
      "外觀",
    ]);
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
        { kind: "item", command: "settings.swatches" },
        { kind: "item", command: "settings.fonts" },
      ],
    });
    expect(preferences).toEqual({
      kind: "submenu",
      label: "偏好設定",
      children: [
        { kind: "item", command: "settings.grid" },
        { kind: "item", command: "settings.mcp" },
      ],
    });
    // 每個設定頁都有指令，指令名稱就是選單文字
    for (const page of SETTINGS_PAGES) expect(getCommand(settingsCommandId(page.id)).label).toBe(page.label);
    expect(getCommandTitle("settings.grid")).toBe("格線與參考線");
  });

  it("lists 尺規, then 格線 / 內容區對齊線 / 邊界參考線 / 吸附格線 as checkboxes under 視圖", () => {
    const view = MENUS.find((menu) => menu.id === "view")!;

    expect(view.items).toEqual([
      { kind: "checkbox", command: "view.rulers" },
      { kind: "separator" },
      { kind: "checkbox", command: "view.grid" },
      { kind: "checkbox", command: "view.contentGuides" },
      { kind: "checkbox", command: "view.margins" },
      { kind: "checkbox", command: "view.snap" },
    ]);
    // 每個視圖開關都有指令，名稱來自 VIEW_TOGGLES
    for (const toggle of VIEW_TOGGLES) expect(getCommand(viewCommandId(toggle.id)).label).toBe(toggle.label);
    expect(getCommandTitle("view.rulers")).toBe("顯示尺規");
    expect(getCommandTitle("view.grid")).toBe("顯示格線");
    expect(getCommand("view.rulers").shortcut).toBeUndefined();
    expect(getCommand("view.contentGuides").shortcut).toBeUndefined();
    expect(["view.grid", "view.margins", "view.snap"].map((id) => formatShortcut(getCommand(id as CommandId).shortcut!))).toEqual([
      "Ctrl+'",
      "Ctrl+;",
      "Ctrl+Shift+'",
    ]);
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
    expect(findCommandByEvent(key("Quote", { ctrlKey: true }))).toBe("view.grid");
    expect(findCommandByEvent(key("Quote", { ctrlKey: true, shiftKey: true }))).toBe("view.snap");
    expect(findCommandByEvent(key("Semicolon", { ctrlKey: true }))).toBe("view.margins");
    expect(findCommandByEvent(key("Quote"))).toBeNull();
    expect(findCommandByEvent(key("KeyZ", { ctrlKey: true }))).toBeNull();
    expect(findCommandByEvent(key("KeyS"))).toBeNull();
  });
});

describe("findMenuByMnemonic", () => {
  it("opens menus with Alt+letter only", () => {
    expect(findMenuByMnemonic(key("KeyF", { altKey: true }))).toBe("file");
    expect(findMenuByMnemonic(key("KeyP", { altKey: true }))).toBe("project");
    expect(findMenuByMnemonic(key("KeyS", { altKey: true }))).toBe("settings");
    expect(findMenuByMnemonic(key("KeyV", { altKey: true }))).toBe("view");
    expect(findMenuByMnemonic(key("KeyW", { altKey: true }))).toBe("panels");
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
