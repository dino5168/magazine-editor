import { useEffect, useState } from "react";
import { ImageOff, Music } from "lucide-react";
import { fileExtension } from "@/lib/library/library-files";
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
  }
}

/** Format badge for files that are not images, e.g. `MD`, `MP3`. */
export function kindBadge(item: LibraryItem): string | null {
  if (item.kind === "image") return null;
  // 桌面版的 src 是 assets/texts/<hash>.md；瀏覽器模式是沒有副檔名的 blob URL，改看名稱
  const extension = fileExtension(item.src.startsWith("assets/") ? item.src : item.name);
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
 * Which file a card shows: the thumbnail once it is known (null = the original), or undefined
 * while waiting. Asks only when the card is near the screen, so a large library does not make
 * every thumbnail at once.
 */
function useCardImage(item: LibraryItem, element: HTMLElement | null): string | null | undefined {
  const wanted = usesThumbnail(item);
  const [resolved, setResolved] = useState<{ readonly src: string; readonly thumb: string | null } | null>(null);
  useEffect(() => {
    if (!wanted || !element) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void requestThumbnail(item.src).then((thumb) => {
          if (!cancelled) setResolved({ src: item.src, thumb });
        });
      },
      { rootMargin: THUMB_PRELOAD_MARGIN },
    );
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [wanted, element, item.src]);
  if (!wanted) return null;
  return resolved?.src === item.src ? resolved.thumb : undefined;
}

/**
 * The picture part of a library card: the image (its thumbnail in the desktop app), the start of
 * a text file, or an audio tile. A missing image file shows 「檔案遺失」 instead of a broken image.
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
  const shown = useCardImage(item, element);
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
          <span className="truncate text-xs font-medium">{item.name}</span>
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
