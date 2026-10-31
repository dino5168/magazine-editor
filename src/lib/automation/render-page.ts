/**
 * Tool `render_page`: the frontend only builds the export request of one page; Rust draws it with
 * the PDF's renderer and sends the picture to Claude (`src-tauri/src/mcp/bridge.rs`,
 * `export/page_image.rs`). The picture never goes through the WebView, and the Konva canvas is not
 * used (it squeezes full-width punctuation when redrawn off screen).
 * Plan: `docs/14-Plan-ClaudeCode看見畫面/1-看見畫面-實作.md` §6.
 */
import { selectActivePage, type EditorState } from "@/lib/editor/editor-reducer";
import { findSheet } from "@/lib/editor/master-pages";
import type { MeasureTextWidth } from "@/lib/editor/page-numbers";
import type { Result } from "@/lib/editor/validation";
import { buildExportRequest, type ExportRequest } from "@/lib/export/export-request";
import type { MeasureText } from "./layout";
import type { ToolArgs } from "./tool-definitions";

/** Default longest edge of the picture (px). */
export const RENDER_DEFAULT_PX = 1200;
/** Smallest and largest longest edge; same as `PAGE_IMAGE_MIN_PX` / `PAGE_IMAGE_MAX_PX` in Rust `page_image.rs`. */
export const RENDER_MIN_PX = 200;
export const RENDER_MAX_PX = 2000;
/** A region must overlap the page by at least this much (pt); same as `MIN_REGION_PT` in Rust. */
const MIN_REGION_PT = 1;

export interface RenderRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** What Rust draws (`RenderJob` in `bridge.rs`). */
export interface RenderJob {
  /** Holds only the page to draw. */
  readonly request: ExportRequest;
  readonly pageIndex: number;
  readonly maxPx: number;
  readonly region: RenderRegion | null;
  readonly pageName: string;
}

/**
 * Builds the render job of `render_page`.
 *
 * Args:
 *   state: Editor state.
 *   measure: Canvas text layout.
 *   measureWidth: Width of one unwrapped line (page numbers).
 *   args: Tool arguments.
 *
 * Returns:
 *   `{ render: RenderJob }` for Rust, or an error for an unknown page, a master page or a region
 *   off the page.
 */
export function renderPage(
  state: EditorState,
  measure: MeasureText,
  measureWidth: MeasureTextWidth,
  args: ToolArgs<"render_page">,
): Result<{ render: RenderJob }> {
  const document = state.history.present;
  const sheet = args.pageId === undefined ? selectActivePage(state) : findSheet(document, args.pageId);
  if (!sheet) return { data: null, error: new Error(`找不到頁面「${args.pageId}」，請先用 list_pages 取得 id`) };
  const pageIndex = document.pages.findIndex((page) => page.id === sheet.id);
  if (pageIndex < 0) {
    return { data: null, error: new Error(`「${sheet.name}」是主頁：主頁不能單獨畫成圖片，請改畫套用它的頁面`) };
  }
  const region = args.region ?? null;
  if (region) {
    const overlapX = Math.min(region.x + region.width, sheet.width) - Math.max(region.x, 0);
    const overlapY = Math.min(region.y + region.height, sheet.height) - Math.max(region.y, 0);
    if (overlapX < MIN_REGION_PT || overlapY < MIN_REGION_PT) {
      return {
        data: null,
        error: new Error(`參數 region：不在頁面範圍內（頁面是 ${sheet.width} × ${sheet.height} pt）`),
      };
    }
  }
  const request = buildExportRequest(document, measure, measureWidth, { pageIndexes: [pageIndex] });
  return {
    data: { render: { request, pageIndex: 0, maxPx: args.maxWidth ?? RENDER_DEFAULT_PX, region, pageName: sheet.name } },
    error: null,
  };
}
