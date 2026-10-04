import { describe, expect, it } from "vitest";
import {
  createPage,
  createShapeElement,
  createTextElement,
  DEFAULT_FONT_FAMILY,
  DEFAULT_MARGINS,
} from "../element-factory";
import { DEFAULT_FONT_OPTION, findFontOption, FONT_OPTIONS, fontLoadRequests, fontOptionsFor, usedFontFamilies } from "../fonts";
import { createLabel } from "../shape-label";
import type { EditorDocument } from "../types";

const SIZE = { width: 595, height: 842 };

describe("FONT_OPTIONS", () => {
  it("uses the first option as the default font of new text", () => {
    expect(DEFAULT_FONT_OPTION).toBe(FONT_OPTIONS[0]);
    expect(DEFAULT_FONT_FAMILY).toBe(DEFAULT_FONT_OPTION.family);
    expect(DEFAULT_FONT_FAMILY).toBe('"Geist", "Noto Sans TC", sans-serif');
  });

  it("has unique ids, labels and family stacks", () => {
    for (const key of ["id", "label", "family"] as const) {
      const values = FONT_OPTIONS.map((option) => option[key]);
      expect(new Set(values).size).toBe(values.length);
    }
  });
});

describe("findFontOption", () => {
  it("matches stacks ignoring quotes, spacing and case", () => {
    expect(findFontOption('"Geist", "Noto Sans TC", sans-serif')).toBe(DEFAULT_FONT_OPTION);
    expect(findFontOption("geist,'noto sans tc',SANS-SERIF")).toBe(DEFAULT_FONT_OPTION);
    expect(findFontOption("'LXGW WenKai TC', serif")?.label).toBe("楷體");
  });

  it("returns undefined for families not in the menu", () => {
    expect(findFontOption('"Geist Variable", "Microsoft JhengHei", sans-serif')).toBeUndefined();
    expect(findFontOption('"Geist", sans-serif')).toBeUndefined();
  });
});

describe("usedFontFamilies", () => {
  it("collects text and shape-label families across all pages, sorted and distinct", () => {
    const text = { ...createTextElement("body", { x: 0, y: 0 }), fontFamily: "Zeta" };
    const plainShape = createShapeElement("rect", { x: 0, y: 0 });
    const labelled = { ...plainShape, id: "s2", label: { ...createLabel("A"), fontFamily: "Alpha" } };
    const document: EditorDocument = {
      name: "doc",
      margins: DEFAULT_MARGINS,
      pages: [
        { ...createPage("P1", SIZE, "#ffffff"), elements: [text, plainShape] },
        { ...createPage("P2", SIZE, "#ffffff"), elements: [labelled, { ...text, id: "t2" }] },
      ],
    };

    expect(usedFontFamilies(document)).toEqual(["Alpha", "Zeta"]);
  });
});

describe("fontOptionsFor", () => {
  it("adds the options a document uses after the default", () => {
    const [sans, serif, kai] = FONT_OPTIONS;
    expect(fontOptionsFor([kai.family, serif.family, sans.family])).toEqual([sans, kai, serif]);
  });

  it("always includes the default option once, and skips unknown families", () => {
    expect(fontOptionsFor([])).toEqual([DEFAULT_FONT_OPTION]);
    expect(fontOptionsFor([DEFAULT_FONT_FAMILY, "Unknown", DEFAULT_FONT_FAMILY])).toEqual([DEFAULT_FONT_OPTION]);
  });
});

describe("fontLoadRequests", () => {
  it("requests regular and bold of every face with its sample character", () => {
    expect(fontLoadRequests(DEFAULT_FONT_OPTION)).toEqual([
      ['16px "Geist"', "A"],
      ['bold 16px "Geist"', "A"],
      ['16px "Noto Sans TC"', "中"],
      ['bold 16px "Noto Sans TC"', "中"],
    ]);
  });
});
