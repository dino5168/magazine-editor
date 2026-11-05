import type { AudioElement, MediaElement, VideoElement } from "@/lib/editor/types";

/** True when a media element plays a YouTube video. */
export function isVideoElement(media: MediaElement): media is VideoElement {
  return media.source.kind === "youtube";
}

/** True when a media element plays an audio file (v19). */
export function isAudioElement(media: MediaElement): media is AudioElement {
  return media.source.kind === "file";
}

/** What the panels and MCP call a media element: 「影片」 or 「音訊」. */
export function mediaKindName(media: MediaElement): string {
  return isAudioElement(media) ? "音訊" : "影片";
}
