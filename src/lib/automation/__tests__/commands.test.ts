import { describe, expect, it } from "vitest";
import { createInitialState } from "@/lib/editor/editor-reducer";
import { COMMAND_IDS, createPlaceholderHandlers, isPlaceholderHandler, type CommandHandlers, type CommandId } from "@/lib/menu/commands";
import { listCommands, runCommand, type CommandAccess } from "../commands";
import { toolSession } from "./tool-session";

/** Placeholders everywhere except `implemented`, which record their calls. */
function access(implemented: readonly CommandId[], checked: readonly CommandId[] = []) {
  const calls: CommandId[] = [];
  const handlers: CommandHandlers = {
    ...createPlaceholderHandlers(() => {}),
    ...Object.fromEntries(implemented.map((id) => [id, () => calls.push(id)])),
  };
  const commands: CommandAccess = { handlers, isChecked: (id) => checked.includes(id) };
  return { commands, calls };
}

describe("isPlaceholderHandler", () => {
  it("marks only the placeholder handlers", () => {
    const handlers = createPlaceholderHandlers(() => {});
    expect(COMMAND_IDS.every((id) => isPlaceholderHandler(handlers[id]))).toBe(true);
    expect(isPlaceholderHandler(() => {})).toBe(false);
  });
});

describe("listCommands", () => {
  it("lists every command once with its menu path and shortcut", () => {
    const list = listCommands(access(["file.save"]).commands);
    expect(list.map((command) => command.id)).toEqual(COMMAND_IDS);
    expect(list.find((command) => command.id === "file.save")).toEqual({
      id: "file.save",
      name: "儲存",
      menu: "檔案 › 儲存",
      shortcut: "Ctrl+S",
      available: true,
    });
    expect(list.find((command) => command.id === "file.exportPdf")?.menu).toBe("檔案 › 匯出為 › PDF...");
    expect(list.every((command) => command.menu !== "")).toBe(true);
  });

  it("reports checkbox state and commands that are not implemented", () => {
    const list = listCommands(access(["view.grid"], ["view.grid"]).commands);
    expect(list.find((command) => command.id === "view.grid")).toMatchObject({ checked: true, available: true });
    expect(list.find((command) => command.id === "view.snap")).toMatchObject({ checked: false });
    expect(list.find((command) => command.id === "file.save")).not.toHaveProperty("checked");
    expect(list.find((command) => command.id === "file.exportPng")).toMatchObject({
      available: false,
      unavailableReason: "尚未實作",
    });
  });
});

describe("runCommand", () => {
  it("runs the menu handler once", () => {
    const { commands, calls } = access(["file.save"]);
    const result = runCommand(commands, "file.save");
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ id: "file.save", name: "儲存" });
    expect(result.data).not.toHaveProperty("checked");
    expect(calls).toEqual(["file.save"]);
  });

  it("returns the state a checkbox command switches to", () => {
    const { commands } = access(["view.grid", "view.snap"], ["view.grid"]);
    expect(runCommand(commands, "view.grid").data?.checked).toBe(false);
    expect(runCommand(commands, "view.snap").data?.checked).toBe(true);
  });

  it("does not run commands that are not implemented", () => {
    const shown: string[] = [];
    const commands: CommandAccess = {
      handlers: createPlaceholderHandlers((title) => shown.push(title)),
      isChecked: () => false,
    };
    const result = runCommand(commands, "file.exportPng");
    expect(result.error?.message).toBe("「匯出為 PNG」目前不能執行：尚未實作");
    // 佔位 handler 會在 App 顯示「尚未實作」的 toast；MCP 不應觸發它
    expect(shown).toEqual([]);
  });
});

describe("run_command tool", () => {
  it("rejects ids that are not commands", () => {
    const { commands } = access([]);
    expect(toolSession(createInitialState(), commands).error("run_command", { id: "file.format" })).toContain("參數 id");
  });
});
