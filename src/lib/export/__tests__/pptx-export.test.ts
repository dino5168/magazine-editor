import { describe, expect, it } from "vitest";
import { createPage } from "@/lib/editor/element-factory";
import { presetIdsInGroup, presetSize, PAGE_SIZE_PRESET_IDS } from "@/lib/editor/page-setup";
import type { Size } from "@/lib/editor/types";
import { PAGE_SIZE_PRESETS } from "@/lib/editor/units";
import { PPTX_PROBLEMS, isSlideSize, pptxExportProblem } from "../pptx-export";

const pages = (...sizes: Size[]) => ({ pages: sizes.map((size, index) => createPage(`Page-${index + 1}`, size, "#ffffff")) });
const ppt16x9 = presetSize("ppt16x9", "landscape");

describe("isSlideSize", () => {
  it("accepts the four slide sizes in both orientations", () => {
    expect(presetIdsInGroup("slides")).toHaveLength(4);
    for (const id of presetIdsInGroup("slides")) {
      expect(isSlideSize(presetSize(id, "landscape"))).toBe(true);
      expect(isSlideSize(presetSize(id, "portrait"))).toBe(true);
    }
  });

  it("rejects paper sizes and custom sizes", () => {
    for (const id of PAGE_SIZE_PRESET_IDS.filter((id) => PAGE_SIZE_PRESETS[id].group !== "slides")) {
      expect(isSlideSize(presetSize(id, "landscape"))).toBe(false);
    }
    expect(isSlideSize({ width: 1000, height: 540 })).toBe(false);
  });

  it("matches 960 × 540 pt, PowerPoint's default widescreen slide", () => {
    expect(ppt16x9.width).toBeCloseTo(960, 6);
    expect(ppt16x9.height).toBeCloseTo(540, 6);
  });
});

describe("pptxExportProblem", () => {
  it("allows a document whose pages all have one slide size", () => {
    expect(pptxExportProblem(pages(ppt16x9))).toBeNull();
    expect(pptxExportProblem(pages(ppt16x9, ppt16x9, { width: 960.3, height: 539.8 }))).toBeNull();
    const portrait = presetSize("ppt4x3", "portrait");
    expect(pptxExportProblem(pages(portrait, portrait))).toBeNull();
  });

  it("rejects a document that is not a slide size", () => {
    expect(pptxExportProblem(pages(presetSize("a4", "portrait")))).toBe(PPTX_PROBLEMS.notSlideSize);
    expect(pptxExportProblem({ pages: [] })).toBe(PPTX_PROBLEMS.notSlideSize);
  });

  it("rejects mixed page sizes, even when every page is a slide size", () => {
    expect(pptxExportProblem(pages(ppt16x9, presetSize("ppt4x3", "landscape")))).toBe(PPTX_PROBLEMS.mixedSizes);
    expect(pptxExportProblem(pages(ppt16x9, presetSize("ppt16x9", "portrait")))).toBe(PPTX_PROBLEMS.mixedSizes);
    expect(pptxExportProblem(pages(ppt16x9, presetSize("a4", "landscape")))).toBe(PPTX_PROBLEMS.mixedSizes);
  });
});
