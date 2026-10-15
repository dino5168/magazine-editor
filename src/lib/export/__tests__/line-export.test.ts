import { describe, expect, it } from "vitest";
import { DEFAULT_MARGINS, createLineElement, createMasterPage, createPage } from "@/lib/editor/element-factory";
import { linePaths } from "@/lib/editor/line-path";
import { findShapePreset } from "@/lib/editor/shape-presets";
import type { EditorDocument, LineElement, Stroke } from "@/lib/editor/types";
import { isElementColor, isShapeGeometry } from "@/lib/editor/validation";
import { buildExportRequest, masterCopyId, skippedShapeCount } from "../export-request";
import { LINE_EXPORT_PRESET, LINE_HEADS_EXPORT_PRESET, exportedLinePieces, lineHeadsId } from "../line-export";

const measureWidth = (text: string, style: { fontSize: number }) => Array.from(text).length * style.fontSize * 0.5;
const measure = () => ({ lines: [""], baseline: 10, lineWidths: [0] });
const stroke: Stroke = { color: "#4f46e580", swatchId: "swatch-indigo", width: 2, dash: "dashed" };

const arrow = (start: LineElement["start"]["arrowhead"], end: LineElement["end"]["arrowhead"]) =>
  createLineElement(
    [
      { x: 100, y: 200 },
      { x: 300, y: 260 },
    ],
    { stroke, start: { arrowhead: start, scale: 1 }, end: { arrowhead: end, scale: 1 } },
  );

describe("exportedLinePieces", () => {
  it("draws the line with its stroke and the filled heads as a second, unstroked shape on top", () => {
    const line = arrow("none", "triangle");
    const paths = linePaths(line);
    const [body, heads] = exportedLinePieces(line);
    expect(body.shape).toMatchObject({
      id: line.id,
      x: line.x,
      y: line.y,
      rotation: 0,
      geometry: { kind: "preset", preset: LINE_EXPORT_PRESET, params: {} },
      fill: "#00000000",
      label: null,
      // 色票連結不帶過去，顏色（含透明度）與虛線照舊
      stroke: { ...stroke, swatchId: null },
    });
    expect(body.path).toEqual({ outline: paths.stroke, details: [], detailStroke: null });
    expect(heads.shape).toMatchObject({ id: lineHeadsId(line.id), fill: stroke.color, stroke: null, geometry: { preset: LINE_HEADS_EXPORT_PRESET } });
    expect(heads.path.outline).toEqual(paths.fills);
    // 匯出驗證也收：geometry 格式、顏色、寬高 > 0、id ≤ 64 字
    for (const { shape } of [body, heads]) {
      expect(isShapeGeometry(shape.geometry)).toBe(true);
      expect(isElementColor(shape.fill)).toBe(true);
      expect(shape.width).toBeGreaterThan(0);
      expect(shape.height).toBeGreaterThan(0);
      expect(shape.id.length).toBeLessThanOrEqual(64);
    }
    // 不是圖形庫的圖形：畫布不會把它當成圖形
    expect(findShapePreset(LINE_EXPORT_PRESET)).toBeUndefined();
    expect(findShapePreset(LINE_HEADS_EXPORT_PRESET)).toBeUndefined();
  });

  it("draws open heads as solid details of the line", () => {
    const line = arrow("open", "none");
    const pieces = exportedLinePieces(line);
    expect(pieces).toHaveLength(1);
    expect(pieces[0].path.details).toEqual(linePaths(line).outlines);
    expect(pieces[0].path.detailStroke).toEqual({ ...stroke, swatchId: null, dash: "solid" });
  });

  it("strokes a double line's two thin lines a third of the width; open heads keep the full width", () => {
    const line = { ...arrow("open", "none"), compound: "double" } as LineElement;
    const [body] = exportedLinePieces(line);
    expect(body.shape.stroke?.width).toBeCloseTo(stroke.width / 3);
    expect(body.path.outline.filter((command) => command.op === "M")).toHaveLength(2);
    expect(body.path.detailStroke?.width).toBe(stroke.width);
  });

  it("gives a horizontal line a box with some height", () => {
    const rule = createLineElement([
      { x: 0, y: 100 },
      { x: 200, y: 100 },
    ]);
    const [body] = exportedLinePieces(rule);
    expect(body.shape.height).toBeGreaterThan(0);
  });

  it("uses the open heads as the outline when the heads cover the whole line", () => {
    const short = createLineElement(
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
      ],
      { stroke: { ...stroke, width: 4 }, start: { arrowhead: "open", scale: 1 }, end: { arrowhead: "triangle", scale: 1 } },
    );
    const pieces = exportedLinePieces(short);
    expect(linePaths(short).stroke).toEqual([]);
    expect(pieces.map((piece) => piece.path.outline.length > 0)).toEqual([true, true]);
    expect(pieces[0].shape.stroke?.dash).toBe("solid");
  });
});

describe("buildExportRequest with lines", () => {
  it("replaces every line, master copies included, by path shapes the export draws", () => {
    const master = createMasterPage("Master A", { width: 595, height: 842 }, "#ffffff", null);
    const onMaster = arrow("none", "none");
    const onPage = arrow("triangle", "open");
    const page = { ...createPage("P", { width: 595, height: 842 }, "#ffffff", master.id), elements: [onPage] };
    const document: EditorDocument = {
      name: "測試",
      margins: DEFAULT_MARGINS,
      textStyles: [],
      swatches: [{ id: "swatch-indigo", name: "靛藍", color: "#4f46e5" }],
      fonts: [],
      pageNumberRules: [],
      masters: [{ ...master, elements: [onMaster] }],
      pages: [page],
    };

    const request = buildExportRequest(document, measure, measureWidth);

    const elements = request.document.pages[0].elements;
    expect(elements.some((element) => element.type === "line")).toBe(false);
    // 主頁的線在最下面（一個片段），頁面的線：線本身 + 實心箭頭
    expect(elements.map((element) => element.id)).toEqual([masterCopyId(0, 0), onPage.id, lineHeadsId(onPage.id)]);
    for (const element of elements) expect(request.shapePaths).toHaveProperty(element.id);
    expect(request.shapePaths[onPage.id].details.length).toBeGreaterThan(0);
    expect(skippedShapeCount(request)).toBe(0);
    // 原本的文件不變
    expect(document.pages[0].elements).toEqual([onPage]);
  });
});
