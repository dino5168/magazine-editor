import { describe, expect, it } from "vitest";
import { createInitialState, editorReducer, selectActivePage } from "@/lib/editor/editor-reducer";
import { createBlankDocument, createMediaElement } from "@/lib/editor/element-factory";
import type { MediaElement } from "@/lib/editor/types";
import type { Library } from "@/lib/library/types";
import type { YouTubeInfo } from "@/lib/project/project-types";
import { NO_COMMANDS, toolSession } from "./tool-session";
import libraryJson from "../../../../tests/fixtures/sample-library.json?raw";

const library = JSON.parse(libraryJson) as Library;
const state = createInitialState(createBlankDocument());
const URL = "https://www.youtube.com/watch?v=C5fjrag2Fcg&t=1m30s";
const INFO: YouTubeInfo = { poster: { src: "assets/images/p.jpg", width: 480, height: 360 }, title: "五十音", availability: "ok" };

/** A session whose YouTube answers `info` and records which ids were asked. */
function videoSession(info: YouTubeInfo | null) {
  const asked: string[] = [];
  const session = toolSession(state, NO_COMMANDS, library, {
    fetchVideoInfo: async (videoId) => {
      asked.push(videoId);
      return info;
    },
  });
  const videos = () => selectActivePage(session.state).elements.filter((e): e is MediaElement => e.type === "media");
  return { session, asked, videos };
}

describe("add_video", () => {
  it("adds the video with YouTube's poster and title, centered, as one undo step", async () => {
    const { session, asked, videos } = videoSession(INFO);
    const result = await session.callAsync("add_video", { url: URL });
    expect(result.error).toBeNull();
    expect(asked).toEqual(["C5fjrag2Fcg"]);
    expect(result.data).toMatchObject({ title: "五十音", hasPoster: true, availability: "ok" });
    // 預設大小：最寬 320 pt、不超過頁寬一半（A4 是 595.28 pt）
    expect((result.data as { width: number }).width).toBeCloseTo(selectActivePage(session.state).width / 2, 6);
    const [video] = videos();
    expect(video).toMatchObject({ source: { kind: "youtube", videoId: "C5fjrag2Fcg", start: 90 }, title: "五十音" });
    expect(video.poster?.src).toBe("assets/images/p.jpg");
    // 置中於頁面
    expect(video.x + video.width / 2).toBeCloseTo(selectActivePage(session.state).width / 2, 6);
    expect(session.state.history.past).toHaveLength(1);
  });

  it("takes position, width (16:9) and title from the arguments", async () => {
    const { session, videos } = videoSession(INFO);
    await session.callAsync("add_video", { url: URL, x: 10, y: 20, width: 160, title: " 訪談 " });
    expect(videos()[0]).toMatchObject({ x: 10, y: 20, width: 160, height: 90, title: "訪談" });
  });

  it("works offline without a poster, and reports what YouTube said", async () => {
    const { session, videos } = videoSession({ poster: null, title: null, availability: "unknown" });
    const result = await session.callAsync("add_video", { url: URL });
    expect(result.data).toMatchObject({ hasPoster: false, availability: "unknown", title: "" });
    expect(videos()[0].poster).toBeNull();
    const notEmbeddable = videoSession({ ...INFO, availability: "notEmbeddable" });
    expect((await notEmbeddable.session.callAsync("add_video", { url: URL })).data).toMatchObject({ availability: "notEmbeddable" });
  });

  it("refuses bad links, unknown pages and missing videos without asking or adding", async () => {
    const { session, asked, videos } = videoSession(INFO);
    expect((await session.callAsync("add_video", { url: "https://www.youtube.com/playlist?list=PL1" })).error?.message).toContain("不是 YouTube 影片");
    expect((await session.callAsync("add_video", { url: URL, pageId: "nope" })).error?.message).toContain("找不到頁面");
    expect(asked).toEqual([]);
    const missing = videoSession({ poster: null, title: null, availability: "notFound" });
    expect((await missing.session.callAsync("add_video", { url: URL })).error?.message).toContain("找不到這支影片");
    expect(missing.videos()).toHaveLength(0);
    expect(videos()).toHaveLength(0);
    // 參數錯誤是中文
    expect((await session.callAsync("add_video", {})).error?.message).toContain("參數 url");
  });

  it("cannot go in a batch or through the sync runner", () => {
    const { session } = videoSession(INFO);
    expect(session.call("batch", { ops: [{ tool: "add_video", args: { url: URL } }] }).error?.message).toContain("不能放進 batch");
    expect(session.call("add_video", { url: URL }).error).not.toBeNull();
  });
});

describe("video items and fields", () => {
  it("lists only videos, with id and start", () => {
    const { session } = videoSession(INFO);
    const { items } = session.ok("list_library_items", { kind: "video" });
    expect(items).toEqual([expect.objectContaining({ id: "i-video", kind: "video", videoId: "C5fjrag2Fcg", start: 90 })]);
  });

  it("places a video item as a video element, 16:9 when a width is given", () => {
    const { session, videos } = videoSession(INFO);
    const placed = session.ok("place_library_item", { item: "i-video", width: 320, x: 0, y: 0 });
    expect(placed).toMatchObject({ width: 320, height: 180 });
    expect(videos()[0]).toMatchObject({ source: { videoId: "C5fjrag2Fcg", start: 90 }, title: "五十音教學", x: 0, y: 0 });
    expect(videos()[0].poster?.src).toBe("assets/images/44444444444444444444444444444444.jpg");
  });

  it("updates a video's start time and title, and refuses them on other elements", async () => {
    const { session, videos } = videoSession(INFO);
    const { id } = (await session.callAsync("add_video", { url: URL })).data as { id: string };
    session.ok("update_element", { id, startSeconds: 5, title: "新標題" });
    expect(videos()[0]).toMatchObject({ source: { start: 5 }, title: "新標題" });
    expect(session.call("update_element", { id, startSeconds: 86_401 }).error?.message).toContain("參數 startSeconds");
    const text = session.ok("add_text", { text: "x", x: 0, y: 0 });
    expect(session.call("update_element", { id: text.id, title: "x" }).error?.message).toContain("不能修改：title");
  });

  it("refuses a start time on audio (v19) but changes its title", () => {
    const page = selectActivePage(state);
    const audio = createMediaElement({ kind: "file", src: "assets/audio/a.mp3" }, page, { x: 100, y: 100 });
    const session = toolSession(editorReducer(state, { type: "element/add", element: audio }), NO_COMMANDS, library);
    expect(session.call("update_element", { id: audio.id, startSeconds: 5 }).error?.message).toContain("音訊沒有開始時間");
    session.ok("update_element", { id: audio.id, title: "訪談" });
    expect(selectActivePage(session.state).elements[0]).toMatchObject({ source: { kind: "file", src: "assets/audio/a.mp3" }, title: "訪談" });
    expect(session.ok("list_elements", {}).elements[0].summary).toContain("音訊 assets/audio/a.mp3");
  });
});
