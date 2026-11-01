import { isDesktop, projectApi } from "@/lib/project/project-api";
import type { YouTubeInfo } from "@/lib/project/project-types";

/**
 * Asks Rust for a video's poster (stored in the project) and title. Browser dev mode has no Rust:
 * null (the video gets the default look). A failed call is also null; network problems already
 * come back as empty fields, so this only happens for an invalid id or a missing project.
 */
export async function fetchVideoInfo(videoId: string): Promise<YouTubeInfo | null> {
  if (!isDesktop) return null;
  const result = await projectApi.youTubeInfo(videoId);
  return result.data;
}
