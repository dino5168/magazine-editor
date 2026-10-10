import { describe, expect, it } from "vitest";
import { TEXT_PRESETS, createTextElement } from "../element-factory";
import {
  BUILT_IN_TEXT_STYLE_IDS,
  TEXT_STYLE_KEYS,
  applyTextStyle,
  copyTextStyleName,
  defaultTextStyles,
  deleteTextStyle,
  linkTextStyle,
  mapStyledTexts,
  restyleDocument,
  styledTextOf,
  textStyleNameError,
  textStyleUsage,
  isTextStyleDef,
  isTextStyleSheet,
  nextTextStyleName,
  pickTextStyle,
  restyle,
  styleOverrides,
  type TextStyleDef,
} from "../style-sheet";
import type { EditorDocument, ShapeLabel } from "../types";
import fixtureJson from "../../../../tests/fixtures/sample.magproj?raw";
// Rust 讀 v7 以前的檔案時加上同一組樣式（format.rs 的測試也讀這份）
import defaultStylesJson from "../../../../tests/fixtures/default-text-styles.json?raw";

const [heading, subheading, body] = defaultTextStyles();

describe("defaultTextStyles", () => {
  it("matches the text panel presets and new text elements", () => {
    expect([heading.id, subheading.id, body.id]).toEqual(Object.values(BUILT_IN_TEXT_STYLE_IDS));
    expect([heading.name, subheading.name, body.name]).toEqual(["標題", "副標題", "內文"]);
    for (const [style, preset] of [
      [heading, "heading"],
      [subheading, "subheading"],
      [body, "body"],
    ] as const) {
      expect(styleOverrides(createTextElement(preset, { x: 0, y: 0 }), style)).toEqual([]);
      expect(TEXT_PRESETS[preset].label).toContain(style.name);
    }
    expect(isTextStyleSheet(defaultTextStyles())).toBe(true);
  });

  it("matches the shared fixture Rust adds to files older than v8", () => {
    expect(defaultTextStyles()).toEqual(JSON.parse(defaultStylesJson));
  });
});

describe("overrides", () => {
  const text = createTextElement("body", { x: 0, y: 0 });

  it("are the fields that differ from the style", () => {
    expect(styleOverrides(text, body)).toEqual([]);
    expect(styleOverrides({ ...text, fill: "#dc2626", fontSize: 12 }, body)).toEqual(["fontSize", "fill"]);
    // 陰影以值比較，不比參考
    const shadow = { color: "#00000080", offsetX: 2, offsetY: 2 };
    expect(styleOverrides({ ...text, shadow: { ...shadow } }, { ...body, shadow: { ...shadow } })).toEqual([]);
    expect(styleOverrides({ ...text, shadow }, body)).toEqual(["shadow"]);
  });

  it("covers every text style field and nothing else", () => {
    expect(Object.keys(pickTextStyle(text)).sort()).toEqual([...TEXT_STYLE_KEYS].sort());
    expect(TEXT_STYLE_KEYS).not.toContain("text");
  });
});

describe("applyTextStyle", () => {
  it("takes every style field and keeps the rest", () => {
    const text = { ...createTextElement("body", { x: 10, y: 20 }), fill: "#dc2626", italic: true, text: "hi" };
    const applied = applyTextStyle(text, heading);
    expect(styleOverrides(applied, heading)).toEqual([]);
    expect(applied).toMatchObject({ id: text.id, x: text.x, y: text.y, text: "hi", width: text.width });
  });

  it("returns the same object when nothing changes", () => {
    const text = createTextElement("heading", { x: 0, y: 0 });
    expect(applyTextStyle(text, heading)).toBe(text);
  });

  it("works on shape labels", () => {
    const label: ShapeLabel = { ...pickTextStyle(body), text: "x", verticalAlign: "middle", styleId: null };
    expect(applyTextStyle(label, heading)).toMatchObject({ text: "x", verticalAlign: "middle", fontSize: 32 });
  });
});

describe("restyle", () => {
  const changed: TextStyleDef = { ...body, fontSize: 10.5, fill: "#1e3a8a" };

  it("updates the fields that followed the style, keeps the overridden ones", () => {
    const text = { ...createTextElement("body", { x: 0, y: 0 }), fill: "#dc2626" };
    const next = restyle(text, body, changed);
    expect(next.fontSize).toBe(10.5);
    expect(next.fill).toBe("#dc2626");
    expect(styleOverrides(next, changed)).toEqual(["fill"]);
  });

  it("returns the same object when nothing follows a changed field", () => {
    const text = { ...createTextElement("body", { x: 0, y: 0 }), fontSize: 9, fill: "#dc2626" };
    expect(restyle(text, body, changed)).toBe(text);
    const plain = createTextElement("body", { x: 0, y: 0 });
    expect(restyle(plain, body, body)).toBe(plain);
  });

  it("follows shadow changes by value", () => {
    const shadow = { color: "#00000080", offsetX: 2, offsetY: 2 };
    const before = { ...body, shadow };
    const text = { ...createTextElement("body", { x: 0, y: 0 }), shadow: { ...shadow } };
    expect(restyle(text, before, { ...before, shadow: null }).shadow).toBeNull();
  });
});

describe("names and validation", () => {
  it("nextTextStyleName picks the first unused number", () => {
    expect(nextTextStyleName(defaultTextStyles())).toBe("樣式 1");
    expect(nextTextStyleName([{ ...body, name: "樣式 1" }, { ...heading, name: "樣式 3" }])).toBe("樣式 2");
  });

  it("isTextStyleDef checks id, trimmed name and style fields", () => {
    expect(isTextStyleDef(body)).toBe(true);
    expect(isTextStyleDef({ ...body, id: "" })).toBe(false);
    expect(isTextStyleDef({ ...body, id: "x".repeat(65) })).toBe(false);
    expect(isTextStyleDef({ ...body, name: " 內文" })).toBe(false);
    expect(isTextStyleDef({ ...body, name: "" })).toBe(false);
    expect(isTextStyleDef({ ...body, name: "字".repeat(51) })).toBe(false);
    expect(isTextStyleDef({ ...body, fontSize: 2 })).toBe(false);
    expect(isTextStyleDef({ ...body, fill: "red" })).toBe(false);
    expect(isTextStyleDef(null)).toBe(false);
  });

  it("textStyleNameError explains empty, long and taken names", () => {
    const styles = defaultTextStyles();
    expect(textStyleNameError("  引言 ", styles, null)).toBeNull();
    expect(textStyleNameError("   ", styles, null)).toContain("空白");
    expect(textStyleNameError("字".repeat(51), styles, null)).toContain("50");
    expect(textStyleNameError(" 內文", styles, null)).toBe("已經有名為「內文」的樣式");
    // 改名時自己的名稱可以用
    expect(textStyleNameError("內文", styles, body.id)).toBeNull();
  });

  it("copyTextStyleName finds an unused copy name within the length limit", () => {
    expect(copyTextStyleName("內文", defaultTextStyles())).toBe("內文 複本");
    const styles = [...defaultTextStyles(), { ...body, id: "c1", name: "內文 複本" }];
    expect(copyTextStyleName("內文", styles)).toBe("內文 複本 2");
    const long = "字".repeat(50);
    expect(Array.from(copyTextStyleName(long, [])).length).toBe(50);
    expect(copyTextStyleName(long, [])).toMatch(/ 複本$/);
  });

  it("isTextStyleSheet rejects duplicate ids or names", () => {
    expect(isTextStyleSheet([body, { ...heading, id: body.id }])).toBe(false);
    expect(isTextStyleSheet([body, { ...heading, name: body.name }])).toBe(false);
    expect(isTextStyleSheet([])).toBe(true);
  });
});

describe("whole document", () => {
  // fixture：主頁頁尾連「頁尾」（無覆寫）、橢圓內文字連「內文」（覆寫字級）、封面標題不連結
  const fixture = (JSON.parse(fixtureJson) as { document: EditorDocument }).document;
  const footerOf = (doc: EditorDocument) => doc.masters[1].elements[0];
  const labelOf = (doc: EditorDocument) => styledTextOf(doc.pages[0].elements[2])!;

  it("textStyleUsage counts texts on pages and master pages, labels included", () => {
    const usage = textStyleUsage(fixture);
    expect(usage.get("style-footer")).toBe(1);
    expect(usage.get("text-style-body")).toBe(1);
    expect(usage.has("text-style-heading")).toBe(false);
  });

  it("mapStyledTexts keeps the same document when nothing changes", () => {
    expect(mapStyledTexts(fixture, (text) => text)).toBe(fixture);
  });

  it("restyleDocument updates the style and the fields its texts follow", () => {
    const style = fixture.textStyles.find((s) => s.id === "text-style-body")!;
    const next = restyleDocument(fixture, style.id, { ...style, fontSize: 12, fill: "#1e3a8a" });
    expect(next.textStyles.find((s) => s.id === style.id)).toMatchObject({ fontSize: 12, fill: "#1e3a8a", name: "內文" });
    // 字級是覆寫（14）保留；顏色跟著樣式
    expect(labelOf(next)).toMatchObject({ fontSize: 14, fill: "#1e3a8a" });
    // 沒連到這個樣式的不動，而且保留原參考
    expect(footerOf(next)).toBe(footerOf(fixture));
    expect(next.pages[0].elements[0]).toBe(fixture.pages[0].elements[0]);
  });

  it("restyleDocument is a no-op for the same values or an unknown style", () => {
    const style = fixture.textStyles[0];
    expect(restyleDocument(fixture, style.id, style)).toBe(fixture);
    expect(restyleDocument(fixture, "missing", { ...style, fontSize: 99 })).toBe(fixture);
  });

  it("deleteTextStyle unlinks its texts and keeps their look", () => {
    const next = deleteTextStyle(fixture, "style-footer");
    expect(next.textStyles.map((s) => s.id)).not.toContain("style-footer");
    expect(footerOf(next)).toEqual({ ...footerOf(fixture), styleId: null });
    expect(deleteTextStyle(fixture, "missing")).toBe(fixture);
  });

  it("linkTextStyle applies the style or only unlinks", () => {
    const [heading] = defaultTextStyles();
    const text = { ...createTextElement("body", { x: 0, y: 0 }), fill: "#dc2626" };
    const linked = linkTextStyle(text, heading);
    expect(linked).toMatchObject({ styleId: heading.id, fontSize: 32, fill: heading.fill });
    expect(linkTextStyle(linked, heading)).toBe(linked);
    expect(linkTextStyle(linked, null)).toEqual({ ...linked, styleId: null });
    expect(linkTextStyle(text, null)).toBe(text);
  });
});
