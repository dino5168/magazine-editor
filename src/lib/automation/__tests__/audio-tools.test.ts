import { describe, expect, it } from "vitest";
import { createInitialState, selectActivePage } from "@/lib/editor/editor-reducer";
import { createBlankDocument } from "@/lib/editor/element-factory";
import type { MediaElement } from "@/lib/editor/types";
import type { Library } from "@/lib/library/types";
import { NO_COMMANDS, toolSession } from "./tool-session";
import libraryJson from "../../../../tests/fixtures/sample-library.json?raw";

const library = JSON.parse(libraryJson) as Library;
const interview = library.items.find((item) => item.id === "i-interview")!;
const withWav: Library = {
  ...library,
  items: [...library.items, { ...interview, id: "i-wav", name: "原始錄音.wav", src: "assets/audio/33333333333333333333333333333333.wav" }],
};

function audioSession(lib: Library = library) {
  const session = toolSession(createInitialState(createBlankDocument()), NO_COMMANDS, lib);
  const audios = () => selectActivePage(session.state).elements.filter((e): e is MediaElement => e.type === "media" && e.source.kind === "file");
  return { session, audios };
}

describe("audio through MCP (v19)", () => {
  it("lists audio items with whether they can go on a page", () => {
    const { session } = audioSession(withWav);
    const { items } = session.ok("list_library_items", { kind: "audio" });
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "i-interview", kind: "audio", placeable: true }),
        expect.objectContaining({ id: "i-wav", kind: "audio", placeable: false }),
      ]),
    );
  });

  it("places an mp3 as a 48 pt button centered on the page, as one undo step", () => {
    const { session, audios } = audioSession();
    const placed = session.ok("place_library_item", { item: "i-interview" });
    expect(placed).toMatchObject({ width: 48, height: 48 });
    const [audio] = audios();
    const page = selectActivePage(session.state);
    expect(audio.source).toEqual({ kind: "file", src: interview.src });
    expect(audio.title).toBe(interview.name.replace(/\.mp3$/, ""));
    expect(audio.x + 24).toBeCloseTo(page.width / 2, 6);
    expect(audio.y + 24).toBeCloseTo(page.height / 2, 6);
    expect(session.state.history.past).toHaveLength(1);
  });

  it("keeps the button square when a width is given, and places it where asked", () => {
    const { session, audios } = audioSession();
    expect(session.ok("place_library_item", { item: "i-interview", width: 80, x: 10, y: 20 })).toMatchObject({ width: 80, height: 80 });
    expect(audios()[0]).toMatchObject({ x: 10, y: 20, width: 80, height: 80 });
  });

  it("refuses other formats without changing anything", () => {
    const { session } = audioSession(withWav);
    const before = session.state;
    expect(session.error("place_library_item", { item: "i-wav" })).toContain("只有 mp3");
    expect(session.state).toBe(before);
  });

  it("works in a batch: place, then retitle with $ref", () => {
    const { session, audios } = audioSession();
    session.ok("batch", {
      ops: [
        { tool: "place_library_item", args: { item: "i-interview" } },
        { tool: "update_element", args: { id: { $ref: "0.id" }, title: "第一段訪談" } },
      ],
    });
    expect(audios()[0].title).toBe("第一段訪談");
    expect(session.state.history.past).toHaveLength(1);
  });

  it("shows which library item plays, and names audio in errors", () => {
    const { session } = audioSession();
    const { id } = session.ok("place_library_item", { item: "i-interview" });
    expect(session.ok("get_element", { id })).toMatchObject({ audioItem: { id: "i-interview", name: interview.name } });
    expect(session.error("update_element", { id, fill: "#ff0000" })).toContain("音訊不能修改：fill");
    // 素材庫已經沒有這一筆：audioItem 是 null
    const orphan = toolSession(session.state, NO_COMMANDS, { ...library, items: [] });
    expect(orphan.ok("get_element", { id })).toMatchObject({ audioItem: null });
  });
});
