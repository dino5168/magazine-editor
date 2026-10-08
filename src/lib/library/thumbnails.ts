import { isDesktop, projectApi } from "@/lib/project/project-api";
import type { LibraryItem } from "./types";

/**
 * Thumbnails for library cards. Rust makes them on demand (`library_thumbnail`): decoding a 24 MP
 * photo takes a while and a lot of memory, so at most `MAX_CONCURRENT` run at once, and each image
 * is asked for once per project (the cache is cleared when another project is loaded).
 */
const MAX_CONCURRENT = 2;

let cache = new Map<string, Promise<string | null>>();
let running = 0;
const waiting: (() => void)[] = [];

async function slot<T>(run: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await run();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

/**
 * Whether an item's card should wait for a thumbnail instead of showing the original.
 *
 * Args:
 *   item: Library item.
 *
 * Returns:
 *   True for raster images in the desktop app (the browser keeps blob URLs and has no Rust side).
 */
export function usesThumbnail(item: LibraryItem): boolean {
  return isDesktop && item.kind === "image" && !item.src.endsWith(".svg");
}

/**
 * The thumbnail to show for an image.
 *
 * Args:
 *   src: The image's project-relative path.
 *
 * Returns:
 *   The thumbnail's path, or null to show the original (small image, or the thumbnail could not
 *   be made).
 */
export function requestThumbnail(src: string): Promise<string | null> {
  const known = cache.get(src);
  if (known) return known;
  const request = slot(async () => {
    const result = await projectApi.libraryThumbnail(src);
    return result.error ? null : result.data;
  });
  cache.set(src, request);
  return request;
}

/** Forgets every thumbnail (another project was loaded: paths belong to the old folder). */
export function resetThumbnailCache(): void {
  cache = new Map();
}
