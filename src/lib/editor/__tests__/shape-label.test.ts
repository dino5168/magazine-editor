import { describe, expect, it } from "vitest";
import { createShapeElement } from "../element-factory";
import {
  LABEL_PADDING_PT,
  createLabel,
  labelAsText,
  labelFrame,
  labelLayoutKey,
  labelTextOffset,
  shapeToPage,
  textBlockHeight,
} from "../shape-label";
import { isShapeLabel } from "../validation";

const shape = { ...createShapeElement("rect", { x: 0, y: 0 }), x: 100, y: 200, width: 120, height: 80 };

describe("labelFrame", () => {
  it("insets the shape's box by the padding", () => {
    expect(labelFrame(shape)).toEqual({ x: 4, y: 4, width: 112, height: 72 });
  });

  it("never gets a non-positive width for tiny shapes", () => {
    const tiny = { ...shape, width: 4, height: 4 };
    expect(labelFrame(tiny)).toMatchObject({ width: 1, height: 0 });
  });
});

describe("labelTextOffset", () => {
  const frame = labelFrame(shape);
  const twoLines = textBlockHeight(2, 10, 1.2); // 24

  it("aligns the text block to the top, middle or bottom of the frame", () => {
    expect(labelTextOffset(frame, "top", twoLines)).toBe(0);
    expect(labelTextOffset(frame, "middle", twoLines)).toBe(24);
    expect(labelTextOffset(frame, "bottom", twoLines)).toBe(48);
  });

  it("lets centred text overflow on both sides", () => {
    expect(labelTextOffset(frame, "middle", 100)).toBe(-14);
  });
});

describe("shapeToPage", () => {
  it("rotates shape-local points clockwise around the shape's origin", () => {
    const point = shapeToPage({ ...shape, rotation: 90 }, { x: 10, y: 0 });
    expect(point.x).toBeCloseTo(100);
    expect(point.y).toBeCloseTo(210);
  });
});

describe("labelAsText", () => {
  it("describes the label as a text element with the frame's width, rotated with the shape", () => {
    const label = { ...createLabel("標題"), fontSize: 20, align: "left" as const };
    const text = labelAsText({ ...shape, rotation: 30 }, label, { x: LABEL_PADDING_PT, y: 10 });
    expect(text).toMatchObject({
      id: labelLayoutKey(shape.id),
      type: "text",
      text: "標題",
      width: 112,
      fontSize: 20,
      align: "left",
      rotation: 30,
    });
    expect(text).not.toHaveProperty("verticalAlign");
  });
});

describe("isShapeLabel", () => {
  it("accepts the default label and rejects malformed ones", () => {
    const label = createLabel("文字");
    expect(isShapeLabel(label)).toBe(true);
    expect(isShapeLabel(null)).toBe(false);
    expect(isShapeLabel({ ...label, fontSize: 2 })).toBe(false);
    expect(isShapeLabel({ ...label, verticalAlign: "center" })).toBe(false);
    expect(isShapeLabel({ ...label, fill: "red" })).toBe(false);
    expect(isShapeLabel({ ...label, text: 1 })).toBe(false);
  });
});
