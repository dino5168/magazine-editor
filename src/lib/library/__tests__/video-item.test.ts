import { describe, expect, it } from "vitest";
import { createMediaElement } from "@/lib/editor/element-factory";
import { shapeImageOf } from "@/lib/editor/shape-image";
import { libraryProblem } from "../library-validation";
import { EMPTY_LIBRARY, ITEM_NAME_MAX_CHARS } from "../types";
import { mediaFromVideoItem, videoItemFromElement, videoItemFromInfo, videoItemName } from "../video-item";

const VIDEO = { videoId: "C5fjrag2Fcg", start: 90 };
const PLACE = { id: "i-new", folderId: null, importedAt: "2026-11-01T10:00:00Z" };
const POSTER = { src: "assets/images/44444444444444444444444444444444.jpg", width: 480, height: 360 };
const PAGE = { width: 800, height: 1000 };

describe("video library items", () => {
  it("is named by its title, or by its id without one", () => {
    expect(videoItemName("  訪談\n片段 ", "C5fjrag2Fcg")).toBe("訪談 片段");
    expect(videoItemName(null, "C5fjrag2Fcg")).toBe("YouTube 影片 C5fjrag2Fcg");
    expect(videoItemName("", "C5fjrag2Fcg")).toBe("YouTube 影片 C5fjrag2Fcg");
    expect(Array.from(videoItemName("影".repeat(300), "C5fjrag2Fcg"))).toHaveLength(ITEM_NAME_MAX_CHARS);
  });

  it("comes from a link and the fetched info, valid in a library", () => {
    const item = videoItemFromInfo(VIDEO, { poster: POSTER, title: "五十音", availability: "ok" }, PLACE);
    expect(item).toMatchObject({ kind: "video", src: "youtube:C5fjrag2Fcg", bytes: 0, videoId: "C5fjrag2Fcg", start: 90, name: "五十音", poster: POSTER });
    expect(libraryProblem({ ...EMPTY_LIBRARY, items: [item] })).toBeNull();
    // 沒抓到資訊：沒有封面、名稱用 id
    const bare = videoItemFromInfo(VIDEO, null, PLACE);
    expect([bare.poster, bare.name]).toEqual([null, "YouTube 影片 C5fjrag2Fcg"]);
    expect(libraryProblem({ ...EMPTY_LIBRARY, items: [bare] })).toBeNull();
  });

  it("round-trips through a page element: same video, start, title and poster image", () => {
    const element = createMediaElement({ kind: "youtube", ...VIDEO }, PAGE, { x: 400, y: 500 }, {
      poster: { ...shapeImageOf(POSTER.src, POSTER), zoom: 2 },
      title: "訪談",
    });
    const item = videoItemFromElement(element, PLACE);
    expect(item).toMatchObject({ name: "訪談", start: 90, poster: POSTER });
    const placed = mediaFromVideoItem(item, PAGE, { x: 100, y: 100 });
    expect(placed).toMatchObject({ type: "media", source: { kind: "youtube", ...VIDEO }, title: "訪談", poster: shapeImageOf(POSTER.src, POSTER) });
    expect(placed.x + placed.width / 2).toBeCloseTo(100, 6);
  });
});
