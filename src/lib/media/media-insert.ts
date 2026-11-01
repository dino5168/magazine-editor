/**
 * Pure helpers for adding a video link (multimedia plan step 4): the poster from what Rust fetched,
 * what to tell the user about it, and the link in pasted / dropped data.
 */
import { shapeImageOf } from "@/lib/editor/shape-image";
import type { ShapeImage } from "@/lib/editor/types";
import type { YouTubeInfo } from "@/lib/project/project-types";
import { parseDuration, parseYouTubeUrl, YOUTUBE_START_MAX_SECONDS, type YouTubeVideo } from "./youtube-url";

/** The poster to store: the fetched thumbnail filling the box (`cover` crops its letterbox bars). */
export function posterOf(info: YouTubeInfo | null): ShapeImage | null {
  return info?.poster ? shapeImageOf(info.poster.src, info.poster) : null;
}

/** What to tell the user about a fetched video; `error` means it should not be added. */
export interface VideoNotice {
  readonly level: "error" | "warning";
  readonly message: string;
}

/**
 * Explains problems with a video before / after adding it.
 *
 * Args:
 *   info: What `youTubeInfo` returned, or null when it was not asked (browser dev mode) or failed.
 *
 * Returns:
 *   The most important notice, or null when everything is fine.
 */
export function videoNotice(info: YouTubeInfo | null): VideoNotice | null {
  if (info === null) return null;
  switch (info.availability) {
    case "notFound":
      return { level: "error", message: "找不到這支影片：可能已刪除，或網址打錯了。" };
    case "notEmbeddable":
      return { level: "warning", message: "這支影片不允許嵌入其他網站：翻頁書裡只能開新分頁到 YouTube 觀看。" };
    case "unknown":
    case "ok":
      return info.poster === null
        ? { level: "warning", message: "抓不到影片封面（可能沒有網路）：之後可以在屬性面板「重新抓封面」或換成自己的圖片。" }
        : null;
  }
}

/**
 * Finds a YouTube video in pasted or dropped data: the first link of `text/uri-list` (dragging a
 * link or a browser tab), else the plain text.
 *
 * Args:
 *   getData: `DataTransfer.getData`, so the function stays testable without a DOM.
 *
 * Returns:
 *   The video, or null when the data is not one YouTube link.
 */
export function videoFromTransfer(getData: (format: string) => string): YouTubeVideo | null {
  // uri-list：一行一個網址，# 開頭是註解
  const uri = getData("text/uri-list")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== "" && !line.startsWith("#"));
  return parseYouTubeUrl(uri ?? getData("text/plain"));
}

/** Seconds as `m:ss` or `h:mm:ss` (the start time in the panel and the dialog). */
export function formatVideoTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const [h, m, s] = [Math.floor(whole / 3600), Math.floor((whole % 3600) / 60), whole % 60];
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/**
 * Reads a start time typed into the panel: `90`, `1:30`, `1:02:03` or YouTube's `1m30s`.
 *
 * Returns:
 *   Seconds within 0–`YOUTUBE_START_MAX_SECONDS`, or null when it cannot be read or is too late.
 */
export function parseVideoTime(text: string): number | null {
  const trimmed = text.trim();
  let seconds: number | null;
  if (/^\d+(:\d{1,2}){1,2}$/.test(trimmed)) {
    const parts = trimmed.split(":").map(Number);
    // 分、秒欄位必須 < 60（1:75 是打錯，不是 2:15）
    if (parts.slice(1).some((part) => part >= 60)) return null;
    seconds = parts.reduce((total, part) => total * 60 + part, 0);
  } else {
    seconds = trimmed === "" ? null : parseDuration(trimmed);
  }
  return seconds !== null && seconds <= YOUTUBE_START_MAX_SECONDS ? seconds : null;
}
