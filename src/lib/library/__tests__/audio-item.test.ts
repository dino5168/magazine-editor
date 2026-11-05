import { describe, expect, it } from "vitest";
import { isMediaOrigin, MEDIA_TITLE_MAX_CHARS } from "@/lib/editor/validation";
import { speakerMark, SPEAKER_WAVE_WIDTH } from "@/lib/media/speaker-mark";
import { audioTitleOf, isPlaceableAudio, mediaFromAudioItem } from "../audio-item";
import type { AudioItem } from "../types";

const ITEM: AudioItem = {
  id: "a",
  kind: "audio",
  name: "訪談 第一段.mp3",
  src: "assets/audio/00112233445566778899aabbccddeeff.mp3",
  bytes: 1024,
  folderId: null,
  importedAt: "2026-11-05T00:00:00Z",
  trashed: null,
};

describe("isPlaceableAudio", () => {
  it("allows mp3 only, by path on the desktop and by name in browser mode", () => {
    expect(isPlaceableAudio(ITEM)).toBe(true);
    expect(isPlaceableAudio({ ...ITEM, src: "assets/audio/x.wav", name: "x.wav" })).toBe(false);
    expect(isPlaceableAudio({ ...ITEM, src: "assets/audio/x.m4a" })).toBe(false);
    // 瀏覽器模式：blob URL 沒有副檔名，看名稱
    expect(isPlaceableAudio({ ...ITEM, src: "blob:http://localhost/1", name: "配樂.MP3" })).toBe(true);
    expect(isPlaceableAudio({ ...ITEM, src: "blob:http://localhost/1", name: "配樂.ogg" })).toBe(false);
    expect(isPlaceableAudio({ ...ITEM, trashed: { at: "2026-11-05T00:00:00Z", fromFolderId: null, fromName: null } })).toBe(false);
  });

  it("is false for other kinds", () => {
    expect(isPlaceableAudio({ ...ITEM, kind: "text", excerpt: "" })).toBe(false);
  });
});

describe("audio elements from items", () => {
  it("titles them with the name without its extension, within the limit", () => {
    expect(audioTitleOf(ITEM)).toBe("訪談 第一段");
    expect(audioTitleOf({ ...ITEM, name: "沒有副檔名" })).toBe("沒有副檔名");
    expect(audioTitleOf({ ...ITEM, name: ".mp3" })).toBe(".mp3");
    expect(Array.from(audioTitleOf({ ...ITEM, name: `${"影".repeat(300)}.mp3` }))).toHaveLength(MEDIA_TITLE_MAX_CHARS);
  });

  it("makes a 48 pt button centered on the point, playing the item's file", () => {
    const audio = mediaFromAudioItem(ITEM, { x: 100, y: 200 });
    expect(audio).toMatchObject({ type: "media", x: 76, y: 176, width: 48, height: 48, poster: null, title: "訪談 第一段" });
    expect(audio.source).toEqual({ kind: "file", src: ITEM.src });
    expect(isMediaOrigin(audio.source)).toBe(true);
  });
});

describe("speakerMark", () => {
  it("scales the unit mark around the centre", () => {
    const { body, waves } = speakerMark(24, 24, 10);
    expect(body.slice(0, 4)).toEqual([15, 21, 19.5, 21]);
    // 喇叭本體上下對稱
    expect(body[5] + body[7]).toBeCloseTo(48, 9);
    expect(waves.map((wave) => wave.outerRadius - wave.innerRadius)).toEqual([SPEAKER_WAVE_WIDTH * 10, SPEAKER_WAVE_WIDTH * 10].map((n) => expect.closeTo(n, 9)));
    expect(waves[0]).toMatchObject({ x: 24.5, y: 24, angle: 90, rotation: -45 });
    // 整個圖示在中心 ± size 以內（外圈聲波的外緣不超出）
    const right = waves[1].x + waves[1].outerRadius;
    expect(right).toBeLessThanOrEqual(24 + 10);
  });
});
