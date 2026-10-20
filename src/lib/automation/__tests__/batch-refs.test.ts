import { describe, expect, it } from "vitest";
import { resolveRefs } from "../batch-refs";

const results = [{ pageId: "page-9" }, { id: "el-1", ids: ["a", "b"], nested: { deep: { value: 3 } } }, "plain"];

function resolved(args: unknown): unknown {
  const result = resolveRefs(args, results);
  expect(result.error).toBeNull();
  return result.data;
}

function failure(args: unknown, available: readonly unknown[] = results): string {
  const result = resolveRefs(args, available);
  expect(result.data).toBeNull();
  return result.error!.message;
}

describe("resolveRefs", () => {
  it("replaces a reference at any depth, including inside arrays", () => {
    expect(
      resolved({
        pageId: { $ref: "0.pageId" },
        ids: [{ $ref: "1.id" }, "kept"],
        stroke: { color: { $ref: "1.nested.deep.value" } },
      }),
    ).toEqual({ pageId: "page-9", ids: ["el-1", "kept"], stroke: { color: 3 } });
  });

  it("follows array indexes and returns the whole result for a bare number", () => {
    expect(resolved({ id: { $ref: "1.ids.1" } })).toEqual({ id: "b" });
    expect(resolved({ value: { $ref: "2" } })).toEqual({ value: "plain" });
    expect(resolved({ $ref: "0" })).toEqual({ pageId: "page-9" });
  });

  it("keeps the same objects when there is nothing to replace", () => {
    const args = { text: "標題", x: 1, list: [1, { a: 2 }], none: null };
    expect(resolveRefs(args, results).data).toBe(args);
  });

  it("leaves objects with $ref plus other keys alone", () => {
    const args = { value: { $ref: "0.pageId", note: "not a reference" } };
    expect(resolved(args)).toBe(args);
  });

  it("rejects references to this or later operations", () => {
    expect(failure({ id: { $ref: "3.id" } })).toContain("0–2");
    expect(failure({ id: { $ref: "0.id" } }, [])).toContain("第一個操作");
  });

  it("rejects malformed references and names them", () => {
    expect(failure({ id: { $ref: "id" } })).toContain("$ref「id」");
    expect(failure({ id: { $ref: "" } })).toContain("0.id");
    expect(failure({ id: { $ref: 1 } })).toContain("字串");
    expect(failure({ id: { $ref: "-1.id" } })).toContain("編號");
  });

  it("rejects paths the result does not have", () => {
    expect(failure({ id: { $ref: "1.missing" } })).toContain("ops[1] 的回傳值沒有「1.missing」");
    expect(failure({ id: { $ref: "1.ids.5" } })).toContain("1.ids.5");
    expect(failure({ id: { $ref: "2.length" } })).toContain("2.length");
    expect(failure({ id: { $ref: "1.toString" } })).toContain("1.toString");
  });
});
