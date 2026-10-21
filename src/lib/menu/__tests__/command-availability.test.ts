import { describe, expect, it } from "vitest";
import { createPage } from "@/lib/editor/element-factory";
import { presetSize } from "@/lib/editor/page-setup";
import { PPTX_PROBLEMS } from "@/lib/export/pptx-export";
import { COMMAND_IDS } from "../commands";
import { commandDisabledReason, staticDisabledReason } from "../command-availability";

const documentOf = (...sizes: ReturnType<typeof presetSize>[]) => ({
  pages: sizes.map((size, index) => createPage(`Page-${index + 1}`, size, "#ffffff")),
});
const slides = documentOf(presetSize("ppt16x9", "landscape"));
const paper = documentOf(presetSize("a4", "portrait"));

describe("commandDisabledReason", () => {
  it("enables PowerPoint export only for a slide-size document", () => {
    expect(commandDisabledReason("file.exportPptx", slides)).toBeUndefined();
    expect(commandDisabledReason("file.exportPptx", paper)).toBe(PPTX_PROBLEMS.notSlideSize);
    expect(
      commandDisabledReason("file.exportPptx", documentOf(presetSize("ppt16x9", "landscape"), presetSize("ppt4x3", "landscape"))),
    ).toBe(PPTX_PROBLEMS.mixedSizes);
  });

  it("leaves every other command to its fixed reason, whatever the document", () => {
    for (const id of COMMAND_IDS.filter((id) => id !== "file.exportPptx")) {
      expect(commandDisabledReason(id, paper)).toBe(staticDisabledReason(id));
      expect(commandDisabledReason(id, slides)).toBe(staticDisabledReason(id));
    }
  });
});
