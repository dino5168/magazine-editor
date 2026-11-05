/**
 * Library items for YouTube videos (multimedia plan step 8): made from a pasted link and what Rust
 * fetched, or from a video element on a page (「加入素材庫」). Placing one back on a page is
 * `mediaFromVideoItem`.
 */
import { createMediaElement } from "@/lib/editor/element-factory";
import { shapeImageOf } from "@/lib/editor/shape-image";
import type { Point, ShapeImage, Size, VideoElement } from "@/lib/editor/types";
import type { YouTubeVideo } from "@/lib/media/youtube-url";
import type { YouTubeInfo } from "@/lib/project/project-types";
import { ITEM_NAME_MAX_CHARS, VIDEO_SRC_PREFIX, type VideoItem } from "./types";

/** Where a new item goes and what it is called when it is created. */
export interface NewItemPlace {
  readonly id: string;
  /** null = 未分類. */
  readonly folderId: string | null;
  /** RFC 3339. */
  readonly importedAt: string;
}

/** The library's name for a video: its title, or 「YouTube 影片 <id>」 when it has none. Cut to `ITEM_NAME_MAX_CHARS`. */
export function videoItemName(title: string | null | undefined, videoId: string): string {
  const name = (title ?? "").replace(/[\r\n]+/g, " ").trim();
  return Array.from(name === "" ? `YouTube 影片 ${videoId}` : name).slice(0, ITEM_NAME_MAX_CHARS).join("");
}

/**
 * A video item from a pasted link and what `youTubeInfo` returned.
 *
 * Args:
 *   video: The parsed link.
 *   info: Poster and title, or null (browser dev mode / failed).
 *   place: New id, folder and time.
 *
 * Returns:
 *   The item to `item/add`.
 */
export function videoItemFromInfo(video: YouTubeVideo, info: YouTubeInfo | null, place: NewItemPlace): VideoItem {
  return {
    kind: "video",
    id: place.id,
    name: videoItemName(info?.title, video.videoId),
    src: `${VIDEO_SRC_PREFIX}${video.videoId}`,
    bytes: 0,
    folderId: place.folderId,
    importedAt: place.importedAt,
    trashed: null,
    videoId: video.videoId,
    start: video.start,
    poster: info?.poster ?? null,
  };
}

/** A video item from a video on a page: same video, start, title and poster image. */
export function videoItemFromElement(media: VideoElement, place: NewItemPlace): VideoItem {
  const { poster } = media;
  return {
    ...videoItemFromInfo(media.source, null, place),
    name: videoItemName(media.title, media.source.videoId),
    poster: poster && { src: poster.src, width: poster.imageWidth, height: poster.imageHeight },
  };
}

/** The poster a video item gives a new element: filling the box, centered. */
function posterOfItem(item: VideoItem): ShapeImage | null {
  return item.poster && shapeImageOf(item.poster.src, item.poster);
}

/** A video element for a library item, centered on `center` (title = the item's name). */
export function mediaFromVideoItem(item: VideoItem, page: Size, center: Point): VideoElement {
  return createMediaElement({ kind: "youtube", videoId: item.videoId, start: item.start }, page, center, {
    poster: posterOfItem(item),
    title: item.name,
  });
}
