import { describe, expect, it } from "vitest";
import {
  isYouTubeVideoId,
  parseDuration,
  parseYouTubeUrl,
  YOUTUBE_START_MAX_SECONDS,
  youTubeWatchUrl,
} from "../youtube-url";

const ID = "C5fjrag2Fcg";

describe("parseYouTubeUrl", () => {
  it("reads the link forms YouTube hands out", () => {
    const links = [
      `https://www.youtube.com/watch?v=${ID}`,
      `http://youtube.com/watch?v=${ID}`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://music.youtube.com/watch?v=${ID}&si=abc`,
      `https://www.youtube.com/watch?feature=share&v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://youtu.be/${ID}?si=Xyz123`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube-nocookie.com/embed/${ID}`,
      `https://www.youtube.com/live/${ID}?feature=share`,
      `https://www.youtube.com/v/${ID}`,
      `https://WWW.YouTube.com/watch?v=${ID}`,
    ];
    for (const link of links) {
      expect(parseYouTubeUrl(link), link).toEqual({ videoId: ID, start: 0 });
    }
  });

  it("accepts a link without scheme and with surrounding spaces", () => {
    expect(parseYouTubeUrl(`  youtu.be/${ID}\n`)).toEqual({ videoId: ID, start: 0 });
    expect(parseYouTubeUrl(`www.youtube.com/watch?v=${ID}`)).toEqual({ videoId: ID, start: 0 });
  });

  it("takes the video out of a playlist link", () => {
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&list=PL123&index=2`)).toEqual({ videoId: ID, start: 0 });
  });

  it("reads the start time from t, start or #t", () => {
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=90`)?.start).toBe(90);
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&t=1m30s`)?.start).toBe(90);
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&t=1h2m3s`)?.start).toBe(3723);
    expect(parseYouTubeUrl(`https://www.youtube.com/embed/${ID}?start=45`)?.start).toBe(45);
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}#t=30`)?.start).toBe(30);
  });

  it("keeps the video when the start time is unreadable, and clamps very late ones", () => {
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=abc`)).toEqual({ videoId: ID, start: 0 });
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=-5`)).toEqual({ videoId: ID, start: 0 });
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=999999`)?.start).toBe(YOUTUBE_START_MAX_SECONDS);
  });

  it("rejects anything that is not one YouTube video", () => {
    const notVideos = [
      "",
      "   ",
      "hello world",
      `https://vimeo.com/123456`,
      `https://example.com/watch?v=${ID}`,
      `https://youtube.com.evil.example/watch?v=${ID}`,
      `https://www.youtube.com/playlist?list=PL123`,
      `https://www.youtube.com/@channel`,
      `https://www.youtube.com/`,
      `https://www.youtube.com/watch`,
      `https://www.youtube.com/watch?v=short`,
      `https://www.youtube.com/watch?v=${ID}x`,
      `https://www.youtube.com/watch?v=C5fjrag2Fc!`,
      `https://youtu.be/`,
      `https://youtu.be/${ID}/extra`,
      `https://www.youtube.com/shorts/${ID}/extra`,
      `javascript:alert(1)//youtu.be/${ID}`,
      `ftp://youtu.be/${ID}`,
      `https://youtu.be/${ID} https://youtu.be/${ID}`,
      `https://example.com/https://youtu.be/${ID}`,
      `https://youtu.be/${ID}?${"a".repeat(3000)}`,
    ];
    for (const text of notVideos) {
      expect(parseYouTubeUrl(text), text).toBeNull();
    }
  });
});

describe("youTubeWatchUrl", () => {
  it("builds the canonical link, adding t only when the start is after 0", () => {
    expect(youTubeWatchUrl(ID, 0)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(youTubeWatchUrl(ID, 90)).toBe(`https://www.youtube.com/watch?v=${ID}&t=90s`);
  });

  it("round-trips through parseYouTubeUrl", () => {
    for (const start of [0, 1, 90, 3723]) {
      expect(parseYouTubeUrl(youTubeWatchUrl(ID, start))).toEqual({ videoId: ID, start });
    }
  });
});

describe("isYouTubeVideoId / parseDuration", () => {
  it("checks the id shape", () => {
    expect(isYouTubeVideoId(ID)).toBe(true);
    expect(isYouTubeVideoId("a-b_c-d_e-f")).toBe(true);
    expect(isYouTubeVideoId("short")).toBe(false);
    expect(isYouTubeVideoId(`${ID} `)).toBe(false);
  });

  it("reads plain seconds and h/m/s durations", () => {
    expect(parseDuration("0")).toBe(0);
    expect(parseDuration("75")).toBe(75);
    expect(parseDuration("75s")).toBe(75);
    expect(parseDuration("2m")).toBe(120);
    expect(parseDuration("1H1M1S")).toBe(3661);
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("1m30")).toBeNull();
    expect(parseDuration("1.5")).toBeNull();
  });
});
