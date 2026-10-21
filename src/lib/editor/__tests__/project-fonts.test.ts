import { describe, expect, it } from "vitest";
import { createBlankDocument, createShapeElement, createTextElement } from "../element-factory";
import { createInitialState, editorReducer, type EditorAction, type EditorState } from "../editor-reducer";
import { DEFAULT_FONT_OPTION, FONT_OPTIONS, findFontOption, projectFontOption } from "../fonts";
import {
  addDraftFont,
  draftFontNameErrors,
  draftFontUsage,
  editDraftFont,
  finishFontDraft,
  guessFontGeneric,
  isFontCollection,
  isFontFileName,
  pairImportedFonts,
  removeDraftFont,
  startFontDraft,
} from "../font-draft";
import { createPageNumberRule } from "../page-numbers";
import { defaultFontName, fontNameError, fontUsage, mapFontFamilies } from "../project-fonts";
import { createLabel } from "../shape-label";
import type { EditorDocument, ProjectFont } from "../types";
import { FONT_NAME_MAX_LENGTH } from "../validation";
import fixtureJson from "../../../../tests/fixtures/sample.magproj?raw";

const [DISPLAY, BOOK] = (JSON.parse(fixtureJson) as { document: EditorDocument }).document.fonts as readonly [
  ProjectFont,
  ProjectFont,
];
const SERIF = FONT_OPTIONS[1];

/**
 * A blank document with the fixture's two project fonts, where「標題黑體」is used by a text, a
 * shape label, the first text style and a page number rule (4 uses).
 */
function documentWithFonts(): EditorDocument {
  const blank = createBlankDocument();
  const family = projectFontOption(DISPLAY).family;
  const text = { ...createTextElement("body", { x: 0, y: 0 }), fontFamily: family };
  const shape = { ...createShapeElement("rect", { x: 0, y: 0 }), label: { ...createLabel("A"), fontFamily: family } };
  const other = { ...createTextElement("body", { x: 0, y: 0 }), id: "other" };
  const rule = createPageNumberRule("rule", 1, 1);
  return {
    ...blank,
    fonts: [DISPLAY, BOOK],
    textStyles: blank.textStyles.map((style, index) => (index === 0 ? { ...style, fontFamily: family } : style)),
    pageNumberRules: [{ ...rule, style: { ...rule.style, fontFamily: family } }],
    pages: [{ ...blank.pages[0], elements: [text, shape, other] }],
  };
}

function run(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(editorReducer, state);
}

/** Every `fontFamily` of the document, in a fixed order. */
function families(document: EditorDocument): string[] {
  const out: string[] = [];
  mapFontFamilies(document, (family) => {
    out.push(family);
    return family;
  });
  return out;
}

describe("project font names", () => {
  it("rejects empty, too long, duplicate and built-in names", () => {
    const fonts = [DISPLAY, BOOK];
    expect(fontNameError("  新字型 ", fonts, null)).toBeNull();
    expect(fontNameError(DISPLAY.name, fonts, DISPLAY.id)).toBeNull();
    expect(fontNameError(DISPLAY.name, fonts, BOOK.id)).toBe(`已經有名為「${DISPLAY.name}」的字型`);
    expect(fontNameError("明體", fonts, null)).toBe("「明體」是內建字型的名稱");
    expect(fontNameError("  ", fonts, null)).toBe("名稱不可為空白");
    expect(fontNameError("字".repeat(FONT_NAME_MAX_LENGTH + 1), fonts, null)).not.toBeNull();
  });

  it("names a new font after the family in its file, made unique", () => {
    expect(defaultFontName(" Display Sans ", [])).toBe("Display Sans");
    expect(defaultFontName(DISPLAY.name, [DISPLAY])).toBe(`${DISPLAY.name} 2`);
    expect(defaultFontName("明體", [])).toBe("明體 2");
    expect(defaultFontName("", [])).toBe("字型");
    const long = defaultFontName("x".repeat(80), []);
    expect(fontNameError(long, [], null)).toBeNull();
    expect(fontNameError(defaultFontName("x".repeat(80), [{ ...DISPLAY, name: long }]), [{ ...DISPLAY, name: long }], null)).toBeNull();
  });
});

describe("project font uses", () => {
  it("counts texts, shape labels, text styles and page number rules", () => {
    const document = documentWithFonts();
    expect(fontUsage(document, DISPLAY.id)).toBe(4);
    expect(fontUsage(document, BOOK.id)).toBe(0);
  });

  it("mapFontFamilies returns the same document when nothing changes", () => {
    const document = documentWithFonts();
    expect(mapFontFamilies(document, (family) => family)).toBe(document);
  });
});

describe("editorReducer / project fonts", () => {
  const initial = () => createInitialState(documentWithFonts());

  it("adds a font in one undo step; a taken name or id, or an invalid font, is a no-op", () => {
    const state = createInitialState(createBlankDocument());
    const added = run(state, { type: "font/add", font: DISPLAY });
    expect(added.history.present.fonts).toEqual([DISPLAY]);
    expect(run(added, { type: "history/undo" }).history.present.fonts).toEqual([]);
    for (const font of [
      { ...BOOK, name: DISPLAY.name },
      { ...BOOK, id: DISPLAY.id },
      { ...BOOK, name: "黑體" },
      { ...BOOK, name: ` ${BOOK.name}` },
      { ...BOOK, regular: { ...BOOK.regular, src: "assets/images/a.png" } },
    ]) {
      expect(editorReducer(added, { type: "font/add", font }), JSON.stringify(font.name)).toBe(added);
    }
  });

  it("renames and sets the bold file; unchanged values return the same state", () => {
    const state = initial();
    const renamed = run(state, { type: "font/update", id: DISPLAY.id, change: { name: "  封面黑體 " } });
    expect(renamed.history.present.fonts[0].name).toBe("封面黑體");
    // 名稱不影響文字存的字串
    expect(families(renamed.history.present)).toEqual(families(state.history.present));
    const bold = run(state, { type: "font/update", id: BOOK.id, change: { bold: DISPLAY.regular } });
    expect(bold.history.present.fonts[1].bold).toBe(DISPLAY.regular);
    expect(run(bold, { type: "font/update", id: BOOK.id, change: { bold: null } }).history.present.fonts[1].bold).toBeNull();

    expect(editorReducer(state, { type: "font/update", id: DISPLAY.id, change: { name: DISPLAY.name } })).toBe(state);
    expect(editorReducer(state, { type: "font/update", id: DISPLAY.id, change: { name: BOOK.name } })).toBe(state);
    expect(editorReducer(state, { type: "font/update", id: DISPLAY.id, change: { name: "圓體" } })).toBe(state);
    expect(editorReducer(state, { type: "font/update", id: "missing", change: { name: "x" } })).toBe(state);
  });

  it("a new fallback kind rewrites every use, which still finds the font", () => {
    const state = initial();
    const serif = run(state, { type: "font/update", id: DISPLAY.id, change: { generic: "serif" } });
    const document = serif.history.present;
    const stack = '"project-font-font-display", "Noto Serif TC", serif';
    expect(projectFontOption(document.fonts[0]).family).toBe(stack);
    expect(families(document).filter((family) => family === stack)).toHaveLength(4);
    expect(findFontOption(stack, document.fonts)?.project).toBe(document.fonts[0]);
    // 一筆復原
    expect(run(serif, { type: "history/undo" }).history.present).toBe(state.history.present);
  });

  it("deleting a font switches its uses to the replacement in one undo step", () => {
    const state = initial();
    const deleted = run(state, { type: "font/delete", id: DISPLAY.id, replaceWith: SERIF.family });
    const document = deleted.history.present;
    expect(document.fonts).toEqual([BOOK]);
    expect(families(document).filter((family) => family === SERIF.family)).toHaveLength(4);
    // 沒用到它的文字不動
    expect(families(document)).toContain(DEFAULT_FONT_OPTION.family);
    expect(run(deleted, { type: "history/undo" }).history.present).toBe(state.history.present);

    // 換成另一套專案字型
    const toBook = run(state, { type: "font/delete", id: DISPLAY.id, replaceWith: projectFontOption(BOOK).family });
    expect(fontUsage(toBook.history.present, BOOK.id)).toBe(4);
  });

  it("deleting with an unknown replacement, itself, or a missing font is a no-op", () => {
    const state = initial();
    const self = projectFontOption(DISPLAY).family;
    expect(editorReducer(state, { type: "font/delete", id: DISPLAY.id, replaceWith: self })).toBe(state);
    expect(editorReducer(state, { type: "font/delete", id: DISPLAY.id, replaceWith: "Arial" })).toBe(state);
    expect(editorReducer(state, { type: "font/delete", id: "missing", replaceWith: SERIF.family })).toBe(state);
  });
});

describe("font dialog draft", () => {
  const document = documentWithFonts();
  const documentIds = new Set(document.fonts.map((font) => font.id));
  const usage = new Map(document.fonts.map((font) => [font.id, fontUsage(document, font.id)]));

  it("adds an imported font named after its file, as a sans-serif without bold", () => {
    const draft = addDraftFont(startFontDraft(document), "new", { ...BOOK.regular, fileFamily: DISPLAY.name });
    expect(draft.fonts[2]).toMatchObject({ id: "new", name: `${DISPLAY.name} 2`, generic: "sans-serif", bold: null });
  });

  it("adds a system font with its bold file and guesses a serif fallback for 明體-like names", () => {
    const bold = { ...BOOK.regular, weight: 700 };
    const draft = addDraftFont(startFontDraft(document), "new", { ...BOOK.regular, fileFamily: "新細明體" }, bold);
    expect(draft.fonts[2]).toMatchObject({ name: "新細明體", generic: "serif", bold });
    expect(["標楷體", "STSong", "Noto Serif TC", "PMingLiU", "華康仿宋"].map(guessFontGeneric)).toEqual(Array(5).fill("serif"));
    expect(["微軟正黑體", "Noto Sans TC", "Segoe UI", "Microsoft JhengHei"].map(guessFontGeneric)).toEqual(Array(4).fill("sans-serif"));
  });

  it("moves the uses of deleted fonts along a chain of replacements", () => {
    let draft = startFontDraft(document);
    // 標題黑體 → 書名明體，之後書名明體 → 明體：標題黑體的 4 處也跟到明體
    draft = removeDraftFont(draft, DISPLAY.id, projectFontOption(BOOK).family, documentIds);
    expect(draftFontUsage(draft, usage).get(BOOK.id)).toBe(4);
    draft = removeDraftFont(draft, BOOK.id, SERIF.family, documentIds);
    expect(draft.fonts).toEqual([]);
    expect(draft.deletions).toEqual([
      { id: DISPLAY.id, replaceWith: SERIF.family },
      { id: BOOK.id, replaceWith: SERIF.family },
    ]);
    // 換成自己 = 不做
    expect(removeDraftFont(startFontDraft(document), BOOK.id, projectFontOption(BOOK).family, documentIds)).toEqual(startFontDraft(document));
  });

  it("drops new fonts removed again without a deletion entry", () => {
    const added = addDraftFont(startFontDraft(document), "new", BOOK.regular);
    expect(removeDraftFont(added, "new", SERIF.family, documentIds).deletions).toEqual([]);
  });

  it("reports name errors and trims names when finishing", () => {
    const draft = editDraftFont(startFontDraft(document), BOOK.id, { name: ` ${DISPLAY.name} ` });
    expect(draftFontNameErrors(draft).get(BOOK.id)).toBe(`已經有名為「${DISPLAY.name}」的字型`);
    const ok = editDraftFont(startFontDraft(document), BOOK.id, { name: "  內文明體 " });
    expect(draftFontNameErrors(ok).size).toBe(0);
    expect(finishFontDraft(ok).fonts[1].name).toBe("內文明體");
  });

  it("applies the whole draft in one undo step", () => {
    const state = createInitialState(document);
    let draft = startFontDraft(document);
    draft = editDraftFont(draft, BOOK.id, { name: "內文明體", bold: DISPLAY.bold });
    draft = editDraftFont(draft, DISPLAY.id, { generic: "serif" });
    draft = addDraftFont(draft, "new", BOOK.regular);
    const { fonts, deletions } = finishFontDraft(draft);
    const next = run(state, { type: "font/applyEdits", fonts, deletions });
    expect(next.history.present.fonts.map((font) => font.name)).toEqual([DISPLAY.name, "內文明體", BOOK.regular.fileFamily]);
    // 後備改成明體類：4 處都跟著換
    expect(families(next.history.present).filter((family) => family === projectFontOption(fonts[0]).family)).toHaveLength(4);
    expect(run(next, { type: "history/undo" }).history.present).toBe(document);
    // 沒改任何東西 = 同一個 state
    const unchanged = finishFontDraft(startFontDraft(document));
    expect(editorReducer(state, { type: "font/applyEdits", ...unchanged })).toBe(state);
  });

  it("applies deletions; a missing deletion entry or an invalid replacement is a no-op", () => {
    const state = createInitialState(document);
    const draft = removeDraftFont(startFontDraft(document), DISPLAY.id, SERIF.family, documentIds);
    const next = run(state, { type: "font/applyEdits", ...finishFontDraft(draft) });
    expect(next.history.present.fonts).toEqual([BOOK]);
    expect(fontUsage(next.history.present, DISPLAY.id)).toBe(0);
    expect(families(next.history.present).filter((family) => family === SERIF.family)).toHaveLength(4);

    expect(editorReducer(state, { type: "font/applyEdits", fonts: [BOOK], deletions: [] })).toBe(state);
    const bad = [{ id: DISPLAY.id, replaceWith: "Arial" }];
    expect(editorReducer(state, { type: "font/applyEdits", fonts: [BOOK], deletions: bad })).toBe(state);
    const toDeleted = [{ id: DISPLAY.id, replaceWith: projectFontOption(DISPLAY).family }];
    expect(editorReducer(state, { type: "font/applyEdits", fonts: [BOOK], deletions: toDeleted })).toBe(state);
  });

  it("recognises font files and collections", () => {
    expect(["a.ttf", "B.OTF", "msjh.ttc"].every(isFontFileName)).toBe(true);
    expect(["a.woff2", "a.fon", "ttc"].some(isFontFileName)).toBe(false);
    expect(isFontCollection(new TextEncoder().encode("ttcf "))).toBe(true);
    expect(isFontCollection(new Uint8Array([0, 1, 0, 0, 0]))).toBe(false);
    expect(isFontCollection(new Uint8Array([0x74]))).toBe(false);
  });

  it("pairs the files imported together by family and weight", () => {
    const file = (src: string, fileFamily: string, weight: number, fileStyle = "Regular") => ({ ...BOOK.regular, src, fileFamily, weight, fileStyle });
    const light = file("light", "Inter", 300, "Light");
    const regular = file("regular", "Inter", 400);
    const semibold = file("semibold", "Inter", 600, "SemiBold");
    const bold = file("bold", " inter ", 700, "Bold");
    const italic = file("italic", "Inter", 400, "Italic");
    const kai = file("kai", "標楷體", 400);
    // 粗體先選、同一個檔案兩次：照第一次出現的順序，同家族一般 + 粗體，其他各自一套
    expect(pairImportedFonts([bold, kai, light, regular, italic, semibold, regular])).toEqual([
      { regular, bold },
      { regular: kai, bold: null },
      { regular: light, bold: null },
      { regular: italic, bold: null },
      { regular: semibold, bold: null },
    ]);
    // 只有粗體檔：它就是一般
    expect(pairImportedFonts([bold])).toEqual([{ regular: bold, bold: null }]);
    expect(pairImportedFonts([])).toEqual([]);
    // 斜體自己一套時名稱帶樣式
    expect(addDraftFont(startFontDraft(document), "new", italic).fonts[2].name).toBe("Inter Italic");
  });
});
