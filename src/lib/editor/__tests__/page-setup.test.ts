import { describe, expect, it } from "vitest";
import {
  PAGE_SIZE_PRESET_IDS,
  isPageSetupValid,
  orientationOf,
  presetIdOf,
  presetIdsInGroup,
  presetOrientation,
  presetSize,
  selectPresetSize,
  validatePageSetup,
  withOrientation,
} from "../page-setup";
import { PAGE_SIZE_GROUPS, PAGE_SIZE_PRESETS, mmToPt } from "../units";
import { isPageSize } from "../validation";

const A4 = { width: mmToPt(210), height: mmToPt(297) };
const margins = { top: 40, right: 40, bottom: 40, left: 40 };

describe("orientation", () => {
  it("reads and changes the orientation", () => {
    expect(orientationOf(A4)).toBe("portrait");
    expect(orientationOf({ width: 100, height: 100 })).toBe("portrait");
    expect(withOrientation(A4, "portrait")).toBe(A4);
    expect(withOrientation(A4, "landscape")).toEqual({ width: A4.height, height: A4.width });
  });
});

describe("presets", () => {
  it("matches presets in either orientation", () => {
    expect(presetIdOf(A4)).toBe("a4");
    expect(presetIdOf(withOrientation(A4, "landscape"))).toBe("a4");
    expect(presetIdOf({ width: mmToPt(182), height: mmToPt(257) })).toBe("b5");
    expect(presetIdOf({ width: 500, height: 700 })).toBeNull();
  });

  it("returns preset sizes in the wanted orientation", () => {
    expect(presetSize("a4", "portrait")).toEqual(A4);
    expect(presetSize("a4", "landscape")).toEqual({ width: A4.height, height: A4.width });
  });

  it("stores every preset portrait, inside the page size range", () => {
    for (const id of PAGE_SIZE_PRESET_IDS) {
      const size = presetSize(id, "portrait");
      expect(PAGE_SIZE_PRESETS[id].widthMm, id).toBeLessThanOrEqual(PAGE_SIZE_PRESETS[id].heightMm);
      expect(isPageSize(size), id).toBe(true);
    }
  });

  it("recognises every preset again in both orientations (no two presets share a size)", () => {
    for (const id of PAGE_SIZE_PRESET_IDS) {
      expect(presetIdOf(presetSize(id, "portrait"))).toBe(id);
      expect(presetIdOf(presetSize(id, "landscape"))).toBe(id);
    }
  });

  it("lists every preset in exactly one menu section, in order", () => {
    const listed = PAGE_SIZE_GROUPS.flatMap((group) => presetIdsInGroup(group.id));
    expect(listed).toEqual(PAGE_SIZE_PRESET_IDS);
    expect(PAGE_SIZE_GROUPS.every((group) => presetIdsInGroup(group.id).length > 0)).toBe(true);
    expect(presetIdsInGroup("iso")).toEqual(["a3", "a4", "a5", "a6"]);
    // 範本面板以 id 引用，既有的 id 不能消失
    expect(PAGE_SIZE_PRESET_IDS).toEqual(expect.arrayContaining(["a4", "b5", "letter"]));
  });

  it("has the presentation slide sizes, landscape, in whole points (one PDF page = one slide)", () => {
    expect(PAGE_SIZE_GROUPS[PAGE_SIZE_GROUPS.length - 1].id).toBe("slides");
    const slides = Object.fromEntries(
      presetIdsInGroup("slides").map((id) => {
        const { width, height } = presetSize(id, "landscape");
        return [id, [Math.round(width * 1e6) / 1e6, Math.round(height * 1e6) / 1e6]];
      }),
    );
    expect(slides).toEqual({ ppt16x9: [960, 540], ppt4x3: [720, 540], ppt16x10: [720, 450], slides16x9: [720, 405] });
    for (const id of PAGE_SIZE_PRESET_IDS) {
      const preset: { readonly orientation?: string; readonly group: string } = PAGE_SIZE_PRESETS[id];
      expect(preset.orientation, id).toBe(preset.group === "slides" ? "landscape" : undefined);
    }
  });
});

describe("selectPresetSize", () => {
  const landscapeA4 = withOrientation(A4, "landscape");

  it("knows which presets are normally landscape", () => {
    expect(presetOrientation("a4")).toBe("portrait");
    expect(presetOrientation("ppt16x9")).toBe("landscape");
  });

  it("turns slides landscape when coming from paper or a custom size", () => {
    expect(selectPresetSize("ppt16x9", A4)).toEqual(presetSize("ppt16x9", "landscape"));
    expect(selectPresetSize("ppt4x3", landscapeA4)).toEqual(presetSize("ppt4x3", "landscape"));
    expect(selectPresetSize("slides16x9", { width: 500, height: 700 })).toEqual(presetSize("slides16x9", "landscape"));
  });

  it("turns paper portrait when coming from slides, even from a portrait slide", () => {
    expect(selectPresetSize("a4", presetSize("ppt16x9", "landscape"))).toEqual(A4);
    expect(selectPresetSize("a5", presetSize("ppt16x9", "portrait"))).toEqual(presetSize("a5", "portrait"));
  });

  it("keeps the current orientation within the same kind", () => {
    expect(selectPresetSize("a5", landscapeA4)).toEqual(presetSize("a5", "landscape"));
    expect(selectPresetSize("b5", A4)).toEqual(presetSize("b5", "portrait"));
    // 使用者把簡報轉成直式後換另一種簡報：照樣直式
    expect(selectPresetSize("ppt4x3", presetSize("ppt16x9", "portrait"))).toEqual(presetSize("ppt4x3", "portrait"));
    // 自訂的橫式尺寸當成紙張：換紙張保留橫式
    expect(selectPresetSize("a4", { width: 700, height: 500 })).toEqual(landscapeA4);
  });
});

describe("validatePageSetup", () => {
  it("accepts a normal setup", () => {
    expect(isPageSetupValid(validatePageSetup(A4, margins))).toBe(true);
  });

  it("rejects sizes and margins out of range", () => {
    expect(validatePageSetup({ width: mmToPt(5), height: A4.height }, margins).size).toBeDefined();
    expect(validatePageSetup(A4, { ...margins, top: -1 }).margins).toBeDefined();
  });

  it("requires the margins to leave room on the page", () => {
    const errors = validatePageSetup({ width: 100, height: 100 }, { top: 60, bottom: 40, left: 50, right: 49 });
    expect(errors).toEqual({ vertical: "上、下邊界合計必須小於頁高" });
    expect(Object.keys(validatePageSetup({ width: 100, height: 100 }, { top: 60, bottom: 60, left: 60, right: 60 }))).toEqual([
      "horizontal",
      "vertical",
    ]);
  });
});
