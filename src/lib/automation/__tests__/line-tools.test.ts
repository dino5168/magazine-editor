import { describe, expect, it } from "vitest";
import { createInitialState } from "@/lib/editor/editor-reducer";
import { createBlankDocument } from "@/lib/editor/element-factory";
import { BUILT_IN_SWATCH_IDS } from "@/lib/editor/swatches";
import type { LineElement } from "@/lib/editor/types";
import { toolSession } from "./tool-session";

const session = () => toolSession(createInitialState(createBlankDocument()));
const detail = (s: ReturnType<typeof session>, id: string) => s.ok("get_element", { id }) as { element: LineElement; pagePoints: { x: number; y: number }[] };

describe("add_line", () => {
  it("adds a line through page points, styled like the line tool by default", () => {
    const s = session();
    const { id } = s.ok("add_line", {
      points: [
        { x: 100, y: 300 },
        { x: 400, y: 300 },
      ],
    });
    const { element, pagePoints } = detail(s, id);
    expect(element).toMatchObject({ type: "line", x: 100, y: 300, path: "straight", compound: "single" });
    expect(element.stroke).toEqual({ color: "#171717", swatchId: BUILT_IN_SWATCH_IDS.text, width: 1, dash: "solid" });
    expect(element.start.arrowhead).toBe("none");
    expect(pagePoints).toEqual([
      { x: 100, y: 300 },
      { x: 400, y: 300 },
    ]);
    expect(s.state.history.past).toHaveLength(1);
  });

  it("takes arrowheads, a curve, a double line, color, width and dash", () => {
    const s = session();
    const { id } = s.ok("add_line", {
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 40 },
        { x: 100, y: 0 },
      ],
      path: "smooth",
      color: { swatch: "文字", opacity: 0.5 },
      width: 2,
      dash: "dashDot",
      end: { arrowhead: "triangle", scale: 1.5 },
      start: { arrowhead: "open" },
    });
    const { element } = detail(s, id);
    expect(element).toMatchObject({ path: "smooth", start: { arrowhead: "open", scale: 1 }, end: { arrowhead: "triangle", scale: 1.5 } });
    expect(element.stroke).toEqual({ color: "#17171780", swatchId: BUILT_IN_SWATCH_IDS.text, width: 2, dash: "dashDot" });
    const double = s.ok("add_line", { points: [{ x: 0, y: 0 }, { x: 90, y: 0 }], compound: "double", width: 3 });
    expect(detail(s, double.id).element.compound).toBe("double");
  });

  it("rejects bad input with a message and changes nothing", () => {
    const s = session();
    expect(s.error("add_line", { points: [{ x: 0, y: 0 }] })).toContain("參數 points");
    expect(s.error("add_line", { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], path: "smooth", compound: "double" })).toContain("雙線");
    expect(s.error("add_line", { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], end: { arrowhead: "circle" } })).toContain("參數 end");
    expect(s.state.history.past).toHaveLength(0);
  });
});

describe("update_element on lines", () => {
  it("replaces the points (page coordinates), keeps the arrowhead size when only the kind changes", () => {
    const s = session();
    const { id } = s.ok("add_line", { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], end: { arrowhead: "triangle", scale: 1.5 } });
    s.ok("update_element", { id, points: [{ x: 50, y: 50 }, { x: 150, y: 120 }, { x: 250, y: 50 }], end: { arrowhead: "open" } });
    const { element, pagePoints } = detail(s, id);
    expect(pagePoints).toEqual([{ x: 50, y: 50 }, { x: 150, y: 120 }, { x: 250, y: 50 }]);
    expect(element).toMatchObject({ x: 50, y: 50, end: { arrowhead: "open", scale: 1.5 } });
    s.ok("update_element", { id, stroke: { color: "#be123c", width: 4, dash: "dashed" }, x: 10 });
    expect(detail(s, id).element).toMatchObject({ x: 10, stroke: { color: "#be123c", swatchId: null, width: 4, dash: "dashed" } });
  });

  it("explains what does not fit a line", () => {
    const s = session();
    const { id } = s.ok("add_line", { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], path: "smooth" });
    expect(s.error("update_element", { id, width: 50 })).toContain("線條不能修改：width");
    expect(s.error("update_element", { id, stroke: null })).toContain("stroke 不能是 null");
    expect(s.error("update_element", { id, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], x: 5 })).toContain("不能同時給 x / y");
    expect(s.error("update_element", { id, compound: "double" })).toContain("雙線");
    // 圖形不收線條的欄位
    const shape = s.ok("add_shape", { shape: "rect", x: 0, y: 0, width: 50, height: 50 });
    expect(s.error("update_element", { id: shape.id, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })).toContain("圖形不能修改：points");
  });
});

describe("list_elements with lines", () => {
  it("reports the line's type, bounding size and summary", () => {
    const s = session();
    s.ok("add_line", { points: [{ x: 10, y: 20 }, { x: 110, y: 70 }], end: { arrowhead: "triangle" } });
    const [line] = s.ok("list_elements").elements;
    expect(line).toMatchObject({ type: "line", x: 10, y: 20, width: 100, height: 50 });
    expect(line.summary).toContain("箭頭");
  });
});
