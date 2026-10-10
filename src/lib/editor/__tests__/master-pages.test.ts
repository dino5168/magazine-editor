import { describe, expect, it } from "vitest";
import { DEFAULT_MARGINS, createShapeElement, nextPageNames } from "../element-factory";
import {
  MASTER_DEPTH_MAX,
  canSetParent,
  copyElements,
  deleteMaster,
  findSheet,
  inheritedElements,
  isMasterGraphValid,
  masterChain,
  nextMasterName,
  pagesUsingMaster,
} from "../master-pages";
import type { CanvasElement, EditorDocument, MasterPage, Page } from "../types";

const SIZE = { width: 600, height: 800, background: "#ffffff" };
const master = (id: string, parentId: string | null = null, elements: CanvasElement[] = []): MasterPage => ({
  ...SIZE,
  id,
  name: `Master ${id}`,
  parentId,
  elements,
});
const page = (id: string, masterId: string | null = null): Page => ({ ...SIZE, id, name: id, masterId, elements: [] });
const doc = (masters: MasterPage[], pages: Page[] = [page("p1")]): EditorDocument => ({
  name: "測試",
  margins: DEFAULT_MARGINS,
  textStyles: [],
  pageNumberRules: [],
  masters,
  pages,
});

/** A → B → … chain of `length` masters named m0 (top) … m{length-1}. */
const chain = (length: number): MasterPage[] =>
  Array.from({ length }, (_, i) => master(`m${i}`, i === 0 ? null : `m${i - 1}`));

describe("masterChain / inheritedElements", () => {
  const a = createShapeElement("rect", { x: 0, y: 0 });
  const b = createShapeElement("ellipse", { x: 0, y: 0 });
  const masters = [master("B", "A", [b]), master("A", null, [a])];

  it("lists the masters from the top-level ancestor down", () => {
    expect(masterChain(masters, "B").map((m) => m.id)).toEqual(["A", "B"]);
    expect(masterChain(masters, null)).toEqual([]);
    expect(masterChain(masters, "missing")).toEqual([]);
  });

  it("stops at a cycle instead of looping", () => {
    const cyclic = [master("A", "B"), master("B", "A")];
    expect(masterChain(cyclic, "A").map((m) => m.id)).toEqual(["B", "A"]);
  });

  it("gives a page its masters' elements, ancestor first", () => {
    expect(inheritedElements(masters, page("p", "B"))).toEqual([a, b]);
    expect(inheritedElements(masters, page("p"))).toEqual([]);
    // 主頁本身只繼承父主頁的物件，不含自己的
    expect(inheritedElements(masters, masters[0])).toEqual([a]);
  });
});

describe("pagesUsingMaster", () => {
  it("counts pages using a master directly or through a child master", () => {
    const document = doc([master("A"), master("B", "A")], [page("p1", "A"), page("p2", "B"), page("p3")]);
    expect(pagesUsingMaster(document, "A").map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(pagesUsingMaster(document, "B").map((p) => p.id)).toEqual(["p2"]);
  });
});

describe("canSetParent", () => {
  it("allows top level and existing parents, never cycles", () => {
    const masters = [master("A"), master("B", "A"), master("C", "B")];
    expect(canSetParent(masters, "A", null)).toBe(true);
    expect(canSetParent(masters, "C", "A")).toBe(true);
    expect(canSetParent(masters, "A", "C")).toBe(false);
    expect(canSetParent(masters, "A", "A")).toBe(false);
    expect(canSetParent(masters, "A", "missing")).toBe(false);
    // 新的主頁（還不在清單裡）
    expect(canSetParent(masters, "new", "C")).toBe(true);
  });

  it("limits chains to MASTER_DEPTH_MAX, counting the subtree being moved", () => {
    const masters = chain(MASTER_DEPTH_MAX);
    const last = `m${MASTER_DEPTH_MAX - 1}`;
    expect(canSetParent(masters, "new", last)).toBe(false);
    expect(canSetParent(masters, "new", `m${MASTER_DEPTH_MAX - 2}`)).toBe(true);

    // X 底下還有一層：接到倒數第二層會超過上限
    const withSubtree = [...chain(MASTER_DEPTH_MAX - 1), master("X"), master("Y", "X")];
    expect(canSetParent(withSubtree, "X", `m${MASTER_DEPTH_MAX - 3}`)).toBe(true);
    expect(canSetParent(withSubtree, "X", `m${MASTER_DEPTH_MAX - 2}`)).toBe(false);
  });
});

describe("isMasterGraphValid", () => {
  it("accepts documents without masters and valid hierarchies", () => {
    expect(isMasterGraphValid(doc([]))).toBe(true);
    expect(isMasterGraphValid(doc([master("A"), master("B", "A")], [page("p1", "B"), page("p2")]))).toBe(true);
    expect(isMasterGraphValid(doc(chain(MASTER_DEPTH_MAX)))).toBe(true);
  });

  it("rejects missing references, cycles, too deep chains and shared ids", () => {
    expect(isMasterGraphValid(doc([master("A")], [page("p1", "missing")]))).toBe(false);
    expect(isMasterGraphValid(doc([master("A", "missing")]))).toBe(false);
    expect(isMasterGraphValid(doc([master("A", "B"), master("B", "A")]))).toBe(false);
    expect(isMasterGraphValid(doc([master("A", "A")]))).toBe(false);
    expect(isMasterGraphValid(doc(chain(MASTER_DEPTH_MAX + 1)))).toBe(false);
    expect(isMasterGraphValid(doc([master("p1")]))).toBe(false);
    expect(isMasterGraphValid(doc([master("A"), master("A")]))).toBe(false);
  });
});

describe("deleteMaster", () => {
  it("moves pages and child masters to the deleted master's parent", () => {
    const document = doc([master("A"), master("B", "A"), master("C", "B")], [page("p1", "B"), page("p2", "C")]);
    const next = deleteMaster(document, "B");
    expect(next.masters.map((m) => [m.id, m.parentId])).toEqual([["A", null], ["C", "A"]]);
    expect(next.pages.map((p) => p.masterId)).toEqual(["A", "C"]);
    expect(isMasterGraphValid(next)).toBe(true);
  });

  it("leaves pages without a master when a top-level master is deleted", () => {
    const next = deleteMaster(doc([master("A")], [page("p1", "A")]), "A");
    expect(next.pages[0].masterId).toBeNull();
  });

  it("returns the same document for an unknown id", () => {
    const document = doc([master("A")]);
    expect(deleteMaster(document, "p1")).toBe(document);
  });
});

describe("names, lookup and copies", () => {
  it("names new masters with the first unused letter", () => {
    expect(nextMasterName([])).toBe("Master A");
    expect(nextMasterName([master("A"), { ...master("x"), name: "Master C" }])).toBe("Master B");
    const all = Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ", (l) => ({ ...master(l), name: `Master ${l}` }));
    expect(nextMasterName(all)).toBe("Master 27");
  });

  it("names new pages after the largest Page-N", () => {
    expect(nextPageNames([page("Page-1"), page("Page-7")], 2)).toEqual(["Page-8", "Page-9"]);
    expect(nextPageNames([page("封面")], 1)).toEqual(["Page-2"]);
  });

  it("finds pages and masters by id", () => {
    const document = doc([master("A")]);
    expect(findSheet(document, "p1")).toBe(document.pages[0]);
    expect(findSheet(document, "A")).toBe(document.masters[0]);
    expect(findSheet(document, "missing")).toBeUndefined();
  });

  it("copies elements with new ids in order", () => {
    const elements = [createShapeElement("rect", { x: 0, y: 0 }), createShapeElement("star", { x: 5, y: 5 })];
    expect(copyElements(elements, ["n1", "n2"])).toEqual([
      { ...elements[0], id: "n1" },
      { ...elements[1], id: "n2" },
    ]);
    expect(copyElements(elements, ["n1"])).toBeNull();
  });
});
