import { describe, expect, it } from "vitest";
import { createBlankDocument } from "../element-factory";
import { contentArea } from "../content-align";
import { linePagePoints } from "../line-geometry";
import { createPresetLine, LINE_PRESETS } from "../line-presets";
import { BUILT_IN_SWATCH_IDS } from "../swatches";
import { isValidLine } from "../validation";

describe("line presets", () => {
  const document = createBlankDocument();
  const page = document.pages[0];
  const area = contentArea(page, document.margins);
  const centre = { x: page.width / 2, y: page.height / 2 };

  it("all make valid lines, linked to the 文字 swatch, with unique ids", () => {
    expect(new Set(LINE_PRESETS.map((preset) => preset.id)).size).toBe(LINE_PRESETS.length);
    for (const preset of LINE_PRESETS) {
      const line = createPresetLine(preset, centre, document.swatches, area);
      expect(isValidLine(line), preset.id).toBe(true);
      expect(line.stroke).toMatchObject({ swatchId: BUILT_IN_SWATCH_IDS.text, width: preset.width, dash: preset.dash });
    }
  });

  it("centres a preset on the point, and spans the content area with a rule", () => {
    const arrow = LINE_PRESETS.find((preset) => preset.id === "arrow")!;
    const placed = linePagePoints(createPresetLine(arrow, centre, [], area));
    expect((placed[0].x + placed[1].x) / 2).toBeCloseTo(centre.x);
    const rule = LINE_PRESETS.find((preset) => preset.id === "rule")!;
    expect(linePagePoints(createPresetLine(rule, centre, [], area))).toEqual([
      { x: area.minX, y: centre.y },
      { x: area.maxX, y: centre.y },
    ]);
  });
});
