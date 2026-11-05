import { createLimiter } from "@/lib/concurrency";

/** Reads how long the audio at a URL plays, in seconds; null when it cannot be read. */
export type DurationLoader = (url: string) => Promise<number | null>;

/** Gives up on a file whose header does not arrive within this time (ms). */
const LOAD_TIMEOUT_MS = 15_000;

/**
 * Reads the duration with an `<audio preload="metadata">` that is never attached or played: the
 * browser fetches only the start of the file. Needs `media-src` in the App's CSP.
 *
 * Args:
 *   url: Asset URL (desktop) or blob URL (browser mode).
 *
 * Returns:
 *   Seconds, or null on errors, timeouts and streams without a length (`Infinity`).
 */
export const loadAudioDuration: DurationLoader = (url) =>
  new Promise((resolve) => {
    const audio = new Audio();
    const finish = (seconds: number | null) => {
      clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      // 放掉連線與解碼器
      audio.removeAttribute("src");
      audio.load();
      resolve(seconds);
    };
    const timer = setTimeout(() => finish(null), LOAD_TIMEOUT_MS);
    audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null);
    audio.onerror = () => finish(null);
    audio.preload = "metadata";
    audio.src = url;
  });

/**
 * Remembers durations by key, reading at most `max` files at once.
 *
 * Args:
 *   load: How to read one file.
 *   max: Files read at the same time.
 *
 * Returns:
 *   `request(key, url)`: the same promise for the same key. The key is the project path
 *   (`assets/audio/<hash>.mp3`), which names the content, so it never needs to be forgotten.
 */
export function createDurationCache(load: DurationLoader, max: number): (key: string, url: string) => Promise<number | null> {
  const cache = new Map<string, Promise<number | null>>();
  const slot = createLimiter(max);
  return (key, url) => {
    const known = cache.get(key);
    if (known) return known;
    const request = slot(() => load(url));
    cache.set(key, request);
    return request;
  };
}

/** Durations shown on library cards and in the info pane; at most two files at once (like thumbnails). */
export const requestAudioDuration = createDurationCache(loadAudioDuration, 2);
