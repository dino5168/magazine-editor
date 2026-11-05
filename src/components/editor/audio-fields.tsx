import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAudioDuration } from "@/components/library/use-audio-duration";
import type { AudioElement, ElementPatch } from "@/lib/editor/types";
import { MEDIA_TITLE_MAX_CHARS } from "@/lib/editor/validation";
import { audioTitleOf, isPlaceableAudio } from "@/lib/library/audio-item";
import { useLibrary } from "@/lib/library/library-context";
import type { AudioItem } from "@/lib/library/types";
import { formatVideoTime } from "@/lib/media/media-insert";
import { useProject } from "@/lib/project/project-context";
import { PhotoFields } from "./shape-photo-fields";
import { CommitField, Section } from "./video-fields";

type Update = (patch: ElementPatch) => void;

/**
 * The 音訊 tab (v19): preview, length, title, which file plays (another mp3 from the library) and
 * the poster (same fields as an image frame's photo).
 *
 * Args:
 *   props.media: The selected audio element.
 *   props.update: The panel's update function.
 *
 * Returns:
 *   The tab's sections.
 */
export function AudioTab({ media, update }: { readonly media: AudioElement; readonly update: Update }) {
  const { src } = media.source;
  const { resolveSrc } = useProject();
  const library = useLibrary();
  const duration = useAudioDuration(src, resolveSrc);
  const current = library.items.find((item): item is AudioItem => item.kind === "audio" && item.src === src);
  const choices = library.items.filter((item): item is AudioItem => item.kind === "audio" && isPlaceableAudio(item));

  // 換檔案：標題還是舊素材的預設名稱（或空的）時跟著換，自己改過的保留（一筆復原）
  const changeFile = (id: string): void => {
    const next = choices.find((item) => item.id === id);
    if (!next || next.src === src) return;
    const titleIsDefault = media.title === "" || (current !== undefined && media.title === audioTitleOf(current));
    update({ source: { kind: "file", src: next.src }, ...(titleIsDefault && { title: audioTitleOf(next) }) });
  };

  return (
    <>
      <Section title="音訊">
        {/* key：換檔案時重新載入並停止上一個；按鍵不往外傳（空白鍵、方向鍵不能動到畫布上的物件），Esc 除外 */}
        <audio
          key={src}
          controls
          preload="metadata"
          src={resolveSrc(src)}
          aria-label="試聽"
          data-audio-preview
          onKeyDown={(event) => {
            if (event.key !== "Escape") event.stopPropagation();
          }}
          className="h-9 w-full"
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>長度</span>
          <span className="tabular-nums">{duration === undefined ? "讀取中…" : duration === null ? "無法讀取" : formatVideoTime(duration)}</span>
        </div>
        <CommitField
          key={`title:${media.title}`}
          label="標題"
          value={media.title}
          placeholder="音訊"
          onCommit={(text) => update({ title: Array.from(text.trim()).slice(0, MEDIA_TITLE_MAX_CHARS).join("") })}
        />
        <label className="flex items-center gap-2 text-sm">
          <span className="w-14 shrink-0">檔案</span>
          <Select value={current && choices.includes(current) ? current.id : ""} onValueChange={changeFile}>
            <SelectTrigger size="sm" className="h-7 min-w-0 flex-1 text-xs" aria-label="換成別的音訊">
              <SelectValue placeholder={current ? current.name : "素材庫裡沒有這個檔案"} />
            </SelectTrigger>
            <SelectContent>
              {choices.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <p className="text-xs text-muted-foreground">畫布上不能播放；匯出的翻頁書裡點了可以播放，翻頁時停止。可以換的是素材庫裡的 mp3。</p>
      </Section>
      <Section title="封面">
        <PhotoFields image={media.poster} onChange={(poster) => update({ poster })} label="封面" />
      </Section>
    </>
  );
}
