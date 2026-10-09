import { PANEL_DEFINITIONS, type PanelId } from "@/lib/dock/panels";
import { SETTINGS_PAGES, type SettingsPageId } from "@/lib/preferences/settings-pages";
import { VIEW_TOGGLES, type ViewToggleId } from "@/lib/preferences/view-toggles";
import { matchesShortcut, type KeyboardEventLike, type Shortcut } from "./shortcut";

export interface CommandDefinition {
  /** Text shown in the menu. */
  readonly label: string;
  /** Standalone name used in messages when the menu label needs context (e.g. "PNG..." → "匯出為 PNG"). */
  readonly title?: string;
  readonly shortcut?: Shortcut;
  /** When set, the command is disabled and the reason is shown next to the label. */
  readonly disabledReason?: string;
}

export type PanelCommandId = `panel.${PanelId}`;

/**
 * Returns the menu command that shows or hides a tool panel.
 *
 * Args:
 *   id: Panel id.
 *
 * Returns:
 *   Command id.
 */
export function panelCommandId(id: PanelId): PanelCommandId {
  return `panel.${id}`;
}

// 工具面板的開關指令由面板定義產生，新增面板不必改這裡
const PANEL_COMMANDS = Object.fromEntries(
  PANEL_DEFINITIONS.map(({ id, label }) => [panelCommandId(id), { label, title: `工具面板：${label}` }]),
) as Record<PanelCommandId, CommandDefinition>;

export type SettingsCommandId = `settings.${SettingsPageId}`;

/**
 * Returns the menu command that opens a settings page.
 *
 * Args:
 *   id: Settings page id.
 *
 * Returns:
 *   Command id.
 */
export function settingsCommandId(id: SettingsPageId): SettingsCommandId {
  return `settings.${id}`;
}

// 設定頁的指令由設定頁清單產生，新增設定頁不必改這裡
const SETTINGS_COMMANDS = Object.fromEntries(
  SETTINGS_PAGES.map((page) => {
    const command: CommandDefinition = { label: page.label, ...("shortcut" in page && { shortcut: page.shortcut }) };
    return [settingsCommandId(page.id), command];
  }),
) as Record<SettingsCommandId, CommandDefinition>;

export type ViewCommandId = `view.${ViewToggleId}`;

/**
 * Returns the 視圖 menu command that flips a view toggle.
 *
 * Args:
 *   id: View toggle id.
 *
 * Returns:
 *   Command id.
 */
export function viewCommandId(id: ViewToggleId): ViewCommandId {
  return `view.${id}`;
}

// 視圖的開關指令由 VIEW_TOGGLES 產生
const VIEW_COMMANDS = Object.fromEntries(
  VIEW_TOGGLES.map((toggle) => {
    const command: CommandDefinition = {
      label: toggle.label,
      title: toggle.title,
      ...("shortcut" in toggle && { shortcut: toggle.shortcut }),
    };
    return [viewCommandId(toggle.id), command];
  }),
) as Record<ViewCommandId, CommandDefinition>;

// 選單項目與快捷鍵的單一資料來源；新增指令時必須同時在 CommandHandlers 提供實作（mapped type 會檢查）
export const COMMANDS = {
  "file.new": { label: "新增", shortcut: { ctrl: true, code: "KeyN", keyLabel: "N" } },
  "file.open": { label: "開啟...", shortcut: { ctrl: true, code: "KeyO", keyLabel: "O" } },
  "file.save": { label: "儲存", shortcut: { ctrl: true, code: "KeyS", keyLabel: "S" } },
  "file.saveAs": { label: "另存新檔...", shortcut: { ctrl: true, shift: true, code: "KeyS", keyLabel: "S" } },
  "file.library": { label: "素材管理..." },
  "file.importImage": { label: "圖片...", title: "匯入圖片" },
  "file.importPages": { label: "其他專案的頁面...", title: "匯入其他專案的頁面" },
  "file.exportPng": { label: "PNG...", title: "匯出為 PNG" },
  "file.exportJpeg": { label: "JPEG...", title: "匯出為 JPEG" },
  "file.exportPdf": { label: "PDF...", title: "匯出為 PDF" },
  "file.exportEpub": { label: "EPUB...", title: "匯出為 EPUB" },
  ...VIEW_COMMANDS,
  ...SETTINGS_COMMANDS,
  "settings.themeLight": { label: "淺色", title: "外觀：淺色" },
  "settings.themeDark": { label: "深色", title: "外觀：深色" },
  "settings.themeSystem": { label: "跟隨系統", title: "外觀：跟隨系統" },
  ...PANEL_COMMANDS,
  "panel.resetLayout": { label: "重設版面", title: "重設工具面板版面" },
} as const satisfies Record<string, CommandDefinition>;

export type CommandId = keyof typeof COMMANDS;

export type CommandHandlers = { readonly [K in CommandId]: () => void };

export const COMMAND_IDS = Object.keys(COMMANDS) as readonly CommandId[];

/**
 * Returns a command definition with the widened interface type.
 *
 * Args:
 *   id: Command id.
 *
 * Returns:
 *   Command definition.
 */
export function getCommand(id: CommandId): CommandDefinition {
  return COMMANDS[id];
}

/**
 * Returns the name used in messages: the explicit title, or the label without a trailing "...".
 *
 * Args:
 *   id: Command id.
 *
 * Returns:
 *   Display title.
 */
export function getCommandTitle(id: CommandId): string {
  const command = getCommand(id);
  return command.title ?? command.label.replace(/\.{3}$/, "");
}

/**
 * Finds the enabled command whose shortcut matches a keyboard event.
 *
 * Args:
 *   event: Keyboard event.
 *
 * Returns:
 *   Matching command id, or null.
 */
export function findCommandByEvent(event: KeyboardEventLike): CommandId | null {
  return (
    COMMAND_IDS.find((id) => {
      const { shortcut, disabledReason } = getCommand(id);
      return shortcut !== undefined && disabledReason === undefined && matchesShortcut(event, shortcut);
    }) ?? null
  );
}

/**
 * Creates handlers that only report the command as not implemented yet.
 *
 * Args:
 *   notify: Called with the command title when a command runs.
 *
 * Returns:
 *   A handler for every command.
 */
export function createPlaceholderHandlers(notify: (title: string) => void): CommandHandlers {
  const entries = COMMAND_IDS.map((id) => {
    const handler = () => notify(getCommandTitle(id));
    PLACEHOLDER_HANDLERS.add(handler);
    return [id, handler] as const;
  });
  // Object.fromEntries 無法保留 key 型別；entries 由 COMMAND_IDS 產生，涵蓋所有 CommandId
  return Object.fromEntries(entries) as CommandHandlers;
}

// 佔位 handler 本身做記號：覆寫成真正的實作後自然不在這裡（MCP 用來回報「尚未實作」）
const PLACEHOLDER_HANDLERS = new WeakSet<() => void>();

/**
 * Whether a handler is still the placeholder from `createPlaceholderHandlers`.
 *
 * Args:
 *   handler: A command handler.
 *
 * Returns:
 *   True when running it would only report "not implemented".
 */
export function isPlaceholderHandler(handler: () => void): boolean {
  return PLACEHOLDER_HANDLERS.has(handler);
}
