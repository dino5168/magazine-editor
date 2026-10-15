import { describe, expect, it } from "vitest";
import type { ProjectContent } from "@/lib/project/project-types";
import { styleOverrides } from "../style-sheet";
import {
  BUILT_IN_SWATCH_IDS,
  applySwatchEdits,
  defaultSwatches,
  deleteSwatch,
  hasValidSwatchLinks,
  mapColorSlots,
  nextSwatchName,
  parseSwatchHex,
  swatchColor,
  swatchNameError,
  swatchUsage,
  updateSwatch,
  type ColorSlot,
} from "../swatches";
import { DEFAULT_TEXT_FILL } from "../text-style";
import type { EditorDocument, ShapeElement, TextElement } from "../types";
import { isSwatchList } from "../validation";
// 與 Rust 共用的 fixture：六個色票，連結涵蓋每一種顏色欄位
import fixtureJson from "../../../../tests/fixtures/sample.magproj?raw";

const fixture = (): EditorDocument => (JSON.parse(fixtureJson) as ProjectContent).document;

const ellipseOf = (document: EditorDocument) => document.pages[0].elements.find((e) => e.id === "el-ellipse") as ShapeElement;
const footerOf = (document: EditorDocument) => document.masters[1].elements[0] as TextElement;
const bodyRule = (document: EditorDocument) => document.pageNumberRules[1].style;

/** Counts the color fields of a document JSON: every object with a swatch link key. */
function countLinkFields(value: unknown): number {
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + countLinkFields(item), 0);
  if (typeof value !== "object" || value === null) return 0;
  const record = value as Record<string, unknown>;
  const own = ["fillSwatchId", "swatchId", "backgroundSwatchId"].filter((key) => key in record).length;
  return own + Object.values(record).reduce<number>((sum, child) => sum + countLinkFields(child), 0);
}

describe("built-in swatches and names", () => {
  it("gives new documents 文字 / 黑 / 白 with fixed ids", () => {
    const swatches = defaultSwatches();
    expect(isSwatchList(swatches)).toBe(true);
    expect(swatches.map((s) => s.id)).toEqual(Object.values(BUILT_IN_SWATCH_IDS));
    expect(swatches[0]).toMatchObject({ name: "文字", color: DEFAULT_TEXT_FILL });
  });

  it("names new swatches with the first unused number", () => {
    expect(nextSwatchName([])).toBe("色票 1");
    expect(nextSwatchName([{ id: "a", name: "色票 1", color: "#000000" }, { id: "b", name: "色票 3", color: "#000000" }])).toBe("色票 2");
  });

  it("explains why a name cannot be used", () => {
    const swatches = defaultSwatches();
    expect(swatchNameError(" 品牌紅 ", swatches, null)).toBeNull();
    expect(swatchNameError("黑", swatches, null)).toBe("已經有名為「黑」的色票");
    expect(swatchNameError("黑", swatches, BUILT_IN_SWATCH_IDS.black)).toBeNull();
    expect(swatchNameError("  ", swatches, null)).toBe("名稱不可為空白");
  });

  it("reads typed hex colors", () => {
    expect(parseSwatchHex("#BE123C")).toBe("#be123c");
    expect(parseSwatchHex(" be123c ")).toBe("#be123c");
    expect(parseSwatchHex("#f0a")).toBe("#ff00aa");
    for (const bad of ["", "#be123c80", "#gg0000", "red", "#12345"]) expect(parseSwatchHex(bad), bad).toBeNull();
  });

  it("puts the swatch's RGB under the use's own alpha", () => {
    const swatch = { id: "s", name: "s", color: "#be123c" };
    expect(swatchColor("#4f46e580", swatch)).toBe("#be123c80");
    expect(swatchColor("#4f46e5", swatch)).toBe("#be123c");
  });
});

describe("mapColorSlots", () => {
  it("visits every color field of the document once", () => {
    const document = fixture();
    const seen: ColorSlot[] = [];
    const same = mapColorSlots(document, (slot) => {
      seen.push(slot);
      return { ...slot }; // 值相同 = 不變
    });
    expect(same).toBe(document);
    expect(seen).toHaveLength(countLinkFields(document));
  });

  it("counts the uses of every swatch", () => {
    expect(Object.fromEntries(swatchUsage(fixture()))).toEqual({
      "swatch-text": 2, // 圖形內文字、「內文」樣式
      "swatch-white": 1, // 第 1 頁背景
      "swatch-brand": 3, // 橢圓邊框、頁碼框線與陰影
      "swatch-indigo": 3, // 主頁色帶、主頁 B 的箭頭線、頁碼文字（50%）
      "swatch-paper": 1, // 主頁 B 背景
      "swatch-gray": 2, // 主頁頁尾、「頁尾」樣式
    });
  });
});

describe("updateSwatch", () => {
  it("recolors every use and keeps each use's alpha", () => {
    const document = updateSwatch(fixture(), "swatch-indigo", { color: "#2563eb" })!;
    expect(document.swatches.find((s) => s.id === "swatch-indigo")!.color).toBe("#2563eb");
    expect((document.masters[0].elements[0] as ShapeElement).fill).toBe("#2563eb");
    expect(bodyRule(document)).toMatchObject({ fill: "#2563eb80", fillSwatchId: "swatch-indigo" });
  });

  it("reaches strokes, shadows, labels and backgrounds", () => {
    const brand = updateSwatch(fixture(), "swatch-brand", { color: "#16a34a" })!;
    expect(ellipseOf(brand).stroke!.color).toBe("#16a34a");
    expect(bodyRule(brand).stroke!.color).toBe("#16a34a");
    expect(bodyRule(brand).shadow!.color).toBe("#16a34a");
    const text = updateSwatch(fixture(), "swatch-text", { color: "#0a0a0a" })!;
    expect(ellipseOf(text).label!.fill).toBe("#0a0a0a");
    const white = updateSwatch(fixture(), "swatch-white", { color: "#fafafa" })!;
    expect(white.pages[0].background).toBe("#fafafa");
  });

  it("changes a text style and its texts together, so no override appears", () => {
    const document = updateSwatch(fixture(), "swatch-gray", { color: "#404040" })!;
    const footer = footerOf(document);
    const style = document.textStyles.find((s) => s.id === footer.styleId)!;
    expect(footer.fill).toBe("#404040");
    expect(styleOverrides(footer, style)).toEqual([]);
  });

  it("leaves unrelated parts alone", () => {
    const before = fixture();
    const after = updateSwatch(before, "swatch-paper", { color: "#fde68a" })!;
    expect(after.masters[1].background).toBe("#fde68a");
    expect(after.pages).toBe(before.pages);
    expect(after.textStyles).toBe(before.textStyles);
    expect(after.masters[0]).toBe(before.masters[0]);
    expect(after.masters[1].elements).toBe(before.masters[1].elements);
  });

  it("renames without touching the uses", () => {
    const before = fixture();
    const after = updateSwatch(before, "swatch-brand", { name: "主色" })!;
    expect(after.swatches[2].name).toBe("主色");
    expect(after.pages).toBe(before.pages);
  });

  it("returns the same document when nothing changes and null when invalid", () => {
    const document = fixture();
    expect(updateSwatch(document, "swatch-brand", { color: "#be123c" })).toBe(document);
    expect(updateSwatch(document, "missing", { color: "#000000" })).toBeNull();
    expect(updateSwatch(document, "swatch-brand", { name: "文字" })).toBeNull();
    expect(updateSwatch(document, "swatch-brand", { color: "#BE123C" })).toBeNull();
    expect(updateSwatch(document, "swatch-brand", { color: "#be123c80" })).toBeNull();
  });
});

describe("deleteSwatch", () => {
  it("unlinks the uses and keeps their colors", () => {
    const document = deleteSwatch(fixture(), "swatch-brand", null)!;
    expect(document.swatches.some((s) => s.id === "swatch-brand")).toBe(false);
    expect(ellipseOf(document).stroke).toMatchObject({ color: "#be123c", swatchId: null });
    expect(bodyRule(document).shadow).toMatchObject({ color: "#be123c", swatchId: null });
    expect(swatchUsage(document).has("swatch-brand")).toBe(false);
  });

  it("moves the uses to the replacement, keeping their alpha", () => {
    const document = deleteSwatch(fixture(), "swatch-indigo", "swatch-brand")!;
    expect(bodyRule(document)).toMatchObject({ fill: "#be123c80", fillSwatchId: "swatch-brand" });
    expect(document.masters[0].elements[0]).toMatchObject({ fill: "#be123c", fillSwatchId: "swatch-brand" });
    expect(swatchUsage(document).get("swatch-brand")).toBe(6);
  });

  it("rejects unknown swatches and replacing a swatch with itself", () => {
    const document = fixture();
    expect(deleteSwatch(document, "missing", null)).toBeNull();
    expect(deleteSwatch(document, "swatch-brand", "missing")).toBeNull();
    expect(deleteSwatch(document, "swatch-brand", "swatch-brand")).toBeNull();
  });
});

describe("applySwatchEdits", () => {
  it("adds, recolors, reorders and deletes in one go", () => {
    const before = fixture();
    const [text, white, brand, indigo, paper] = before.swatches;
    const added = { id: "swatch-new", name: "新色", color: "#0ea5e9" };
    const after = applySwatchEdits(
      before,
      [added, { ...brand, color: "#e11d48" }, text, white, indigo, paper],
      [{ id: "swatch-gray", replaceWith: "swatch-new" }],
    )!;
    expect(after.swatches.map((s) => s.id)).toEqual(["swatch-new", "swatch-brand", "swatch-text", "swatch-white", "swatch-indigo", "swatch-paper"]);
    expect(ellipseOf(after).stroke!.color).toBe("#e11d48");
    expect(footerOf(after)).toMatchObject({ fill: "#0ea5e9", fillSwatchId: "swatch-new" });
    expect(after.textStyles.find((s) => s.id === "style-footer")).toMatchObject({ fill: "#0ea5e9", fillSwatchId: "swatch-new" });
  });

  it("only reorders the list when the colors stay", () => {
    const before = fixture();
    const after = applySwatchEdits(before, [...before.swatches].reverse(), [])!;
    expect(after.swatches.map((s) => s.id)).toEqual(before.swatches.map((s) => s.id).reverse());
    expect(after.pages).toBe(before.pages);
  });

  it("returns the same document for an unchanged list", () => {
    const document = fixture();
    expect(applySwatchEdits(document, document.swatches.map((s) => ({ ...s })), [])).toBe(document);
  });

  it("rejects inconsistent edits", () => {
    const document = fixture();
    const rest = document.swatches.slice(1);
    const cases: [string, Parameters<typeof applySwatchEdits>[1], Parameters<typeof applySwatchEdits>[2]][] = [
      ["swatch neither kept nor deleted", rest, []],
      ["deleted swatch still listed", document.swatches, [{ id: "swatch-text", replaceWith: null }]],
      ["unknown deletion", rest, [{ id: "swatch-text", replaceWith: null }, { id: "missing", replaceWith: null }]],
      ["deleted twice", rest, [{ id: "swatch-text", replaceWith: null }, { id: "swatch-text", replaceWith: null }]],
      ["replacement not kept", rest.slice(1), [{ id: "swatch-text", replaceWith: "swatch-white" }, { id: "swatch-white", replaceWith: null }]],
      ["duplicate name", [...rest, { id: "x", name: "白", color: "#ffffff" }], [{ id: "swatch-text", replaceWith: null }]],
      ["color with alpha", [{ ...document.swatches[0], color: "#17171780" }, ...rest], []],
    ];
    for (const [what, swatches, deletions] of cases) expect(applySwatchEdits(document, swatches, deletions), what).toBeNull();
  });
});

describe("hasValidSwatchLinks", () => {
  const document = fixture();

  it("accepts the fixture and values without links", () => {
    expect(hasValidSwatchLinks(document, document)).toBe(true);
    expect(hasValidSwatchLinks(document, { fill: "#000000", fillSwatchId: null })).toBe(true);
    expect(hasValidSwatchLinks(document, { x: 1 })).toBe(true);
    expect(hasValidSwatchLinks(document, null)).toBe(true);
  });

  it("needs an existing swatch with the same RGB, at any depth", () => {
    expect(hasValidSwatchLinks(document, { fill: "#BE123C80", fillSwatchId: "swatch-brand" })).toBe(true);
    expect(hasValidSwatchLinks(document, { fill: "#000000", fillSwatchId: "swatch-brand" })).toBe(false);
    expect(hasValidSwatchLinks(document, { fillSwatchId: "missing" })).toBe(false);
    expect(hasValidSwatchLinks(document, { label: { shadow: { color: "#000000", swatchId: "swatch-brand" } } })).toBe(false);
    expect(hasValidSwatchLinks(document, [{ background: "#ffffff", backgroundSwatchId: "swatch-white" }])).toBe(true);
    expect(hasValidSwatchLinks(document, [{ background: "#fffffe", backgroundSwatchId: "swatch-white" }])).toBe(false);
  });
});
