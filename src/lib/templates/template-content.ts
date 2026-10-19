import { createPage, DEFAULT_PAGE_BACKGROUND, UNTITLED_DOCUMENT_NAME } from "@/lib/editor/element-factory";
import { findSheet } from "@/lib/editor/master-pages";
import type { AssetInfo, EditorDocument, Page, ProjectFont, Sheet } from "@/lib/editor/types";
import { findPageSizePreset, type PageSizePreset } from "@/lib/editor/units";
import { validateName } from "@/lib/editor/validation";
import { projectAssets } from "@/lib/library/library-selectors";
import type { Library } from "@/lib/library/types";
import type { ProjectContent } from "@/lib/project/project-types";
import { TEMPLATE_DESCRIPTION_MAX_LENGTH, TEMPLATE_NAME_MAX_LENGTH, type TemplateEntry } from "./types";

// 文件範本的純邏輯：從目前文件取出要存的內容、摘要、名稱檢查

/**
 * The page a template keeps when no sample page is chosen (a project needs at least one): the
 * first page's size and master page, with that master page's background like 新增頁面.
 */
function blankPage(document: EditorDocument): Page {
  const first = document.pages[0];
  const master = first.masterId === null ? null : findSheet(document, first.masterId);
  return createPage(
    "Page-1",
    first,
    master?.background ?? DEFAULT_PAGE_BACKGROUND,
    first.masterId,
    master?.backgroundSwatchId ?? null,
  );
}

function imageSources(sheets: readonly Sheet[]): Set<string> {
  return new Set(sheets.flatMap((sheet) => sheet.elements.flatMap((element) => (element.type === "image" ? [element.src] : []))));
}

/**
 * Builds what a document template stores from the document being edited: every document-level
 * setting as is (paper via the pages, margins, page numbers, text styles, swatches, project fonts,
 * master pages) plus the chosen sample pages.
 *
 * Args:
 *   document: The document being edited (unsaved changes included).
 *   library: The project's asset library; names and sizes of the images the template uses.
 *   pageIds: Sample pages to keep, in any order (kept in document order); unknown ids are
 *     ignored. None → one blank page.
 *
 * Returns:
 *   Content for `template_create` / `template_replace`. Its `assets` lists the images on the kept
 *   pages and master pages that the library knows (a new project's library is built from it).
 */
export function templateContent(document: EditorDocument, library: Library, pageIds: readonly string[]): ProjectContent {
  const chosen = new Set(pageIds);
  const samples = document.pages.filter((page) => chosen.has(page.id));
  const pages = samples.length > 0 ? samples : [blankPage(document)];
  const used = imageSources([...pages, ...document.masters]);
  const assets: AssetInfo[] = projectAssets(library).filter((asset) => used.has(asset.src));
  return { document: { ...document, name: UNTITLED_DOCUMENT_NAME, pages }, assets };
}

/** What the template dialogs show about a template's content. */
export interface TemplateSummary {
  /** Size of the first page in pt. */
  readonly width: number;
  readonly height: number;
  /** Paper preset matching the first page (either orientation), or null for a custom size. */
  readonly paper: PageSizePreset | null;
  readonly textStyleNames: readonly string[];
  readonly swatchColors: readonly string[];
  readonly fontNames: readonly string[];
  readonly masterCount: number;
  readonly pageNumberRuleCount: number;
  readonly pageCount: number;
}

/**
 * Summarizes a template's document.
 *
 * Args:
 *   document: A template's document.
 *
 * Returns:
 *   Paper, names and counts.
 */
export function templateSummary(document: EditorDocument): TemplateSummary {
  const first = document.pages[0];
  return {
    width: first.width,
    height: first.height,
    paper: findPageSizePreset(first) ?? findPageSizePreset({ width: first.height, height: first.width }),
    textStyleNames: document.textStyles.map((style) => style.name),
    swatchColors: document.swatches.map((swatch) => swatch.color),
    fontNames: document.fonts.map((font) => font.name),
    masterCount: document.masters.length,
    pageNumberRuleCount: document.pageNumberRules.length,
    pageCount: document.pages.length,
  };
}

/**
 * The sheet a template card shows: its first master page (the layout), else its first page.
 *
 * Args:
 *   document: A template's document.
 *
 * Returns:
 *   Sheet to draw as the thumbnail.
 */
export function templatePreviewSheet(document: EditorDocument): Sheet {
  return document.masters[0] ?? document.pages[0];
}

/**
 * Project fonts whose license does not allow installing them (「預覽與列印」/「可編輯」): copying
 * them into a template that other projects use may go beyond the license, so the user is warned.
 *
 * Args:
 *   document: The document being saved as a template.
 *
 * Returns:
 *   Those fonts, in menu order.
 */
export function restrictedFonts(document: EditorDocument): ProjectFont[] {
  return document.fonts.filter((font) =>
    [font.regular, font.bold].some((file) => file !== null && file.embedding !== "installable"),
  );
}

/**
 * Checks a template name like Rust `validate_name`: trimmed, 1–TEMPLATE_NAME_MAX_LENGTH
 * characters, unique among the listed templates.
 *
 * Args:
 *   raw: Name as typed.
 *   templates: Templates from `template_list`.
 *   exceptId: The template being renamed (its own name is fine); null when creating.
 *
 * Returns:
 *   Chinese error message, or null when the name can be used.
 */
export function templateNameError(raw: string, templates: readonly TemplateEntry[], exceptId: string | null): string | null {
  const result = validateName(raw, TEMPLATE_NAME_MAX_LENGTH);
  if (result.error) return result.error.message;
  const taken = templates.some((entry) => entry.id !== exceptId && entry.meta?.name === result.data);
  return taken ? `已經有名為「${result.data}」的範本` : null;
}

/**
 * Checks a template description: at most TEMPLATE_DESCRIPTION_MAX_LENGTH characters after trimming.
 *
 * Args:
 *   raw: Description as typed.
 *
 * Returns:
 *   Chinese error message, or null.
 */
export function templateDescriptionError(raw: string): string | null {
  return Array.from(raw.trim()).length > TEMPLATE_DESCRIPTION_MAX_LENGTH
    ? `說明最多 ${TEMPLATE_DESCRIPTION_MAX_LENGTH} 個字`
    : null;
}
