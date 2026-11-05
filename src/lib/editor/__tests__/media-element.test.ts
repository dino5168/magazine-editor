import { describe, expect, it } from "vitest";
import { YOUTUBE_START_MAX_SECONDS } from "../../media/youtube-url";
import { selectActivePage } from "../editor-reducer";
import { createMediaElement, describeElement } from "../element-factory";
import { getElementBounds } from "../geometry";
import { shapeImageOf } from "../shape-image";
import type { MediaElement, MediaOrigin } from "../types";
import { isMediaOrigin, isMediaTitle, MEDIA_TITLE_MAX_CHARS } from "../validation";
import { blankState, run } from "./editor-reducer-setup";

const VIDEO: MediaOrigin = { kind: "youtube", videoId: "C5fjrag2Fcg", start: 0 };
const A4 = { width: 595, height: 842 };
const POSTER = shapeImageOf("assets/images/poster.jpg", { width: 480, height: 360 });

describe("media values", () => {
  it("accepts YouTube ids and whole-second starts within range (same as Rust)", () => {
    expect(isMediaOrigin(VIDEO)).toBe(true);
    expect(isMediaOrigin({ ...VIDEO, start: YOUTUBE_START_MAX_SECONDS })).toBe(true);
    for (const bad of [
      null,
      "C5fjrag2Fcg",
      { ...VIDEO, kind: "vimeo" },
      { ...VIDEO, videoId: "short" },
      { ...VIDEO, videoId: "C5fjrag2Fc!" },
      { ...VIDEO, start: -1 },
      { ...VIDEO, start: 1.5 },
      { ...VIDEO, start: YOUTUBE_START_MAX_SECONDS + 1 },
      { ...VIDEO, start: Number.NaN },
      { kind: "youtube", videoId: "C5fjrag2Fcg" },
    ]) {
      expect(isMediaOrigin(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("accepts mp3 files under assets/audio and browser-mode blob URLs (v19, same paths as Rust)", () => {
    const audio = (src: unknown) => ({ kind: "file", src });
    expect(isMediaOrigin(audio("assets/audio/0123abcd.mp3"))).toBe(true);
    // 瀏覽器模式的素材是 blob URL，Rust 不會看到
    expect(isMediaOrigin(audio("blob:http://localhost:1420/1f2e"))).toBe(true);
    for (const src of [
      "assets/audio/a.wav",
      "assets/audio/a.ogg",
      "assets/audio/a.m4a",
      "assets/audio/a.MP3",
      "assets/audio/mp3",
      "assets/audio/.mp3",
      "assets/audio/sub/a.mp3",
      "assets/audio/../a.mp3",
      "assets/images/a.mp3",
      "",
      42,
    ]) {
      expect(isMediaOrigin(audio(src)), String(src)).toBe(false);
    }
    expect(isMediaOrigin({ kind: "url", src: "https://example.com/a.mp3" })).toBe(false);
  });

  it("counts title length in characters, like Rust chars()", () => {
    expect(isMediaTitle("")).toBe(true);
    expect(isMediaTitle("影".repeat(MEDIA_TITLE_MAX_CHARS))).toBe(true);
    // 😀 在 JS 是兩個 UTF-16 單位，Rust 算一個字元
    expect(isMediaTitle("😀".repeat(MEDIA_TITLE_MAX_CHARS))).toBe(true);
    expect(isMediaTitle("影".repeat(MEDIA_TITLE_MAX_CHARS + 1))).toBe(false);
    expect(isMediaTitle(null)).toBe(false);
  });
});

describe("createMediaElement", () => {
  it("makes a 16:9 box centered on the point, at most 320 pt and half the page wide", () => {
    const video = createMediaElement(VIDEO, { width: 800, height: 1000 }, { x: 300, y: 400 });
    expect(video).toMatchObject({ type: "media", width: 320, height: 180, x: 140, y: 310, source: VIDEO, poster: null, title: "" });
    const small = createMediaElement(VIDEO, { width: 400, height: 300 }, { x: 0, y: 0 });
    expect(small.width).toBe(200);
    expect(small.height).toBeCloseTo(112.5, 6);
    // 很扁的頁面：高度也不超過頁高的一半
    const wide = createMediaElement(VIDEO, { width: 2000, height: 200 }, { x: 0, y: 0 });
    expect(wide.height).toBeCloseTo(100, 6);
  });

  it("describes itself by title, or as a YouTube video", () => {
    expect(describeElement(createMediaElement(VIDEO, A4, { x: 0, y: 0 }))).toBe("YouTube 影片");
    expect(describeElement(createMediaElement(VIDEO, A4, { x: 0, y: 0 }, { title: "訪談" }))).toBe("訪談");
    expect(describeElement(createMediaElement({ kind: "file", src: "assets/audio/a.mp3" }, A4, { x: 0, y: 0 }))).toBe("音訊");
  });

  it("has its box as bounds", () => {
    const video = createMediaElement(VIDEO, { width: 800, height: 1000 }, { x: 160, y: 90 });
    expect(getElementBounds(video)).toEqual({ minX: 0, minY: 0, maxX: 320, maxY: 180 });
  });
});

describe("media in the reducer", () => {
  const add = (element: MediaElement) => selectActivePage(run(blankState(), { type: "element/add", element })).elements;

  it("adds a valid video, with or without poster", () => {
    expect(add(createMediaElement(VIDEO, A4, { x: 0, y: 0 }))).toHaveLength(1);
    expect(add(createMediaElement(VIDEO, A4, { x: 0, y: 0 }, { poster: POSTER, title: "訪談" }))).toHaveLength(1);
  });

  it("ignores a video with a bad source, poster or title", () => {
    const base = createMediaElement(VIDEO, A4, { x: 0, y: 0 });
    expect(add({ ...base, source: { ...VIDEO, videoId: "nope" } })).toHaveLength(0);
    expect(add({ ...base, poster: { ...POSTER, zoom: 0 } })).toHaveLength(0);
    expect(add({ ...base, title: "x".repeat(MEDIA_TITLE_MAX_CHARS + 1) })).toHaveLength(0);
  });

  it("rejects bad patches and applies good ones", () => {
    const video = createMediaElement(VIDEO, A4, { x: 0, y: 0 });
    const state = run(blankState(), { type: "element/add", element: video });
    for (const patch of [{ source: { ...VIDEO, start: -5 } }, { poster: { ...POSTER, imageWidth: 0 } }, { title: "x".repeat(201) }]) {
      expect(run(state, { type: "element/update", id: video.id, patch })).toBe(state);
    }
    const next = run(state, { type: "element/update", id: video.id, patch: { source: { ...VIDEO, start: 90 }, poster: POSTER, title: "訪談" } });
    expect(selectActivePage(next).elements[0]).toMatchObject({ source: { start: 90 }, poster: POSTER, title: "訪談" });
  });

  it("adds audio (v19) and refuses formats other than mp3", () => {
    const audio = createMediaElement({ kind: "file", src: "assets/audio/a.mp3" }, A4, { x: 0, y: 0 }, { title: "訪談" });
    expect(add(audio)).toHaveLength(1);
    expect(add({ ...audio, source: { kind: "file", src: "assets/audio/a.wav" } })).toHaveLength(0);
    const state = run(blankState(), { type: "element/add", element: audio });
    expect(run(state, { type: "element/update", id: audio.id, patch: { source: { kind: "file", src: "assets/audio/b.ogg" } } })).toBe(state);
    const next = run(state, { type: "element/update", id: audio.id, patch: { source: { kind: "file", src: "assets/audio/b.mp3" } } });
    expect(selectActivePage(next).elements[0]).toMatchObject({ source: { kind: "file", src: "assets/audio/b.mp3" } });
  });
});
