import { useEffect, useState } from "react";
import { Clapperboard, ImageOff, Music, Play } from "lucide-react";
import { fileExtension } from "@/lib/library/library-files";
import { formatVideoTime } from "@/lib/media/media-insert";
import { useAudioDuration } from "./use-audio-duration";
import { requestThumbnail, usesThumbnail } from "@/lib/library/thumbnails";
import type { LibraryItem } from "@/lib/library/types";
import { cn } from "@/lib/utils";

/** Height ÷ width of a card's thumbnail (images keep their own shape). */
export function cardAspect(item: LibraryItem): number {
  switch (item.kind) {
    case "image":
      return item.height / item.width;
    case "text":
      return 0.9;
    case "audio":
      return 0.55;
    case "video":
      return 9 / 16;
  }
}

/** Format badge for files that are not raster images, e.g. `MD`, `MP3`, `SVG` (vector images). */
export function kindBadge(item: LibraryItem): string | null {
  // 桌面版的 src 是 assets/texts/<hash>.md；瀏覽器模式是沒有副檔名的 blob URL，改看名稱
  if (item.kind === "video") return null;
  const extension = fileExtension(item.src.startsWith("assets/") ? item.src : item.name);
  if (item.kind === "image") return extension === "svg" ? "SVG" : null;
  return extension ? extension.toUpperCase() : null;
}

interface LibraryThumbProps {
  readonly item: LibraryItem;
  readonly resolveSrc: (src: string) => string;
  readonly className?: string;
  /** `cover` fills the box (cards); `contain` shows the whole image (the info preview). */
  readonly fit?: "cover" | "contain";
}

/** Starts loading this far before a card scrolls into view (px). */
const THUMB_PRELOAD_MARGIN = "300px";

/**
 * Whether a card has come near the screen (stays true afterwards). Cards wait for this before
 * asking for a thumbnail or an audio duration, so a large library does not start them all at once.
 */
function useNearScreen(element: HTMLElement | null, enabled: boolean): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (!enabled || !element || near) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setNear(true);
      },
      { rootMargin: THUMB_PRELOAD_MARGIN },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, element, near]);
  return near;
}

/** Which file a card shows: the thumbnail once it is known (null = the original), or undefined while waiting. */
function useCardImage(item: LibraryItem, near: boolean): string | null | undefined {
  const wanted = usesThumbnail(item);
  const [resolved, setResolved] = useState<{ readonly src: string; readonly thumb: string | null } | null>(null);
  useEffect(() => {
    if (!wanted || !near) return;
    let cancelled = false;
    void requestThumbnail(item.src).then((thumb) => {
      if (!cancelled) setResolved({ src: item.src, thumb });
    });
    return () => {
      cancelled = true;
    };
  }, [wanted, near, item.src]);
  if (!wanted) return null;
  return resolved?.src === item.src ? resolved.thumb : undefined;
}

/**
 * The picture part of a library card: the image (its thumbnail in the desktop app), the start of
 * a text file, an audio tile, or a video's poster with a play mark. A missing image file shows
 * 「檔案遺失」 instead of a broken image.
 *
 * Args:
 *   props: Item, the asset URL resolver and extra classes (the size comes from the parent).
 *
 * Returns:
 *   Thumbnail filling its box.
 */
export function LibraryThumb({ item, resolveSrc, className, fit = "cover" }: LibraryThumbProps) {
  const [missing, setMissing] = useState(false);
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const near = useNearScreen(element, usesThumbnail(item) || item.kind === "audio");
  const shown = useCardImage(item, near);
  const duration = useAudioDuration(item.kind === "audio" ? item.src : null, resolveSrc, near);
  // 縮圖讀不到（例如被刪掉）先退回原圖，原圖也讀不到才是「檔案遺失」
  const [thumbFailed, setThumbFailed] = useState(false);
  const badge = kindBadge(item);
  return (
    <div ref={setElement} className={cn("relative overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/5 ring-inset", className)}>
      {item.kind === "image" &&
        // 等縮圖時只顯示底色，不先載入原圖（就是要避免解碼整張照片）
        shown !== undefined &&
        (missing ? (
          <div className="flex size-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
            <ImageOff className="size-5" />
            檔案遺失
          </div>
        ) : (
          <img
            src={resolveSrc(shown && !thumbFailed ? shown : item.src)}
            alt={item.name}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => (shown && !thumbFailed ? setThumbFailed(true) : setMissing(true))}
            className={cn("size-full", fit === "cover" ? "object-cover" : "object-contain")}
          />
        ))}
      {item.kind === "text" && (
        <p className="size-full overflow-hidden bg-amber-50/60 px-3 pt-7 pb-2 text-[11px] leading-relaxed whitespace-pre-wrap text-foreground/80 [mask-image:linear-gradient(#000_70%,transparent)]">
          {item.excerpt}
        </p>
      )}
      {item.kind === "audio" && (
        <div className="flex size-full flex-col justify-end gap-1 bg-linear-to-br from-indigo-900 to-violet-700 p-3 pt-7 text-white">
          <Music className="size-5 opacity-80" />
          <span className="flex items-baseline gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
            {/* 讀不到（檔案遺失、格式 WebView 不支援）時不顯示，不擋檔名 */}
            {typeof duration === "number" && <span className="shrink-0 tabular-nums opacity-80">{formatVideoTime(duration)}</span>}
          </span>
        </div>
      )}
      {item.kind === "video" && (
        // 影片：封面（YouTube 縮圖是 4:3 帶黑邊，cover 剛好裁掉）+ 播放圖示；沒有封面是深色底
        <div className="relative flex size-full items-center justify-center bg-neutral-800">
          {item.poster && <img src={resolveSrc(item.poster.src)} alt={item.name} loading="lazy" draggable={false} className="absolute inset-0 size-full object-cover" />}
          {item.poster ? (
            <span className="relative flex size-8 items-center justify-center rounded-full bg-black/60 text-white">
              <Play className="size-4 translate-x-px fill-current" />
            </span>
          ) : (
            <Clapperboard className="size-6 text-neutral-300" />
          )}
        </div>
      )}
      {badge && (
        <span className="absolute top-1.5 left-1.5 rounded bg-black/60 px-1.5 py-px text-[10px] font-semibold tracking-wide text-white">
          {badge}
        </span>
      )}
    </div>
  );
}
