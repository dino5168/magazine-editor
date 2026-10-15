import { describe, expect, it } from "vitest";
import type { ProjectContent } from "@/lib/project/project-types";
import {
  addDraftSwatch,
  draftNameErrors,
  draftUsage,
  editDraftSwatch,
  finishSwatchDraft,
  moveDraftSwatch,
  removeDraftSwatch,
  startSwatchDraft,
} from "../swatch-draft";
import { applySwatchEdits, swatchUsage } from "../swatches";
import type { ShapeElement } from "../types";
import fixtureJson from "../../../../tests/fixtures/sample.magproj?raw";

const document = (JSON.parse(fixtureJson) as ProjectContent).document;
const ids = new Set(document.swatches.map((s) => s.id));
const usage = swatchUsage(document);

describe("swatch draft", () => {
  it("adds swatches with the next free name and edits them", () => {
    const added = addDraftSwatch(startSwatchDraft(document), "new", "#0ea5e9");
    expect(added.swatches[added.swatches.length - 1]).toEqual({ id: "new", name: "色票 1", color: "#0ea5e9" });
    const edited = editDraftSwatch(added, "new", { name: "天藍" });
    expect(edited.swatches[edited.swatches.length - 1].name).toBe("天藍");
    expect(draftUsage(edited, usage).get("new")).toBe(0);
  });

  it("moves swatches", () => {
    const draft = startSwatchDraft(document);
    expect(moveDraftSwatch(draft, 0, 2).swatches.map((s) => s.id).slice(0, 3)).toEqual(["swatch-white", "swatch-brand", "swatch-text"]);
    expect(moveDraftSwatch(draft, 1, 1)).toBe(draft);
    expect(moveDraftSwatch(draft, 0, 99)).toBe(draft);
  });

  it("removes swatches, recording deletions only for the document's own", () => {
    const added = addDraftSwatch(startSwatchDraft(document), "new", "#0ea5e9");
    const dropped = removeDraftSwatch(added, "new", null, ids);
    expect(dropped.deletions).toEqual([]);
    const removed = removeDraftSwatch(added, "swatch-brand", "new", ids);
    expect(removed.deletions).toEqual([{ id: "swatch-brand", replaceWith: "new" }]);
    // 用到「品牌紅」的三處會換到新色票
    expect(draftUsage(removed, usage).get("new")).toBe(3);
    expect(removeDraftSwatch(added, "swatch-brand", "swatch-brand", ids)).toBe(added);
    expect(removeDraftSwatch(added, "swatch-brand", "missing", ids)).toBe(added);
  });

  it("follows chains: deleting a replacement moves its new uses on", () => {
    let draft = removeDraftSwatch(startSwatchDraft(document), "swatch-brand", "swatch-indigo", ids);
    draft = removeDraftSwatch(draft, "swatch-indigo", "swatch-text", ids);
    expect(draft.deletions).toEqual([
      { id: "swatch-brand", replaceWith: "swatch-text" },
      { id: "swatch-indigo", replaceWith: "swatch-text" },
    ]);
    expect(draftUsage(draft, usage).get("swatch-text")).toBe(2 + 3 + 3);
    // 換到之後又被刪掉的新色票：鏈接到它的替代
    let viaNew = addDraftSwatch(startSwatchDraft(document), "new", "#0ea5e9");
    viaNew = removeDraftSwatch(viaNew, "swatch-brand", "new", ids);
    viaNew = removeDraftSwatch(viaNew, "new", null, ids);
    expect(viaNew.deletions).toEqual([{ id: "swatch-brand", replaceWith: null }]);
    // 草稿一定能被 applySwatchEdits 接受，結果和預期一致
    const finished = finishSwatchDraft(draft);
    const applied = applySwatchEdits(document, finished.swatches, finished.deletions)!;
    const ellipse = applied.pages[0].elements.find((e) => e.id === "el-ellipse") as ShapeElement;
    expect(ellipse.stroke).toMatchObject({ color: "#171717", swatchId: "swatch-text" });
  });

  it("reports name problems and trims names when finishing", () => {
    const draft = editDraftSwatch(editDraftSwatch(startSwatchDraft(document), "swatch-white", { name: " 文字 " }), "swatch-brand", { name: "  " });
    const errors = draftNameErrors(draft);
    expect(errors.get("swatch-white")).toBe("已經有名為「文字」的色票");
    expect(errors.get("swatch-text")).toBe("已經有名為「文字」的色票");
    expect(errors.get("swatch-brand")).toBe("名稱不可為空白");
    const fine = editDraftSwatch(startSwatchDraft(document), "swatch-white", { name: " 紙白 " });
    expect(draftNameErrors(fine).size).toBe(0);
    expect(finishSwatchDraft(fine).swatches[1].name).toBe("紙白");
  });
});
