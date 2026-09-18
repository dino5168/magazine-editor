import { describe, expect, it } from "vitest";
import {
  createBlankDocument,
  createImageElement,
  createShapeElement,
  createTextElement,
} from "@/lib/editor/element-factory";
import type { CanvasElement, ElementType } from "@/lib/editor/types";
import type { ProjectContent } from "../project-types";
// 與 src-tauri 的 cargo test 共用同一份 fixture；兩邊欄位名稱不一致時，其中一邊的測試會失敗
import fixtureJson from "../../../../tests/fixtures/sample.magproj?raw";

const fixture = JSON.parse(fixtureJson) as ProjectContent;

const center = { x: 100, y: 100 };
const FACTORY_ELEMENTS: { readonly [K in ElementType]: CanvasElement } = {
  text: createTextElement("body", center),
  rect: createShapeElement("rect", center),
  ellipse: createShapeElement("ellipse", center),
  polygon: createShapeElement("triangle", center),
  star: createShapeElement("star", center),
  image: createImageElement("assets/images/a.png", { width: 10, height: 10 }, { width: 100, height: 100 }, center),
};

const sortedKeys = (value: object): string[] => Object.keys(value).sort();

describe("project file fixture", () => {
  it("uses the same element fields as the TypeScript model", () => {
    const elements = fixture.document.pages[0].elements;
    for (const [type, element] of Object.entries(FACTORY_ELEMENTS)) {
      const fromFile = elements.find((candidate) => candidate.type === type);
      expect(fromFile, `fixture is missing a ${type} element`).toBeDefined();
      expect(sortedKeys(fromFile as object)).toEqual(sortedKeys(element));
    }
  });

  it("uses the same page, document and asset fields as the TypeScript model", () => {
    const blank = createBlankDocument();
    expect(sortedKeys(fixture.document)).toEqual(sortedKeys(blank));
    expect(sortedKeys(fixture.document.pages[0])).toEqual(sortedKeys(blank.pages[0]));
    expect(sortedKeys(fixture.assets[0])).toEqual(["height", "name", "src", "width"]);
  });
});
