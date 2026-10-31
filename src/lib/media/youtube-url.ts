/**
 * Recognises YouTube video links (pasted, dropped or typed into the 插入影片連結 dialog).
 *
 * The document stores the parsed `{ videoId, start }`, never the original link: links come in many
 * forms (`watch?v=`, `youtu.be/`, `shorts/`, `&t=1m30s`…), and exports build the canonical URL from
 * the id. Rust validates the stored values again with the same rules (`YOUTUBE_ID_PATTERN`,
 * `YOUTUBE_START_MAX_SECONDS`).
 */

/** A YouTube video id: 11 characters of `[A-Za-z0-9_-]`. Same rule as Rust. */
export const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** Latest start time kept (seconds, 24 hours); later ones are clamped. Same as Rust. */
export const YOUTUBE_START_MAX_SECONDS = 86_400;

export interface YouTubeVideo {
  readonly videoId: string;
  /** Seconds from the start of the video; 0 = from the beginning. */
  readonly start: number;
}

/** Hosts serving `/watch`, `/shorts/<id>`, `/embed/<id>`… */
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

/** Short-link host: `youtu.be/<id>`. */
const SHORT_HOST = "youtu.be";

/** Path prefixes followed by the video id. */
const ID_PATH_PREFIXES = ["shorts", "embed", "live", "v"];

/** Links longer than this are not URLs someone pasted on purpose. */
const LINK_MAX_CHARS = 2048;

export function isYouTubeVideoId(id: string): boolean {
  return YOUTUBE_ID_PATTERN.test(id);
}

/**
 * Parses a YouTube video link.
 *
 * # Args
 * * `text` - What the user pasted or typed; surrounding spaces are ignored and the scheme may be left
 *   out (`youtu.be/…`).
 *
 * # Returns
 * The video and start time, or `null` when `text` is not a link to one YouTube video (other sites,
 * channels, playlists without a video, malformed ids). A start time that cannot be read counts as 0:
 * the link still names the video.
 */
export function parseYouTubeUrl(text: string): YouTubeVideo | null {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed.length > LINK_MAX_CHARS || /\s/.test(trimmed)) {
    return null;
  }
  const url = toUrl(trimmed);
  if (url === null || (url.protocol !== "https:" && url.protocol !== "http:")) {
    return null;
  }
  const videoId = videoIdOf(url);
  if (videoId === null || !isYouTubeVideoId(videoId)) {
    return null;
  }
  return { videoId, start: startOf(url) };
}

/**
 * The canonical watch URL (what the exported PDF and flip book link to).
 *
 * # Args
 * * `videoId` - A valid id (`isYouTubeVideoId`).
 * * `start` - Seconds; 0 leaves the start parameter out.
 */
export function youTubeWatchUrl(videoId: string, start: number): string {
  const base = `https://www.youtube.com/watch?v=${videoId}`;
  return start > 0 ? `${base}&t=${Math.floor(start)}s` : base;
}

function toUrl(text: string): URL | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

function videoIdOf(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter((segment) => segment !== "");
  if (host === SHORT_HOST) {
    return segments.length === 1 ? segments[0] : null;
  }
  if (!YOUTUBE_HOSTS.has(host)) {
    return null;
  }
  if (segments.length === 1 && segments[0] === "watch") {
    return url.searchParams.get("v");
  }
  if (segments.length === 2 && ID_PATH_PREFIXES.includes(segments[0])) {
    return segments[1];
  }
  return null;
}

/** `t` / `start` in the query, or `#t=` (older share links). */
function startOf(url: URL): number {
  const fragment = new URLSearchParams(url.hash.slice(1));
  const value = url.searchParams.get("t") ?? url.searchParams.get("start") ?? fragment.get("t");
  if (value === null) {
    return 0;
  }
  const seconds = parseDuration(value);
  return seconds === null ? 0 : Math.min(seconds, YOUTUBE_START_MAX_SECONDS);
}

/** `90`, `90s`, `1m30s`, `1h2m3s` → seconds; anything else → `null`. */
export function parseDuration(value: string): number | null {
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(value);
  if (match === null || value === "") {
    return null;
  }
  const [, hours = "0", minutes = "0", seconds = "0"] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}
