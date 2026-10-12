import { describe, expect, it } from "vitest";
import { distributeLine, distributeText, splitGraphemes } from "../text-distribute";

describe("splitGraphemes", () => {
  it("keeps clusters together like Konva", () => {
    expect(splitGraphemes("首尾AVa中")).toEqual(["首", "尾", "A", "V", "a", "中"]);
    expect(splitGraphemes("👍🏽é中")).toEqual(["👍🏽", "é", "中"]);
    expect(splitGraphemes("")).toEqual([]);
  });
});

describe("distributeLine", () => {
  it("puts the first character at the left edge and the last one at the right edge", () => {
    const line = distributeLine(["首", "尾", "置", "中"], [32, 32, 32, 32], 300);
    expect(line.gap).toBeCloseTo((300 - 128) / 3);
    expect(line.xs[0]).toBe(0);
    expect(line.xs[3] + 32).toBeCloseTo(300);
    expect(line.width).toBe(300);
  });

  it("spreads characters of different widths by equal gaps", () => {
    const line = distributeLine(["A", "i", "W"], [20, 5, 30], 100);
    expect(line.gap).toBeCloseTo(22.5);
    expect(line.xs).toEqual([0, 42.5, 70]);
  });

  it("centres a single character", () => {
    expect(distributeLine(["中"], [32], 100)).toEqual({ chars: ["中"], xs: [34], width: 32, gap: 0 });
  });

  it("ignores trailing white space", () => {
    const line = distributeLine(["A", " ", "B", " ", " "], [10, 4, 10, 4, 4], 100);
    expect(line.chars).toEqual(["A", " ", "B"]);
    expect(line.xs[2] + 10).toBeCloseTo(100);
    expect(distributeLine(["中", " "], [32, 4], 100).xs).toEqual([34]);
  });

  it("draws nothing for an empty or blank line", () => {
    expect(distributeLine([], [], 100)).toEqual({ chars: [], xs: [], width: 0, gap: 0 });
    expect(distributeLine([" ", " "], [4, 4], 100)).toEqual({ chars: [], xs: [], width: 0, gap: 0 });
  });

  it("overlaps characters wider than the box so the line still fits", () => {
    const line = distributeLine(["W", "W"], [60, 60], 100);
    expect(line.gap).toBe(-20);
    expect(line.xs).toEqual([0, 40]);
    expect(line.width).toBe(100);
  });
});

describe("distributeText", () => {
  it("measures every character on its own", () => {
    const measured: string[] = [];
    const line = distributeText("首尾 中", (char) => (measured.push(char), char === " " ? 8 : 32), 200);
    expect(measured).toEqual(["首", "尾", " ", "中"]);
    expect(line.gap).toBeCloseTo((200 - 104) / 3);
    expect(line.xs[3] + 32).toBeCloseTo(200);
  });
});
