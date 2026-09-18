import { describe, expect, it } from "vitest";
import { formatShortcut, matchesShortcut, type KeyboardEventLike } from "../shortcut";

function key(code: string, modifiers: Partial<Omit<KeyboardEventLike, "code">> = {}): KeyboardEventLike {
  return { code, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...modifiers };
}

const save = { ctrl: true, code: "KeyS", keyLabel: "S" };
const saveAs = { ctrl: true, shift: true, code: "KeyS", keyLabel: "S" };

describe("matchesShortcut", () => {
  it("matches the exact modifier combination", () => {
    expect(matchesShortcut(key("KeyS", { ctrlKey: true }), save)).toBe(true);
    expect(matchesShortcut(key("KeyS", { ctrlKey: true, shiftKey: true }), save)).toBe(false);
    expect(matchesShortcut(key("KeyS", { ctrlKey: true, shiftKey: true }), saveAs)).toBe(true);
    expect(matchesShortcut(key("KeyS"), save)).toBe(false);
    expect(matchesShortcut(key("KeyS", { ctrlKey: true, altKey: true }), save)).toBe(false);
  });

  it("treats Meta as Ctrl", () => {
    expect(matchesShortcut(key("KeyS", { metaKey: true }), save)).toBe(true);
  });

  it("matches by physical key regardless of the produced character", () => {
    // 注音輸入法下 event.key 可能是 "Process"，但 code 仍為 KeyS
    expect(matchesShortcut(key("KeyS", { ctrlKey: true }), save)).toBe(true);
    expect(matchesShortcut(key("KeyD", { ctrlKey: true }), save)).toBe(false);
  });
});

describe("formatShortcut", () => {
  it("orders modifiers as Ctrl, Shift, Alt", () => {
    expect(formatShortcut(saveAs)).toBe("Ctrl+Shift+S");
    expect(formatShortcut({ ctrl: true, code: "Comma", keyLabel: "," })).toBe("Ctrl+,");
    expect(formatShortcut({ alt: true, shift: true, code: "KeyF", keyLabel: "F" })).toBe("Shift+Alt+F");
  });
});
