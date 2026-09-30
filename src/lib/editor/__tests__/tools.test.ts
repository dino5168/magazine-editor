import { describe, expect, it } from "vitest";
import { COMMAND_IDS, getCommand } from "@/lib/menu/commands";
import type { KeyboardEventLike } from "@/lib/menu/shortcut";
import { TOOL_DEFINITIONS, TOOL_SHORTCUTS, findToolShortcut, getToolKeyLabel, getToolLabel } from "../tools";

function key(code: string, modifiers: Partial<Omit<KeyboardEventLike, "code">> = {}): KeyboardEventLike {
  return { code, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...modifiers };
}

describe("tools", () => {
  it("has unique tool ids and shortcut keys", () => {
    const ids = TOOL_DEFINITIONS.map((tool) => tool.id);
    const codes = TOOL_SHORTCUTS.map((shortcut) => shortcut.code);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(codes).size).toBe(codes.length);
    expect(getToolLabel("hand")).toBe("手形");
  });

  it("gives every shape shortcut a shape and no other shortcut one", () => {
    for (const shortcut of TOOL_SHORTCUTS) {
      expect(shortcut.shape !== undefined).toBe(shortcut.tool === "shape");
    }
  });

  it("matches plain keys only", () => {
    expect(findToolShortcut(key("KeyV"))?.tool).toBe("select");
    expect(findToolShortcut(key("KeyR"))).toMatchObject({ tool: "shape", shape: "rect" });
    expect(findToolShortcut(key("KeyV", { ctrlKey: true }))).toBeNull();
    expect(findToolShortcut(key("KeyT", { shiftKey: true }))).toBeNull();
    expect(findToolShortcut(key("KeyQ"))).toBeNull();
  });

  it("never collides with menu shortcuts", () => {
    // 選單快捷鍵都帶 Ctrl；工具快捷鍵不帶任何修飾鍵
    const menuPlainKeys = COMMAND_IDS.map((id) => getCommand(id).shortcut)
      .filter((shortcut) => shortcut !== undefined && !shortcut.ctrl && !shortcut.shift && !shortcut.alt)
      .map((shortcut) => shortcut!.code);
    expect(menuPlainKeys.filter((code) => TOOL_SHORTCUTS.some((s) => s.code === code))).toEqual([]);
  });

  it("labels shortcuts for tooltips", () => {
    expect(getToolKeyLabel("select")).toBe("V");
    expect(getToolKeyLabel("shape", "ellipse")).toBe("O");
    expect(getToolKeyLabel("shape", "star")).toBeNull();
  });
});
