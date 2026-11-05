import { useState, type ReactNode } from "react";
import { ExternalLink, FolderPlus, RefreshCw } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createId } from "@/lib/editor/element-factory";
import type { ElementPatch, VideoElement } from "@/lib/editor/types";
import { useLibrary, useLibraryDispatch } from "@/lib/library/library-context";
import { videoItemFromElement } from "@/lib/library/video-item";
import { MEDIA_TITLE_MAX_CHARS } from "@/lib/editor/validation";
import { formatVideoTime, parseVideoTime, posterOf, videoNotice } from "@/lib/media/media-insert";
import { parseYouTubeUrl, youTubeWatchUrl } from "@/lib/media/youtube-url";
import { isDesktop } from "@/lib/project/project-api";
import { PhotoFields } from "./shape-photo-fields";
import { fetchVideoInfo } from "@/lib/media/video-info";

type Update = (patch: ElementPatch) => void;

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b px-3 py-3 last:border-b-0">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/**
 * A text field written on Enter or blur (one undo step), like `NumberField`. The parent gives it a
 * `key` from the stored value, so undo / redo resets the draft.
 */
function CommitField({
  label,
  value,
  onCommit,
  placeholder,
}: {
  readonly label: string;
  readonly value: string;
  readonly onCommit: (text: string) => void;
  readonly placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="w-14 shrink-0">{label}</span>
      <Input
        className="h-7 text-xs"
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => draft !== value && onCommit(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(value);
            // 先還原再離開，blur 時不會寫入
            requestAnimationFrame(() => (event.target as HTMLInputElement).blur());
          }
        }}
      />
    </label>
  );
}

/** Opens a link in the system browser (desktop) or a new tab (browser dev mode). */
function openLink(url: string): void {
  if (isDesktop) void openUrl(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * The 影片 tab: which video (link, start time), its title, opening it, and the poster (same fields
 * as an image frame's photo). Changing the link to another video fetches its poster and title, all
 * in one undo step.
 *
 * Args:
 *   props.media: The selected video.
 *   props.update: The panel's update function.
 *
 * Returns:
 *   The tab's sections.
 */
export function VideoTab({ media, update }: { readonly media: VideoElement; readonly update: Update }) {
  const { videoId, start } = media.source;
  const url = youTubeWatchUrl(videoId, start);
  const [busy, setBusy] = useState(false);
  const library = useLibrary();
  const libraryDispatch = useLibraryDispatch();
  const inLibrary = library.items.find((item) => item.kind === "video" && item.videoId === videoId && !item.trashed);

  // 加到素材庫的「未分類」（操作方式 B 的另一個入口）；同一支影片只留一筆
  const addToLibrary = (): void => {
    const item = videoItemFromElement(media, { id: createId(), folderId: null, importedAt: new Date().toISOString() });
    libraryDispatch({ type: "item/add", item });
    toast.success(`已加入素材庫的「未分類」：「${item.name}」`);
  };

  const changeLink = async (text: string): Promise<void> => {
    const video = parseYouTubeUrl(text);
    if (video === null) {
      toast.error("不是 YouTube 影片的網址");
      return;
    }
    if (video.videoId === videoId) {
      update({ source: { kind: "youtube", ...video } });
      return;
    }
    // 換成另一支影片：舊的封面與標題不再適用，一起換（一筆復原）
    setBusy(true);
    const info = await fetchVideoInfo(video.videoId);
    setBusy(false);
    const notice = videoNotice(info);
    if (notice?.level === "error") {
      toast.error(notice.message);
      return;
    }
    update({ source: { kind: "youtube", ...video }, poster: posterOf(info), title: info?.title ?? "" });
    if (notice) toast.warning(notice.message);
  };

  const changeStart = (text: string): void => {
    const seconds = parseVideoTime(text);
    if (seconds === null) {
      toast.error("開始時間的格式是 1:30、90 或 1:02:03（最多 24 小時）");
      return;
    }
    update({ source: { ...media.source, start: seconds } });
  };

  const refetchPoster = async (): Promise<void> => {
    setBusy(true);
    const info = await fetchVideoInfo(videoId);
    setBusy(false);
    const poster = posterOf(info);
    if (poster === null) {
      toast.error(videoNotice(info)?.message ?? "抓不到影片封面");
      return;
    }
    update({ poster, ...(media.title === "" && info?.title && { title: info.title }) });
  };

  return (
    <>
      <Section title="影片">
        <CommitField key={`url:${url}`} label="網址" value={url} onCommit={(text) => void changeLink(text)} />
        <CommitField key={`start:${start}`} label="開始" value={formatVideoTime(start)} onCommit={changeStart} />
        <CommitField
          key={`title:${media.title}`}
          label="標題"
          value={media.title}
          placeholder="YouTube 影片"
          onCommit={(text) => update({ title: Array.from(text.trim()).slice(0, MEDIA_TITLE_MAX_CHARS).join("") })}
        />
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={() => openLink(url)}>
            <ExternalLink />
            {isDesktop ? "在瀏覽器開啟" : "在新分頁開啟"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={inLibrary !== undefined}
            title={inLibrary ? `素材庫已經有這支影片：「${inLibrary.name}」` : undefined}
            onClick={addToLibrary}
          >
            <FolderPlus />
            {inLibrary ? "已在素材庫" : "加入素材庫"}
          </Button>
          {isDesktop && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void refetchPoster()}>
              <RefreshCw className={busy ? "animate-spin" : undefined} />
              重新抓封面
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">畫布上不能播放；匯出的翻頁書與 PDF 點了可以觀看。</p>
      </Section>
      <Section title="封面">
        <PhotoFields image={media.poster} onChange={(poster) => update({ poster })} label="封面" fallbackName="YouTube 縮圖" />
      </Section>
    </>
  );
}
