import { describe, expect, it } from "vitest";
import type { YouTubeInfo } from "@/lib/project/project-types";
import { formatVideoTime, parseVideoTime, posterOf, videoFromTransfer, videoNotice } from "../media-insert";

const POSTER = { src: "assets/images/p.jpg", width: 480, height: 360 };
const info = (patch: Partial<YouTubeInfo> = {}): YouTubeInfo => ({ poster: POSTER, title: "訪談", availability: "ok", ...patch });

describe("posterOf", () => {
  it("fills the box with the fetched thumbnail, centered", () => {
    expect(posterOf(info())).toEqual({
      src: "assets/images/p.jpg",
      imageWidth: 480,
      imageHeight: 360,
      fit: "cover",
      focusX: 0.5,
      focusY: 0.5,
      zoom: 1,
    });
    expect(posterOf(info({ poster: null }))).toBeNull();
    expect(posterOf(null)).toBeNull();
  });
});

describe("videoNotice", () => {
  it("refuses missing videos and warns about embedding and missing posters", () => {
    expect(videoNotice(info())).toBeNull();
    expect(videoNotice(null)).toBeNull();
    expect(videoNotice(info({ availability: "notFound", poster: null }))?.level).toBe("error");
    expect(videoNotice(info({ availability: "notEmbeddable" }))).toMatchObject({ level: "warning", message: expect.stringContaining("嵌入") });
    expect(videoNotice(info({ poster: null }))).toMatchObject({ level: "warning", message: expect.stringContaining("封面") });
    // 離線：不知道能不能嵌入，只提醒沒有封面
    expect(videoNotice(info({ availability: "unknown", poster: null, title: null }))?.message).toContain("封面");
    expect(videoNotice(info({ availability: "unknown" }))).toBeNull();
  });
});

describe("videoFromTransfer", () => {
  const transfer = (data: Record<string, string>) => (format: string) => data[format] ?? "";

  it("takes the first link of a uri-list, skipping comments", () => {
    const data = { "text/uri-list": "# 影片\r\nhttps://youtu.be/C5fjrag2Fcg?t=30\r\nhttps://example.com", "text/plain": "ignored" };
    expect(videoFromTransfer(transfer(data))).toEqual({ videoId: "C5fjrag2Fcg", start: 30 });
  });

  it("falls back to plain text", () => {
    expect(videoFromTransfer(transfer({ "text/plain": " https://www.youtube.com/watch?v=C5fjrag2Fcg " }))?.videoId).toBe("C5fjrag2Fcg");
  });

  it("returns null for anything that is not one YouTube link", () => {
    expect(videoFromTransfer(transfer({}))).toBeNull();
    expect(videoFromTransfer(transfer({ "text/plain": "一段文字" }))).toBeNull();
    expect(videoFromTransfer(transfer({ "text/uri-list": "https://example.com/a.png", "text/plain": "https://youtu.be/C5fjrag2Fcg" }))).toBeNull();
  });
});

describe("video times", () => {
  it("formats as m:ss or h:mm:ss", () => {
    expect(formatVideoTime(0)).toBe("0:00");
    expect(formatVideoTime(90)).toBe("1:30");
    expect(formatVideoTime(3723)).toBe("1:02:03");
  });

  it("reads seconds, m:ss, h:mm:ss and 1m30s, within the start limit", () => {
    expect(parseVideoTime("90")).toBe(90);
    expect(parseVideoTime(" 1:30 ")).toBe(90);
    expect(parseVideoTime("1:02:03")).toBe(3723);
    expect(parseVideoTime("1m30s")).toBe(90);
    expect(parseVideoTime("0")).toBe(0);
    expect(parseVideoTime("24:00:00")).toBe(86_400);
    for (const bad of ["", "abc", "1:75", "1:2:3:4", "-5", "1.5", "24:00:01"]) {
      expect(parseVideoTime(bad), bad).toBeNull();
    }
    for (const seconds of [0, 59, 90, 3723]) {
      expect(parseVideoTime(formatVideoTime(seconds))).toBe(seconds);
    }
  });
});
