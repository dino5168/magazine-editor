import { describe, expect, it } from "vitest";
import {
  catalogCategories,
  catalogDownloadBytes,
  catalogFontNaming,
  catalogFontOfFile,
  catalogIdsInUse,
  FONT_CATALOG,
  fontsToCheckBeforePublishing,
  formatMegabytes,
} from "../font-catalog";
import { addDraftFont, startFontDraft } from "../font-draft";
import { createBlankDocument, createShapeElement, createTextElement } from "../element-factory";
import { projectFontOption } from "../fonts";
import { createPageNumberRule } from "../page-numbers";
import { createLabel } from "../shape-label";
import type { FontFile, ProjectFont } from "../types";

const find = (id: string) => FONT_CATALOG.find((font) => font.id === id)!;

// 專案裡存的檔案：assets/fonts/<內容雜湊前 32 碼>.<ext>
const stored = (sha256: string, ext = "ttf"): FontFile => ({
  src: `assets/fonts/${sha256.slice(0, 32)}.${ext}`,
  fileFamily: "x",
  fileStyle: "Regular",
  weight: 400,
  embedding: "installable",
  ascent: 0.9,
  descent: 0.2,
  appleBaselineShift: 0,
});

describe("font catalog", () => {
  it("reads the same catalog as Rust, grouped by category in order", () => {
    expect(FONT_CATALOG.length).toBeGreaterThan(0);
    expect(new Set(FONT_CATALOG.map((font) => font.id)).size).toBe(FONT_CATALOG.length);
    const groups = catalogCategories();
    expect(groups.map((group) => group.category)).toEqual([...new Set(FONT_CATALOG.map((font) => font.category))]);
    expect(groups.flatMap((group) => group.fonts)).toHaveLength(FONT_CATALOG.length);
  });

  it("counts a zip shared by regular and bold once, and nothing when cached", () => {
    const genyo = find("genyo-gothic");
    expect(genyo.regular.url).toBe(genyo.bold?.url);
    expect(catalogDownloadBytes(genyo, false)).toBe(genyo.regular.bytes);
    const chiron = find("chiron-hei-hk");
    expect(catalogDownloadBytes(chiron, false)).toBe(chiron.regular.bytes + chiron.bold!.bytes);
    expect(catalogDownloadBytes(chiron, true)).toBe(0);
    expect(formatMegabytes(4_880_000)).toBe("4.9 MB");
  });

  it("recognises stored files that came from the catalog", () => {
    const huninn = find("jf-openhuninn");
    expect(catalogFontOfFile(stored(huninn.regular.fileSha256))?.id).toBe("jf-openhuninn");
    const genyo = find("genyo-gothic");
    expect(catalogFontOfFile(stored(genyo.bold!.fileSha256, "otf"))?.id).toBe("genyo-gothic");
    expect(catalogFontOfFile(stored("0".repeat(64)))).toBeNull();
    expect(catalogFontOfFile({ ...stored(huninn.regular.fileSha256), src: "assets/fonts/short.ttf" })).toBeNull();
  });

  it("lists the catalog fonts already in a font list by their regular file", () => {
    const font = (id: string, regular: FontFile): ProjectFont => ({ id, name: id, generic: "sans-serif", regular, bold: null });
    const genyo = find("genyo-gothic");
    const fonts = [font("a", stored(find("iansui").regular.fileSha256)), font("b", stored(genyo.bold!.fileSha256, "otf")), font("c", stored("1".repeat(64)))];
    // 粗體檔當成一般用的不算「已加入」那一套
    expect([...catalogIdsInUse(fonts)]).toEqual(["iansui"]);
  });

  it("names catalog fonts after the catalog and picks the fallback from the category", () => {
    expect(catalogFontNaming(find("genryu-min"))).toEqual({ name: "源流明體", generic: "serif" });
    expect(catalogFontNaming(find("chiron-sung-hk")).generic).toBe("serif");
    expect(catalogFontNaming(find("genyo-gothic"))).toEqual({ name: "源樣黑體", generic: "sans-serif" });
    // 檔案裡的名稱是「源樣黑體月」：加入時用清單的名稱
    const regular = { ...stored(find("genyo-gothic").regular.fileSha256, "otf"), fileFamily: "源樣黑體月" };
    const draft = addDraftFont(startFontDraft(createBlankDocument()), "new", regular, null, catalogFontNaming(find("genyo-gothic")));
    expect(draft.fonts[draft.fonts.length - 1]).toMatchObject({ name: "源樣黑體", generic: "sans-serif" });
  });

  it("asks to check the licence of exported fonts that are not from the catalog", () => {
    const font = (id: string, regular: FontFile, bold: FontFile | null = null): ProjectFont => ({ id, name: id, generic: "sans-serif", regular, bold });
    const chiron = find("chiron-hei-hk");
    const fromCatalog = font("catalog", stored(chiron.regular.fileSha256, "otf"), stored(chiron.bold!.fileSha256, "otf"));
    const system = font("system", stored("2".repeat(64)));
    // 一般是清單的、粗體是自己的檔案：要提醒
    const mixed = font("mixed", stored(find("iansui").regular.fileSha256), stored("3".repeat(64)));
    const onlyInStyle = font("style", stored("4".repeat(64)));
    const inMaster = font("master", stored("5".repeat(64)));
    const inPageNumber = font("pageNumber", stored("6".repeat(64)));
    const unused = font("unused", stored("7".repeat(64)));
    const family = (f: ProjectFont) => projectFontOption(f).family;
    const blank = createBlankDocument();
    const text = (f: ProjectFont, id: string) => ({ ...createTextElement("body", { x: 0, y: 0 }), id, fontFamily: family(f) });
    const labelled = { ...createShapeElement("rect", { x: 0, y: 0 }), id: "shape", label: { ...createLabel("A"), fontFamily: family(mixed) } };
    const rule = createPageNumberRule("rule", 1, 1);
    const document = {
      ...blank,
      fonts: [fromCatalog, system, mixed, onlyInStyle, inMaster, inPageNumber, unused],
      textStyles: blank.textStyles.map((style, index) => (index === 0 ? { ...style, fontFamily: family(onlyInStyle) } : style)),
      pageNumberRules: [{ ...rule, style: { ...rule.style, fontFamily: family(inPageNumber) } }],
      masters: [{ ...blank.pages[0], id: "m", parentId: null, elements: [text(inMaster, "t3")] }],
      pages: [{ ...blank.pages[0], elements: [text(fromCatalog, "t1"), text(system, "t2"), labelled] }],
    };
    expect(fontsToCheckBeforePublishing(document).map((f) => f.id)).toEqual(["system", "mixed", "master", "pageNumber"]);
    expect(fontsToCheckBeforePublishing({ ...document, pageNumberRules: [], masters: [], pages: [{ ...document.pages[0], elements: [text(fromCatalog, "t1")] }] })).toEqual([]);
  });
});
