import { describe, expect, it } from "vitest";
import fixtureJson from "../../../../tests/fixtures/sample.magproj?raw";
import { UNTITLED_DOCUMENT_NAME } from "@/lib/editor/element-factory";
import { shapeImageOf } from "@/lib/editor/shape-image";
import type { EditorDocument, ImageElement, Page } from "@/lib/editor/types";
import { PAGE_SIZE_PRESETS } from "@/lib/editor/units";
import { EMPTY_LIBRARY, type ImageItem, type Library } from "@/lib/library/types";
import {
  restrictedFonts,
  templateContent,
  templateDescriptionError,
  templateNameError,
  templatePreviewSheet,
  templateSummary,
} from "../template-content";
import { TEMPLATE_DESCRIPTION_MAX_LENGTH, TEMPLATE_NAME_MAX_LENGTH, type TemplateEntry } from "../types";

const FIXTURE = (JSON.parse(fixtureJson) as { document: EditorDocument }).document;
const COVER_IMAGE = "assets/images/0123456789abcdef0123456789abcdef.png";
const MASTER_IMAGE = "assets/images/fedcba9876543210fedcba9876543210.png";
const SECOND_IMAGE = "assets/images/00000000000000000000000000000002.png";

function imageItem(src: string, name: string, trashed = false): ImageItem {
  return {
    kind: "image",
    id: `item-${name}`,
    name,
    src,
    bytes: 1,
    folderId: null,
    importedAt: "2026-10-19T00:00:00Z",
    trashed: trashed ? { at: "2026-10-19T00:00:00Z", fromFolderId: null, fromName: null } : null,
    width: 100,
    height: 50,
  };
}

const LIBRARY: Library = {
  ...EMPTY_LIBRARY,
  items: [
    imageItem(COVER_IMAGE, "封面.png"),
    imageItem(MASTER_IMAGE, "底圖.png", true),
    imageItem(SECOND_IMAGE, "第二頁.png"),
    imageItem("assets/images/ffffffffffffffffffffffffffffffff.png", "沒用到.png"),
  ],
};

/** The fixture plus a second page (with its own image) and a third, empty page. */
function threePages(): EditorDocument {
  const cover = FIXTURE.pages[0];
  const image = cover.elements.find((element): element is ImageElement => element.type === "image")!;
  const second: Page = { ...cover, id: "page-2", name: "目錄", masterId: "master-a", elements: [{ ...image, id: "img-2", src: SECOND_IMAGE }] };
  const third: Page = { ...cover, id: "page-3", name: "內文", masterId: null, elements: [] };
  return { ...FIXTURE, pages: [cover, second, third] };
}

function entry(id: string, name: string | null): TemplateEntry {
  return {
    id,
    root: "C:/templates/" + id,
    meta: name === null ? null : { templateVersion: 1, name, description: "", createdAt: "", updatedAt: "" },
    document: null,
    problem: name === null ? "damaged" : null,
  };
}

describe("templateContent", () => {
  it("keeps every document-level setting and resets the name", () => {
    const { document } = templateContent(threePages(), LIBRARY, ["page-1"]);
    const source = threePages();
    expect(document.name).toBe(UNTITLED_DOCUMENT_NAME);
    expect(document.margins).toBe(source.margins);
    expect(document.pageNumberRules).toBe(source.pageNumberRules);
    expect(document.textStyles).toBe(source.textStyles);
    expect(document.swatches).toBe(source.swatches);
    expect(document.fonts).toBe(source.fonts);
    expect(document.masters).toBe(source.masters);
  });

  it("keeps the chosen sample pages in document order and ignores unknown ids", () => {
    const source = threePages();
    const { document } = templateContent(source, LIBRARY, ["page-3", "nope", "page-1"]);
    expect(document.pages).toEqual([source.pages[0], source.pages[2]]);
  });

  it("keeps one blank page with the first page's size and master when no page is chosen", () => {
    const source = threePages();
    const { document } = templateContent(source, LIBRARY, []);
    expect(document.pages).toHaveLength(1);
    const [page] = document.pages;
    const master = source.masters.find((sheet) => sheet.id === "master-b")!;
    expect(page).toMatchObject({
      name: "Page-1",
      width: source.pages[0].width,
      height: source.pages[0].height,
      masterId: "master-b",
      background: master.background,
      backgroundSwatchId: master.backgroundSwatchId,
      elements: [],
    });
    expect(source.pages.map((sheet) => sheet.id)).not.toContain(page.id);
  });

  it("uses a white background when the first page has no master page", () => {
    const source = { ...FIXTURE, pages: [{ ...FIXTURE.pages[0], masterId: null }] };
    const [page] = templateContent(source, LIBRARY, []).document.pages;
    expect(page).toMatchObject({ masterId: null, background: "#ffffff", backgroundSwatchId: null });
  });

  it("lists the library images used by the kept pages and the master pages", () => {
    const asset = (src: string) => ({ src, width: 100, height: 50 });
    // 主頁上的圖片在垃圾桶裡也算（頁面還在用）；沒勾的頁上的圖片與沒用到的素材不算
    expect(templateContent(threePages(), LIBRARY, ["page-1"]).assets).toEqual([
      { ...asset(COVER_IMAGE), name: "封面.png" },
      { ...asset(MASTER_IMAGE), name: "底圖.png" },
    ]);
    expect(templateContent(threePages(), LIBRARY, ["page-2"]).assets.map((item) => item.src)).toEqual([
      MASTER_IMAGE,
      SECOND_IMAGE,
    ]);
    // 圖片框（圖形裡的照片）上的照片也算
    const framed = threePages();
    const [first, ...rest] = framed.pages;
    const shape = first.elements.find((element) => element.type === "shape")!;
    const withFrame = {
      ...framed,
      pages: [{ ...first, elements: first.elements.map((e) => (e === shape ? { ...shape, image: shapeImageOf(SECOND_IMAGE, { width: 100, height: 50 }) } : e)) }, ...rest],
    };
    expect(templateContent(withFrame, LIBRARY, ["page-1"]).assets.map((item) => item.src)).toContain(SECOND_IMAGE);
    // 素材庫不認得的圖片沒有 AssetInfo（檔案仍由 Rust 依 referenced_assets 複製）
    expect(templateContent(threePages(), EMPTY_LIBRARY, ["page-1"]).assets).toEqual([]);
  });
});

describe("templateSummary / templatePreviewSheet", () => {
  it("summarizes paper, names and counts", () => {
    const summary = templateSummary(threePages());
    expect(summary.paper).toBe(PAGE_SIZE_PRESETS.a4);
    expect(summary.textStyleNames).toEqual(FIXTURE.textStyles.map((style) => style.name));
    expect(summary.swatchColors).toHaveLength(FIXTURE.swatches.length);
    expect(summary.fontNames).toEqual(["標題黑體", "書名明體"]);
    expect([summary.masterCount, summary.pageNumberRuleCount, summary.pageCount]).toEqual([2, 2, 3]);
  });

  it("finds the paper in landscape too, and none for a custom size", () => {
    const page = FIXTURE.pages[0];
    const landscape = { ...FIXTURE, pages: [{ ...page, width: page.height, height: page.width }] };
    expect(templateSummary(landscape).paper).toBe(PAGE_SIZE_PRESETS.a4);
    const custom = { ...FIXTURE, pages: [{ ...page, width: 123, height: 456 }] };
    expect(templateSummary(custom).paper).toBeNull();
  });

  it("previews the first master page, or the first page without masters", () => {
    expect(templatePreviewSheet(FIXTURE).id).toBe("master-a");
    expect(templatePreviewSheet({ ...FIXTURE, masters: [] }).id).toBe("page-1");
  });
});

describe("restrictedFonts", () => {
  it("lists fonts with a non-installable regular or bold file", () => {
    expect(restrictedFonts(FIXTURE).map((font) => font.name)).toEqual(["書名明體"]);
    const [installable] = FIXTURE.fonts;
    const editableBold = { ...installable, bold: { ...installable.bold!, embedding: "editable" as const } };
    expect(restrictedFonts({ ...FIXTURE, fonts: [editableBold] })).toEqual([editableBold]);
  });
});

describe("template name and description", () => {
  const templates = [entry("a", "校刊"), entry("b", null)];

  it("checks the name like Rust", () => {
    expect(templateNameError("  ", templates, null)).toBe("名稱不可為空白");
    expect(templateNameError("字".repeat(TEMPLATE_NAME_MAX_LENGTH + 1), templates, null)).toBe(`名稱最多 ${TEMPLATE_NAME_MAX_LENGTH} 個字`);
    expect(templateNameError("字".repeat(TEMPLATE_NAME_MAX_LENGTH), templates, null)).toBeNull();
    expect(templateNameError(" 校刊 ", templates, null)).toBe("已經有名為「校刊」的範本");
    expect(templateNameError("校刊", templates, "a")).toBeNull();
    expect(templateNameError("週報", templates, null)).toBeNull();
  });

  it("limits the description", () => {
    expect(templateDescriptionError("字".repeat(TEMPLATE_DESCRIPTION_MAX_LENGTH))).toBeNull();
    expect(templateDescriptionError(` ${"字".repeat(TEMPLATE_DESCRIPTION_MAX_LENGTH)} `)).toBeNull();
    expect(templateDescriptionError("字".repeat(TEMPLATE_DESCRIPTION_MAX_LENGTH + 1))).toBe(
      `說明最多 ${TEMPLATE_DESCRIPTION_MAX_LENGTH} 個字`,
    );
  });
});
