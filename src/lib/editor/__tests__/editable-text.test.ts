import { describe, expect, it } from "vitest";
import { fromEditableText, toEditableText } from "../editable-text";

describe("editable text", () => {
  it("adds Chrome's placeholder newline after a trailing newline", () => {
    expect(toEditableText("ab")).toBe("ab");
    expect(toEditableText("a\n")).toBe("a\n\n");
    expect(toEditableText("a\n\n")).toBe("a\n\n\n");
    expect(toEditableText("")).toBe("");
  });

  it("reads what Chrome leaves after typing (measured in Edge)", () => {
    // 「ab」後按 Enter
    expect(fromEditableText("ab\n\n")).toBe("ab\n");
    // 再打「cd」：佔位被取代
    expect(fromEditableText("ab\ncd")).toBe("ab\ncd");
    // 「cd」後按兩次 Enter
    expect(fromEditableText("ab\ncd\n\n\n")).toBe("ab\ncd\n\n");
    expect(fromEditableText("")).toBe("");
  });

  it("round-trips any text", () => {
    for (const text of ["", "a", "a\n", "a\n\n", "\n", "a\nb", "a\n\nb\n"]) {
      expect(fromEditableText(toEditableText(text))).toBe(text);
    }
  });
});
