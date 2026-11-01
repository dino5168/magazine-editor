import { useEffect, useId, useRef, useState } from "react";
import { Clapperboard, LoaderCircle } from "lucide-react";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAddVideo } from "@/components/editor/use-add-video";
import { fetchVideoInfo } from "@/lib/media/video-info";
import { formatVideoTime, videoNotice } from "@/lib/media/media-insert";
import { parseYouTubeUrl, type YouTubeVideo } from "@/lib/media/youtube-url";
import { isDesktop } from "@/lib/project/project-api";
import { useProject } from "@/lib/project/project-context";
import type { YouTubeInfo } from "@/lib/project/project-types";
import { cn } from "@/lib/utils";
import { SettingsDialog, SettingsDialogFooter } from "./settings/settings-dialog";

/** Wait after the last keystroke before asking YouTube (pasting is one change, typing is many). */
const FETCH_DELAY_MS = 400;

type Fetched = { readonly videoId: string; readonly info: YouTubeInfo | null };

/** What the dialog does with the video, and how it says so. */
export interface VideoDestination {
  readonly title: string;
  readonly description: string;
  readonly applyLabel: string;
  readonly onAdd: (video: YouTubeVideo, info: YouTubeInfo | null) => void;
}

interface InsertVideoDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Default: the center of the current page (operation A). The library passes its own (operation B). */
  readonly destination?: VideoDestination;
}

/**
 * 「插入 YouTube 影片」: paste a link, see the poster and title, then add the video — to the center
 * of the current page (multimedia plan step 4, operation A) or wherever `destination` says (the
 * library's 「新增影片連結」, step 8).
 *
 * Args:
 *   props: Controlled visibility and the optional destination.
 *
 * Returns:
 *   The dialog.
 */
export function InsertVideoDialog({ open, onOpenChange, destination }: InsertVideoDialogProps) {
  return (
    <SettingsDialog open={open} onOpenChange={onOpenChange}>
      {/* 關閉時卸載：每次開啟都是空白的 */}
      {open && <InsertVideoForm destination={destination} onDone={() => onOpenChange(false)} />}
    </SettingsDialog>
  );
}

function InsertVideoForm({ destination, onDone }: { readonly destination?: VideoDestination; readonly onDone: () => void }) {
  const { add: addToPage } = useAddVideo();
  const add = destination?.onAdd ?? addToPage;
  const { resolveSrc } = useProject();
  const inputId = useId();
  const [text, setText] = useState("");
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const video = parseYouTubeUrl(text);
  const videoId = video?.videoId ?? null;
  // 只採用目前網址的結果：連續貼不同網址時，晚回來的舊結果不蓋掉新的
  const latest = useRef<string | null>(null);

  useEffect(() => {
    latest.current = videoId;
    if (videoId === null || fetched?.videoId === videoId) return;
    const timer = window.setTimeout(() => {
      void fetchVideoInfo(videoId).then((info) => {
        if (latest.current === videoId) setFetched({ videoId, info });
      });
    }, FETCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [videoId, fetched?.videoId]);

  const current = fetched !== null && fetched.videoId === videoId ? fetched : null;
  const loading = video !== null && current === null;
  const notice = current ? videoNotice(current.info) : null;
  const canAdd = video !== null && !loading && notice?.level !== "error";

  const apply = (): void => {
    if (!canAdd || !current) return;
    add(video, current.info);
    onDone();
  };

  const poster = current?.info?.poster ?? null;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{destination?.title ?? "插入 YouTube 影片"}</DialogTitle>
        <DialogDescription>{destination?.description ?? "貼上影片網址。影片會放在目前頁面的中央；翻頁書與 PDF 裡點了可以觀看。"}</DialogDescription>
      </DialogHeader>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          YouTube 網址
        </label>
        <Input
          id={inputId}
          autoFocus
          value={text}
          placeholder="https://www.youtube.com/watch?v=…"
          onChange={(event) => setText(event.target.value)}
          aria-invalid={text.trim() !== "" && video === null}
        />
        {text.trim() !== "" && video === null && <p className="text-xs text-destructive">不是 YouTube 影片的網址（頻道、播放清單不行）。</p>}
        <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-md bg-neutral-800 text-neutral-300">
          {loading ? (
            <LoaderCircle className="size-6 animate-spin" aria-label="正在取得影片資訊" />
          ) : poster ? (
            <img src={resolveSrc(poster.src)} alt="" className="size-full object-cover" />
          ) : (
            <Clapperboard className="size-8 opacity-60" aria-hidden />
          )}
        </div>
        {current && (
          <div className="flex flex-col gap-1 text-sm">
            <span className={cn("truncate", !current.info?.title && "text-muted-foreground")}>
              {current.info?.title ?? (isDesktop ? "（沒有取得標題）" : "瀏覽器模式不會抓封面與標題")}
            </span>
            {video && video.start > 0 && <span className="text-xs text-muted-foreground">從 {formatVideoTime(video.start)} 開始播放</span>}
            {notice && <p className={cn("text-xs", notice.level === "error" ? "text-destructive" : "text-amber-600")}>{notice.message}</p>}
          </div>
        )}
        <button type="submit" hidden />
      </form>
      <SettingsDialogFooter onApply={apply} applyDisabled={!canAdd} applyLabel={destination?.applyLabel ?? "加入"} />
    </>
  );
}
