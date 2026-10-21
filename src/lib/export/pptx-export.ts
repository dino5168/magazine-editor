/**
 * 能不能匯出 PowerPoint：一份 PPTX 只有一個投影片大小，所以每一頁要同一個尺寸，而且是簡報尺寸
 * （`PAGE_SIZE_GROUPS` 的 `slides`，直式、橫式都可以）。主頁不匯出，不檢查。
 * Rust 匯出時再檢查一次（規則相同）。計畫：`docs/03-Plans-匯出檔案/03-匯出PowerPoint 檔案-實作.md`。
 */
import { presetIdOf } from "@/lib/editor/page-setup";
import type { EditorDocument, Size } from "@/lib/editor/types";
import { PAGE_SIZE_PRESETS } from "@/lib/editor/units";

/** Two pages count as the same size within this distance (pt), like matching a preset. */
const SAME_SIZE_TOLERANCE_PT = 0.5;

/** Why the document cannot be exported as PowerPoint; short, shown beside the menu item. */
export const PPTX_PROBLEMS = {
  notSlideSize: "需要簡報尺寸",
  mixedSizes: "各頁尺寸不同",
} as const;

function sameSize(a: Size, b: Size): boolean {
  return Math.abs(a.width - b.width) <= SAME_SIZE_TOLERANCE_PT && Math.abs(a.height - b.height) <= SAME_SIZE_TOLERANCE_PT;
}

/**
 * Tells whether a page size is one of the presentation slide sizes, in either orientation.
 *
 * Args:
 *   size: Page size in pt.
 *
 * Returns:
 *   True for PPT 16:9 / 4:3 / 16:10 and Google 簡報 16:9.
 */
export function isSlideSize(size: Size): boolean {
  const id = presetIdOf(size);
  return id !== null && PAGE_SIZE_PRESETS[id].group === "slides";
}

/**
 * Checks whether the document can be exported as PowerPoint.
 *
 * Args:
 *   document: The document; only its pages are read.
 *
 * Returns:
 *   null when it can, otherwise a short reason from `PPTX_PROBLEMS`.
 */
export function pptxExportProblem(document: Pick<EditorDocument, "pages">): string | null {
  const [first, ...rest] = document.pages;
  // 文件至少一頁（reducer 保證）；保險起見沒有頁面也當成尺寸不對
  if (first === undefined || !isSlideSize(first)) return PPTX_PROBLEMS.notSlideSize;
  return rest.every((page) => sameSize(page, first)) ? null : PPTX_PROBLEMS.mixedSizes;
}
