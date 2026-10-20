import { describe, expect, it } from "vitest";
import { createInitialState } from "@/lib/editor/editor-reducer";
import { createBlankDocument } from "@/lib/editor/element-factory";
import type { ShapeElement } from "@/lib/editor/types";
import { BATCH_OPS_MAX } from "../batch";
import { toolSession } from "./tool-session";

function blankSession() {
  return toolSession(createInitialState(createBlankDocument()));
}

/** A new page with a text and a red rectangle, the rectangle moved afterwards. */
const PAGE_OPS = [
  { tool: "add_page", args: {} },
  { tool: "add_text", args: { pageId: { $ref: "0.pages.0.id" }, text: "標題", x: 40, y: 40 } },
  { tool: "add_shape", args: { pageId: { $ref: "0.pages.0.id" }, shape: "rect", x: 40, y: 100, width: 200, height: 120 } },
  { tool: "update_element", args: { id: { $ref: "2.id" }, fill: "#ff0000", x: 60 } },
];

describe("batch", () => {
  it("runs every operation, resolves $ref, and applies them as one undo step", () => {
    const session = blankSession();
    const before = session.state;
    const { results } = session.ok("batch", { ops: PAGE_OPS });

    expect(results).toHaveLength(4);
    const pageId = results[0].pages[0].id;
    const page = session.state.history.present.pages.find((candidate) => candidate.id === pageId)!;
    expect(page.elements.map((element) => element.id)).toEqual([results[1].id, results[2].id]);
    expect(page.elements[1]).toMatchObject({ x: 60, fill: "#ff0000" } satisfies Partial<ShapeElement>);
    expect(session.state.activePageId).toBe(pageId);
    expect(session.state.history.past).toEqual([before.history.present]);

    session.ok("undo");
    expect(session.state.history.present).toBe(before.history.present);
  });

  it("lets queries see the document as it is at that point of the batch", () => {
    const session = blankSession();
    const { results } = session.ok("batch", {
      ops: [
        { tool: "add_text", args: { text: "一", x: 0, y: 0 } },
        { tool: "list_elements", args: {} },
        { tool: "get_element", args: { id: { $ref: "0.id" } } },
      ],
    });

    expect(results[1].elements.map((element: { id: string }) => element.id)).toEqual([results[0].id]);
    expect(results[2].element.text).toBe("一");
  });

  it("leaves the history alone when only queries run", () => {
    const session = blankSession();
    const before = session.state;
    session.ok("batch", { ops: [{ tool: "get_document" }, { tool: "list_pages", args: {} }] });

    expect(session.state).toBe(before);
  });

  it("rolls back the whole batch when an operation fails, naming it", () => {
    const session = blankSession();
    const before = session.state;
    const message = session.error("batch", {
      ops: [...PAGE_OPS.slice(0, 3), { tool: "update_element", args: { id: { $ref: "2.id" }, fill: "red" } }],
    });

    expect(message).toContain("ops[3]（update_element）");
    expect(message).toContain("參數 fill");
    expect(message).toContain("整批沒有套用");
    expect(session.state).toBe(before);
  });

  it("reports bad references, unknown tools and tools that cannot be batched", () => {
    const session = blankSession();
    const before = session.state;

    expect(session.error("batch", { ops: [{ tool: "add_text", args: { text: "x", x: 0, y: 0, pageId: { $ref: "0.id" } } }] })).toContain(
      "ops[0]（add_text）：$ref「0.id」",
    );
    expect(session.error("batch", { ops: [{ tool: "add_page" }, { tool: "make_coffee" }] })).toContain("make_coffee");
    for (const tool of ["batch", "undo", "redo", "run_command"]) {
      expect(session.error("batch", { ops: [{ tool: "add_page" }, { tool, args: {} }] })).toContain(`ops[1]（${tool}）：不能放進 batch`);
    }
    expect(session.state).toBe(before);
  });

  it("checks the shape of ops itself", () => {
    const session = blankSession();

    expect(session.error("batch", { ops: [] })).toContain("參數 ops");
    const tooMany = Array.from({ length: BATCH_OPS_MAX + 1 }, () => ({ tool: "get_document" }));
    expect(session.error("batch", { ops: tooMany })).toContain("參數 ops");
    expect(session.error("batch", { ops: [{ tool: "get_document", extra: 1 }] })).toContain("extra");
  });

  it(`handles ${BATCH_OPS_MAX} operations in one step`, () => {
    const session = blankSession();
    const ops = Array.from({ length: BATCH_OPS_MAX }, (_, index) => ({
      tool: "add_text",
      args: { text: `第 ${index} 段`, x: 0, y: index * 2 },
    }));
    const { results } = session.ok("batch", { ops });

    expect(results).toHaveLength(BATCH_OPS_MAX);
    expect(session.state.history.present.pages[0].elements).toHaveLength(BATCH_OPS_MAX);
    expect(session.state.history.past).toHaveLength(1);
  });
});
