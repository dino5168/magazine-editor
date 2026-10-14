import { describe, expect, it } from "vitest";
import {
  createPage,
  createShapeElement,
  createTextElement,
  DEFAULT_FONT_FAMILY,
  DEFAULT_MARGINS,
} from "../element-factory";
import {
  DEFAULT_FONT_OPTION,
  findFontOption,
  FONT_OPTIONS,
  fontLoadRequests,
  fontOptionsFor,
  projectFontDescriptors,
  projectFontFamily,
  projectFontOption,
  usedFontFamilies,
} from "../fonts";
import { createPageNumberRule } from "../page-numbers";
import { createLabel } from "../shape-label";
import type { EditorDocument, FontFile, ProjectFont } from "../types";
import fixtureJson from "../../../../tests/fixtures/sample.magproj?raw";

const FIXTURE_FONTS = (JSON.parse(fixtureJson) as { document: EditorDocument }).document.fonts;

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
      textStyles: [],
      swatches: [], fonts: [],
      pageNumberRules: [],
      masters: [],
      pages: [
        { ...createPage("P1", SIZE, "#ffffff"), elements: [text, plainShape] },
        { ...createPage("P2", SIZE, "#ffffff"), elements: [labelled, { ...text, id: "t2" }] },
      ],
    };

    expect(usedFontFamilies(document)).toEqual(["Alpha", "Zeta"]);

    const rule = createPageNumberRule("r", 1, 2);
    const numbered = { ...document, pageNumberRules: [{ ...rule, style: { ...rule.style, fontFamily: "Mid" } }] };
    expect(usedFontFamilies(numbered)).toEqual(["Alpha", "Mid", "Zeta"]);
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

describe("project fonts", () => {
  const [display, book] = FIXTURE_FONTS as readonly [ProjectFont, ProjectFont];

  it("uses project-font-<id> as the family, same as Rust project_font_family", () => {
    expect(projectFontFamily("font-book")).toBe("project-font-font-book");
  });

  it("falls back to the built-in Chinese font of the same kind", () => {
    const sans = projectFontOption(display);
    expect(sans).toMatchObject({ id: "project:font-display", label: "標題黑體", project: display });
    expect(sans.family).toBe('"project-font-font-display", "Noto Sans TC", sans-serif');
    expect(projectFontOption(book).family).toBe('"project-font-font-book", "Noto Serif TC", serif');
    // 後備的中文字型也要等它載入，換行才對
    expect(fontLoadRequests(projectFontOption(book)).map(([font]) => font)).toEqual([
      '16px "project-font-font-book"',
      'bold 16px "project-font-font-book"',
      '16px "Noto Serif TC"',
      'bold 16px "Noto Serif TC"',
    ]);
  });

  it("finds a project font by its first family only, so the fallback may change", () => {
    expect(findFontOption(projectFontOption(display).family, FIXTURE_FONTS)?.project).toBe(display);
    expect(findFontOption('"Project-Font-Font-Book", sans-serif', FIXTURE_FONTS)?.project).toBe(book);
    // 刪掉的字型 / 沒傳字型清單 → 「其他字型」
    expect(findFontOption(projectFontOption(display).family)).toBeUndefined();
    expect(findFontOption('"project-font-gone", sans-serif', FIXTURE_FONTS)).toBeUndefined();
    // 內建字型照舊
    expect(findFontOption(DEFAULT_FONT_OPTION.family, FIXTURE_FONTS)).toBe(DEFAULT_FONT_OPTION);
  });

  it("loads the project fonts a document uses, once each", () => {
    const family = projectFontOption(book).family;
    expect(fontOptionsFor([family, family, "Unknown"], FIXTURE_FONTS).map((option) => option.id)).toEqual([
      DEFAULT_FONT_OPTION.id,
      "project:font-book",
    ]);
  });

  it("writes the canvas metrics as overrides and the weight each file stands for", () => {
    const file: FontFile = { ...display.regular, ascent: 0.9521, descent: 0.2686 };
    expect(projectFontDescriptors(file, "700")).toEqual({
      weight: "700",
      ascentOverride: "95.21%",
      descentOverride: "26.86%",
      lineGapOverride: "0%",
    });
  });
});