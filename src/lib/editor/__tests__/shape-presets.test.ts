import { describe, expect, it } from "vitest";
import fixtureJson from "../../../../tests/fixtures/sample.magproj?raw";
import { pathBounds, type PathCommand } from "../shape-path";
import {
  detailStroke,
  findShapePreset,
  presetParamFromField,
  presetParamToField,
  presetParamUnit,
  presetPath,
  resolvePresetParams,
  SHAPE_CATEGORIES,
  SHAPE_LIBRARY,
  type ShapePreset,
} from "../shape-presets";
import type { EditorDocument, ShapeElement, ShapeGeometry } from "../types";
import { isShapeGeometry, isShapePresetName, SHAPE_PRESET_PARAMS_MAX } from "../validation";

type PresetGeometry = Extract<ShapeGeometry, { kind: "preset" }>;

const geometry = (preset: string, params: Record<string, number> = {}): PresetGeometry => ({ kind: "preset", preset, params });
const ops = (commands: readonly PathCommand[]) => commands.map((command) => command.op).join("");
const BOXES = [
  { width: 140, height: 100 },
  { width: 300, height: 40 },
  { width: 30, height: 200 },
];

describe("shape library definitions", () => {
  it("has unique, storable ids and parameters within their own ranges", () => {
    const ids = SHAPE_LIBRARY.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of SHAPE_LIBRARY) {
      expect(isShapePresetName(preset.id), preset.id).toBe(true);
      expect(SHAPE_CATEGORIES.some((category) => category.id === preset.category), preset.id).toBe(true);
      expect(preset.params.length).toBeLessThanOrEqual(SHAPE_PRESET_PARAMS_MAX);
      for (const param of preset.params) {
        expect(isShapePresetName(param.name), `${preset.id}.${param.name}`).toBe(true);
        expect(param.min <= param.default && param.default <= param.max, `${preset.id}.${param.name}`).toBe(true);
      }
      // 存檔用的預設參數要能通過檔案驗證
      const defaults = Object.fromEntries(preset.params.map((param) => [param.name, param.default]));
      expect(isShapeGeometry(geometry(preset.id, defaults))).toBe(true);
    }
  });

  // 每個圖形、每種外框、最小 / 預設 / 最大參數都要成立
  const cases = SHAPE_LIBRARY.flatMap((preset: ShapePreset) =>
    (["min", "default", "max"] as const).flatMap((pick) =>
      BOXES.map((box) => ({
        preset,
        box,
        params: Object.fromEntries(preset.params.map((param) => [param.name, param[pick]])),
        label: `${preset.id} ${pick} ${box.width}×${box.height}`,
      })),
    ),
  );

  it.each(cases)("$label: closed outline of M / L / C / Z touching every edge of the box", ({ preset, box, params }) => {
    const { outline, details } = presetPath(geometry(preset.id, params), box.width, box.height)!;
    expect(ops(outline)).toMatch(/^(M[LC]+Z)+$/);
    expect(ops(details)).toMatch(/^(M[LC]+Z?)*$/);
    const bounds = pathBounds(outline)!;
    expect(bounds.minX).toBeCloseTo(0, 6);
    expect(bounds.minY).toBeCloseTo(0, 6);
    expect(bounds.maxX).toBeCloseTo(box.width, 6);
    expect(bounds.maxY).toBeCloseTo(box.height, 6);
    // 細節線在外框以內
    const detailBounds = pathBounds(details);
    if (detailBounds) {
      expect(detailBounds.minX).toBeGreaterThanOrEqual(-1e-6);
      expect(detailBounds.minY).toBeGreaterThanOrEqual(-1e-6);
      expect(detailBounds.maxX).toBeLessThanOrEqual(box.width + 1e-6);
      expect(detailBounds.maxY).toBeLessThanOrEqual(box.height + 1e-6);
    }
    for (const command of [...outline, ...details]) {
      for (const value of Object.values(command)) if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
    }
  });
});

describe("resolvePresetParams", () => {
  const hexagon = findShapePreset("hexagon")!;

  it("uses defaults for missing or broken values, clamps the rest and drops unknown names", () => {
    expect(resolvePresetParams(hexagon, {})).toEqual({ size: 0.25 });
    expect(resolvePresetParams(hexagon, { size: Number.NaN })).toEqual({ size: 0.25 });
    expect(resolvePresetParams(hexagon, { size: 2 })).toEqual({ size: 0.5 });
    expect(resolvePresetParams(hexagon, { size: -1, other: 3 })).toEqual({ size: 0 });
  });
});

describe("presetPath", () => {
  it("returns null for a shape this version does not know", () => {
    expect(presetPath(geometry("some-future-shape"), 100, 100)).toBeNull();
  });

  it("stretches ratio parameters with the box", () => {
    const { outline } = presetPath(geometry("hexagon", { size: 0.2 }), 200, 100)!;
    expect(outline[0]).toEqual({ op: "M", x: 40, y: 0 });
    expect(outline[2]).toEqual({ op: "L", x: 200, y: 50 });
  });

  it("keeps pt parameters the same size however the box is stretched, within what the box holds", () => {
    // 圓柱頂部橢圓的前緣：最低點 = 頂部高度
    const front = (height: number, size = 20) => pathBounds(presetPath(geometry("cylinder", { size }), 100, height)!.details)!;
    expect(front(120).maxY).toBeCloseTo(20);
    expect(front(400).maxY).toBeCloseTo(20);
    // 外框只有 30 高時，頂部最多半個圖形高
    expect(front(30).maxY).toBeCloseTo(15);
  });

  it("draws the fixture's master-page hexagon", () => {
    const document = (JSON.parse(fixtureJson) as { document: EditorDocument }).document;
    const shape = document.masters
      .flatMap((master) => master.elements)
      .find((element): element is ShapeElement => element.type === "shape" && element.geometry.kind === "preset")!;
    if (shape.geometry.kind !== "preset") throw new Error("expected a preset");
    const { outline } = presetPath(shape.geometry, shape.width, shape.height)!;
    expect(outline[0]).toEqual({ op: "M", x: 12, y: 0 });
  });
});

describe("detailStroke", () => {
  it("follows the border when the shape has one", () => {
    const stroke = { color: "#1d4ed8", swatchId: "swatch-x", width: 3, dash: "dashed" } as const;
    expect(detailStroke(stroke, "#ffffff")).toBe(stroke);
  });

  it("otherwise draws 1 pt solid, darker than the fill, with the fill's opacity", () => {
    expect(detailStroke(null, "#ffffff")).toEqual({ color: "#8c8c8c", swatchId: null, width: 1, dash: "solid" });
    expect(detailStroke(null, "#0ea5e980").color).toBe("#085b8080");
    expect(detailStroke(null, "#0ea5e900").color).toBe("#525252");
  });
});

describe("parameter fields", () => {
  const [ratio] = findShapePreset("hexagon")!.params;
  const [pt] = findShapePreset("cylinder")!.params;

  it("shows ratios as % and pt as stored", () => {
    expect([presetParamToField(ratio, 0.25), presetParamUnit(ratio)]).toEqual([25, "%"]);
    expect([presetParamToField(pt, 15), presetParamUnit(pt)]).toEqual([15, "pt"]);
  });

  it("stores typed numbers clamped to the parameter's range", () => {
    expect(presetParamFromField(ratio, 30)).toBeCloseTo(0.3);
    expect(presetParamFromField(ratio, 80)).toBe(0.5);
    expect(presetParamFromField(pt, -5)).toBe(0);
    expect(presetParamFromField(pt, 24)).toBe(24);
  });
});
