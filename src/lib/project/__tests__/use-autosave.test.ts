import { describe, expect, it } from "vitest";
import { createBlankDocument } from "@/lib/editor/element-factory";
import type { ProjectSnapshot } from "../project-context";
import { decideAutosave, type WrittenBackup } from "../use-autosave";

const info = { id: "p1", root: "/projects/p1", untitled: false };
const document = createBlankDocument();
const assets = [] as const;

function snapshot(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return { info, content: { document, assets }, dirty: true, ...overrides };
}

const written: WrittenBackup = { projectId: "p1", document, assets };

describe("decideAutosave", () => {
  it("writes new unsaved content once", () => {
    expect(decideAutosave(snapshot(), null)).toBe("write");
    expect(decideAutosave(snapshot(), written)).toBe("none");
    expect(decideAutosave(snapshot({ content: { document: { ...document }, assets } }), written)).toBe("write");
    expect(decideAutosave(snapshot({ content: { document, assets: [] } }), written)).toBe("write");
  });

  it("clears the backup once nothing is unsaved", () => {
    expect(decideAutosave(snapshot({ dirty: false }), written)).toBe("clear");
    expect(decideAutosave(snapshot({ dirty: false }), null)).toBe("none");
  });

  it("ignores a backup written for another project (Rust already deleted it)", () => {
    const other: WrittenBackup = { ...written, projectId: "p0" };
    expect(decideAutosave(snapshot(), other)).toBe("write");
    expect(decideAutosave(snapshot({ dirty: false }), other)).toBe("none");
  });

  it("does nothing without a project", () => {
    expect(decideAutosave(snapshot({ info: null }), null)).toBe("none");
  });
});
