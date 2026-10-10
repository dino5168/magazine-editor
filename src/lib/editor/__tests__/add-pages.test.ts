import { describe, expect, it } from "vitest";
import {
  ADD_PAGES_MAX,
  addMasterError,
  addPagesDefaults,
  addPagesError,
  addPagesIndex,
  buildAddedPages,
  type AddPagesForm,
} from "../add-pages";
import { DEFAULT_MARGINS } from "../element-factory";
import { MASTER_DEPTH_MAX } from "../master-pages";
import type { EditorDocument, MasterPage, Page } from "../types";

const master = (id: string, parentId: string | null = null, background = "#ffffff"): MasterPage => ({
  id,
  name: `Master ${id}`,
  width: 600,
  height: 800,
  background,
  elements: [],
  parentId,
});
const page = (id: string, masterId: string | null = null): Page => ({
  id,
  name: id,
  width: 600,
  height: 800,
  background: "#f5f5f5",
  elements: [],
  masterId,
});
const doc = (masters: MasterPage[], pages: Page[]): EditorDocument => ({
  name: "測試",
  margins: DEFAULT_MARGINS,
  textStyles: [],
  pageNumberRules: [],
  masters,
  pages,
});

describe("addPagesDefaults", () => {
  const document = doc([master("A"), master("B")], [page("p1"), page("p2", "B"), page("p3")]);

  it("uses the current page's master, else the first master page", () => {
    expect(addPagesDefaults(document, "p2", "current").masterId).toBe("B");
    expect(addPagesDefaults(document, "p1", "current").masterId).toBe("A");
    expect(addPagesDefaults(doc([], [page("p1")]), "p1", "current").masterId).toBeNull();
  });

  it("uses the master page being edited", () => {
    expect(addPagesDefaults(document, "B", "current").masterId).toBe("B");
  });

  it("inserts after the current page for 插入頁面 and after the last page for 「+」", () => {
    expect(addPagesDefaults(document, "p2", "current")).toMatchObject({ count: 1, side: "after", pageNumber: 2 });
    expect(addPagesDefaults(document, "p2", "end")).toMatchObject({ side: "after", pageNumber: 3 });
    // 編輯主頁時沒有目前頁：加在最後
    expect(addPagesDefaults(document, "A", "current").pageNumber).toBe(3);
  });
});

describe("addPagesError / addPagesIndex", () => {
  const document = doc([master("A")], [page("p1"), page("p2")]);
  const form: AddPagesForm = { masterId: "A", count: 2, side: "after", pageNumber: 2 };

  it("accepts a valid form", () => {
    expect(addPagesError(form, document)).toBeNull();
    expect(addPagesError({ ...form, masterId: null, count: ADD_PAGES_MAX }, document)).toBeNull();
  });

  it("rejects bad counts, pages and masters with a message", () => {
    for (const bad of [
      { ...form, count: 0 },
      { ...form, count: 1.5 },
      { ...form, count: ADD_PAGES_MAX + 1 },
      { ...form, pageNumber: 0 },
      { ...form, pageNumber: 3 },
      { ...form, masterId: "missing" },
    ]) {
      expect(addPagesError(bad, document)).toEqual(expect.any(String));
    }
  });

  it("converts before / after a page number to an index", () => {
    expect(addPagesIndex({ ...form, side: "before", pageNumber: 1 })).toBe(0);
    expect(addPagesIndex({ ...form, side: "after", pageNumber: 1 })).toBe(1);
    expect(addPagesIndex({ ...form, side: "after", pageNumber: 2 })).toBe(2);
  });
});

describe("buildAddedPages", () => {
  it("names, sizes and colours the new pages", () => {
    const document = doc([master("A", null, "#fef3c7")], [page("Page-1"), { ...page("Page-2"), width: 400 }]);
    const pages = buildAddedPages(document, { masterId: "A", count: 2, side: "before", pageNumber: 2 });
    expect(pages.map((p) => p.name)).toEqual(["Page-3", "Page-4"]);
    expect(pages.every((p) => p.masterId === "A" && p.width === 400 && p.background === "#fef3c7")).toBe(true);
    expect(new Set(pages.map((p) => p.id)).size).toBe(2);
  });

  it("keeps the neighbour page's background without a master page", () => {
    const document = doc([], [page("Page-1")]);
    expect(buildAddedPages(document, { masterId: null, count: 1, side: "after", pageNumber: 1 })[0]).toMatchObject({
      background: "#f5f5f5",
      masterId: null,
    });
  });
});

describe("addMasterError", () => {
  it("checks the name and the depth of the parent", () => {
    expect(addMasterError("Master B", null, [master("A")])).toBeNull();
    expect(addMasterError("   ", null, [])).toEqual(expect.any(String));
    const chain = Array.from({ length: MASTER_DEPTH_MAX }, (_, i) => master(`m${i}`, i === 0 ? null : `m${i - 1}`));
    expect(addMasterError("X", `m${MASTER_DEPTH_MAX - 1}`, chain)).toEqual(expect.any(String));
    expect(addMasterError("X", `m${MASTER_DEPTH_MAX - 2}`, chain)).toBeNull();
  });
});
