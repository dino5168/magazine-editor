import { createAudioElement } from "@/lib/editor/element-factory";
import type { AudioElement, Point } from "@/lib/editor/types";
import { MEDIA_AUDIO_EXTENSIONS, MEDIA_TITLE_MAX_CHARS } from "@/lib/editor/validation";
import { fileExtension } from "./library-files";
import type { AudioItem, LibraryItem } from "./types";

/** Shown when an audio item in another format is placed (`docs/16-Plans-Audio/02-Audio-素材-實作.md` §0). */
export const AUDIO_FORMAT_NOTICE = "目前只有 mp3 能放到頁面";

/**
 * Format of an audio item: from its project path on the desktop, from its name in browser mode
 * (the `src` is a blob URL without an extension).
 */
function audioExtension(item: AudioItem): string {
  return fileExtension(item.src.startsWith("assets/") ? item.src : item.name);
}

/**
 * Whether a library item can go on a page as audio: an mp3 (`MEDIA_AUDIO_EXTENSIONS`) not in the
 * trash. Other formats can still be imported, sorted and previewed.
 *
 * Args:
 *   item: Library item.
 *
 * Returns:
 *   True for placeable audio; false for everything else (including non-audio items).
 */
export function isPlaceableAudio(item: LibraryItem): boolean {
  return item.kind === "audio" && item.trashed === null && MEDIA_AUDIO_EXTENSIONS.includes(audioExtension(item));
}

/** Title of an audio element made from an item: its name without the extension, within the limit. */
export function audioTitleOf(item: AudioItem): string {
  const dot = item.name.lastIndexOf(".");
  const base = dot > 0 ? item.name.slice(0, dot) : item.name;
  return Array.from(base.trim()).slice(0, MEDIA_TITLE_MAX_CHARS).join("");
}

/**
 * An audio element for a library item, centered on `center` (round 48 pt button, no poster).
 *
 * Args:
 *   item: A placeable audio item (`isPlaceableAudio`).
 *   center: Center position in pt.
 *
 * Returns:
 *   New element.
 */
export function mediaFromAudioItem(item: AudioItem, center: Point): AudioElement {
  return createAudioElement(item.src, center, { title: audioTitleOf(item) });
}
