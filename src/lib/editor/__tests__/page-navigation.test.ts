import { describe, expect, it } from "vitest";
import { findPageShortcut, parsePageNumber, stepPageIndex } from "../page-navigation";

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe("parsePageNumber", () => {
  it("converts a 1-based page number to a 0-based index", () => {
    expect(parsePageNumber("1", 120)).toBe(0);
    expect(parsePageNumber(" 12 ", 120)).toBe(11);
  });

  it("clamps numbers outside the document to the first / last page", () => {
    expect(parsePageNumber("0", 120)).toBe(0);
    expect(parsePageNumber("999", 120)).toBe(119);
  });

  it("rejects text that is not a whole number", () => {
    for (const draft of ["", "  ", "abc", "1.5", "-3", "1e2", "１２"]) expect(parsePageNumber(draft, 120)).toBeNull();
  });
});

describe("stepPageIndex", () => {
  it("moves to the previous / next / first / last page", () => {
    expect(stepPageIndex("prev", 5, 10)).toBe(4);
    expect(stepPageIndex("next", 5, 10)).toBe(6);
    expect(stepPageIndex("first", 5, 10)).toBe(0);
    expect(stepPageIndex("last", 5, 10)).toBe(9);
  });

  it("returns null when already at that end", () => {
    expect(stepPageIndex("prev", 0, 10)).toBeNull();
    expect(stepPageIndex("first", 0, 10)).toBeNull();
    expect(stepPageIndex("next", 9, 10)).toBeNull();
    expect(stepPageIndex("last", 9, 10)).toBeNull();
    expect(stepPageIndex("next", 0, 1)).toBeNull();
  });
});

describe("findPageShortcut", () => {
  it("maps PageUp / PageDown and Ctrl+Home / Ctrl+End", () => {
    expect(findPageShortcut(key("PageUp"))).toBe("prev");
    expect(findPageShortcut(key("PageDown"))).toBe("next");
    expect(findPageShortcut(key("Home", { ctrlKey: true }))).toBe("first");
    expect(findPageShortcut(key("End", { metaKey: true }))).toBe("last");
  });

  it("ignores other combinations", () => {
    expect(findPageShortcut(key("Home"))).toBeNull();
    expect(findPageShortcut(key("End"))).toBeNull();
    expect(findPageShortcut(key("PageDown", { ctrlKey: true }))).toBeNull();
    expect(findPageShortcut(key("PageUp", { shiftKey: true }))).toBeNull();
    expect(findPageShortcut(key("Home", { ctrlKey: true, altKey: true }))).toBeNull();
    expect(findPageShortcut(key("a"))).toBeNull();
  });
});
