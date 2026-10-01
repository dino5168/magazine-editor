import { describe, expect, it } from "vitest";
import {
  createBlankDocument,
  createImageElement,
  createShapeElement,
  createTextElement,
} from "@/lib/editor/element-factory";
import type { CanvasElement, ElementType, GeometryKind, ShapeElement, ShapeLabel, Stroke } from "@/lib/editor/types";
import type { ProjectContent } from "../project-types";
// 與 src-tauri 的 cargo test 共用同一份 fixture；兩邊欄位名稱不一致時，其中一邊的測試會失敗
import fixtureJson from "../../../../tests/fixtures/sample.magproj?raw";

const fixture = JSON.parse(fixtureJson) as ProjectContent;

const center = { x: 100, y: 100 };
const FACTORY_ELEMENTS: { readonly [K in ElementType]: CanvasElement } = {
  text: createTextElement("body", center),
  shape: createShapeElement("rect", center),
  image: createImageElement("assets/images/a.png", { width: 10, height: 10 }, { width: 100, height: 100 }, center),
};

// 每種 geometry 的欄位（kind 以外）；漏了一種會編譯失敗
const GEOMETRY_FIELDS: { readonly [K in GeometryKind]: readonly string[] } = {
  rect: ["cornerRadius"],
  ellipse: [],
  polygon: ["sides"],
  star: ["innerRatio", "numPoints"],
};

const sortedKeys = (value: object): string[] => Object.keys(value).sort();

describe("project file fixture", () => {
  const elements = fixture.document.pages[0].elements;
  const shapes = elements.filter((element): element is ShapeElement => element.type === "shape");

  it("uses the same element fields as the TypeScript model", () => {
    for (const [type, element] of Object.entries(FACTORY_ELEMENTS)) {
      const fromFile = elements.find((candidate) => candidate.type === type);
      expect(fromFile, `fixture is missing a ${type} element`).toBeDefined();
      expect(sortedKeys(fromFile as object)).toEqual(sortedKeys(element));
    }
  });

  it("covers every geometry kind with the TypeScript field names", () => {
    for (const [kind, fields] of Object.entries(GEOMETRY_FIELDS)) {
      const shape = shapes.find((candidate) => candidate.geometry.kind === kind);
      expect(shape, `fixture is missing a ${kind} shape`).toBeDefined();
      expect(sortedKeys(shape!.geometry)).toEqual(["kind", ...fields].sort());
    }
  });

  it("uses the TypeScript field names for strokes and labels", () => {
    const stroke: Stroke = { color: "#000000", width: 1, dash: "solid" };
    const label: ShapeLabel = { ...createTextElement("body", center), text: "", verticalAlign: "middle" };
    const labelKeys = ["align", "fill", "fontFamily", "fontSize", "fontStyle", "text", "verticalAlign"];
    const withStroke = shapes.find((shape) => shape.stroke !== null);
    const withLabel = shapes.find((shape) => shape.label !== null);
    expect(sortedKeys(withStroke!.stroke!)).toEqual(sortedKeys(stroke));
    expect(sortedKeys(withLabel!.label!)).toEqual(labelKeys);
    expect(Object.keys(label)).toEqual(expect.arrayContaining(labelKeys));
  });

  it("uses the same page, document and asset fields as the TypeScript model", () => {
    const blank = createBlankDocument();
    expect(sortedKeys(fixture.document)).toEqual(sortedKeys(blank));
    expect(sortedKeys(fixture.document.pages[0])).toEqual(sortedKeys(blank.pages[0]));
    expect(sortedKeys(fixture.assets[0])).toEqual(["height", "name", "src", "width"]);
  });
});
