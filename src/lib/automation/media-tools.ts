/**
 * MCP tool `add_video` (multimedia plan step 9): a YouTube link → a video element, with the poster
 * and title YouTube gives (fetched through Rust, like the 插入 YouTube 影片 dialog).
 */
import { createMediaElement } from "@/lib/editor/element-factory";
import { pageCenter } from "@/lib/editor/geometry";
import { findSheet } from "@/lib/editor/master-pages";
import type { Result } from "@/lib/editor/validation";
import { posterOf, videoNotice } from "@/lib/media/media-insert";
import { parseYouTubeUrl } from "@/lib/media/youtube-url";
import type { VideoAvailability } from "@/lib/project/project-types";
import { addElement, targetSheet } from "./edits";
import type { ToolContext } from "./run-tool";
import type { ToolArgs } from "./tool-definitions";

export interface AddedVideo {
  readonly id: string;
  readonly pageId: string;
  readonly width: number;
  readonly height: number;
  readonly title: string;
  /** False when YouTube gave no thumbnail (offline): the video shows the default look. */
  readonly hasPoster: boolean;
  /** `unknown` when YouTube could not be asked (offline, or no App to ask). */
  readonly availability: VideoAvailability;
}

const fail = (message: string): Result<never> => ({ data: null, error: new Error(message) });

/**
 * Adds a YouTube video: parses the link, asks for poster and title, then one `element/add`.
 *
 * Args:
 *   context: Tool context (state, apply, and `fetchVideoInfo`; without it the video gets no poster).
 *   args: `add_video` arguments.
 *
 * Returns:
 *   The new element and what YouTube said, or an error (bad link, unknown page, video not found).
 */
export async function addVideo(context: ToolContext, args: ToolArgs<"add_video">): Promise<Result<AddedVideo>> {
  const video = parseYouTubeUrl(args.url);
  if (video === null) return fail("url 不是 YouTube 影片的網址（watch?v=、youtu.be/、shorts/、embed/ 都可以；頻道、播放清單不行）");
  // 先檢查頁面，不要白等 YouTube
  const sheetId = targetSheet(context.state, args.pageId);
  if (sheetId.error) return sheetId;
  const info = context.fetchVideoInfo ? await context.fetchVideoInfo(video.videoId) : null;
  const notice = videoNotice(info);
  if (notice?.level === "error") return fail(notice.message);
  // 等 YouTube 的期間使用者可能刪了那一頁
  const sheet = findSheet(context.state.history.present, sheetId.data);
  if (!sheet) return fail(`找不到頁面「${sheetId.data}」，請先用 list_pages 取得 id`);
  const poster = posterOf(info);
  const title = args.title?.trim() ?? info?.title ?? "";
  const placed = createMediaElement({ kind: "youtube", ...video }, sheet, pageCenter(sheet), { poster, title });
  const width = args.width ?? placed.width;
  const height = (width * placed.height) / placed.width;
  const element = { ...placed, width, height, x: args.x ?? (sheet.width - width) / 2, y: args.y ?? (sheet.height - height) / 2 };
  const added = addElement(context.apply, element, sheetId.data);
  if (added.error) return added;
  return {
    data: { ...added.data, width, height, title, hasPoster: poster !== null, availability: info?.availability ?? "unknown" },
    error: null,
  };
}
