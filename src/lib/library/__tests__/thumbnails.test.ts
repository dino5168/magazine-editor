import { beforeEach, describe, expect, it, vi } from "vitest";

// 模擬 Rust 的 library_thumbnail：每個呼叫都等測試手動完成
const pending: { src: string; resolve: (value: { data: string | null; error: null } | { data: null; error: Error }) => void }[] = [];
vi.mock("@/lib/project/project-api", () => ({
  isDesktop: true,
  projectApi: {
    libraryThumbnail: (src: string) => new Promise((resolve) => pending.push({ src, resolve })),
  },
}));

const { requestThumbnail, resetThumbnailCache, usesThumbnail } = await import("../thumbnails");

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const thumbOf = (src: string) => src.replace("assets/images/", "assets/thumbs/").replace(/\.\w+$/, ".jpg");

beforeEach(() => {
  pending.length = 0;
  resetThumbnailCache();
});

describe("requestThumbnail", () => {
  it("runs at most two at once and asks once per image", async () => {
    const sources = ["a", "b", "c", "d"].map((name) => `assets/images/${name}.png`);
    const results = sources.map((src) => requestThumbnail(src));
    // 同一張再要一次：同一個 promise，不會多呼叫
    expect(requestThumbnail(sources[0])).toBe(results[0]);
    await flush();
    expect(pending.map((call) => call.src)).toEqual(sources.slice(0, 2));
    pending[0].resolve({ data: thumbOf(sources[0]), error: null });
    await flush();
    expect(pending.map((call) => call.src)).toEqual(sources.slice(0, 3));
    for (const call of pending.slice(1)) call.resolve({ data: thumbOf(call.src), error: null });
    await flush();
    pending[3].resolve({ data: null, error: null });
    expect(await Promise.all(results)).toEqual([thumbOf(sources[0]), thumbOf(sources[1]), thumbOf(sources[2]), null]);
  });

  it("falls back to the original on errors and forgets everything on reset", async () => {
    const src = "assets/images/broken.png";
    const first = requestThumbnail(src);
    await flush();
    pending[0].resolve({ data: null, error: new Error("圖片無法解碼") });
    expect(await first).toBeNull();
    resetThumbnailCache();
    const again = requestThumbnail(src);
    expect(again).not.toBe(first);
    await flush();
    expect(pending).toHaveLength(2);
    pending[1].resolve({ data: thumbOf(src), error: null });
    expect(await again).toBe(thumbOf(src));
  });
});

describe("usesThumbnail", () => {
  const base = { id: "i", name: "n", bytes: 1, folderId: null, importedAt: "", trashed: null } as const;
  it("is for raster images only", () => {
    expect(usesThumbnail({ ...base, kind: "image", src: "assets/images/a.jpg", width: 1, height: 1 })).toBe(true);
    expect(usesThumbnail({ ...base, kind: "image", src: "assets/images/a.svg", width: 1, height: 1 })).toBe(false);
    expect(usesThumbnail({ ...base, kind: "text", src: "assets/texts/a.md", excerpt: "" })).toBe(false);
  });
});
