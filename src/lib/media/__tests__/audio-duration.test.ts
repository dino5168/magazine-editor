import { describe, expect, it } from "vitest";
import { createLimiter } from "@/lib/concurrency";
import { createDurationCache } from "../audio-duration";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A loader whose calls wait until the test finishes them. */
function manualLoader() {
  const calls: { url: string; resolve: (seconds: number | null) => void }[] = [];
  const load = (url: string) => new Promise<number | null>((resolve) => calls.push({ url, resolve }));
  return { calls, load };
}

describe("createLimiter", () => {
  it("runs at most max jobs at once, in order, and frees the slot when a job fails", async () => {
    const run = createLimiter(1);
    const order: string[] = [];
    let release: () => void = () => {};
    const first = run(() => new Promise<void>((resolve) => (release = resolve)).then(() => order.push("a")));
    const second = run(async () => {
      order.push("b");
      throw new Error("壞掉");
    });
    const third = run(async () => order.push("c"));
    await flush();
    expect(order).toEqual([]);
    release();
    await first;
    await expect(second).rejects.toThrow("壞掉");
    await third;
    expect(order).toEqual(["a", "b", "c"]);
  });
});

describe("createDurationCache", () => {
  it("reads each key once, two at a time", async () => {
    const { calls, load } = manualLoader();
    const request = createDurationCache(load, 2);
    const keys = ["a", "b", "c"].map((name) => `assets/audio/${name}.mp3`);
    const results = keys.map((key) => request(key, `url:${key}`));
    expect(request(keys[0], "other-url")).toBe(results[0]);
    await flush();
    expect(calls.map((call) => call.url)).toEqual(keys.slice(0, 2).map((key) => `url:${key}`));
    calls[0].resolve(220.5);
    await flush();
    expect(calls).toHaveLength(3);
    calls[1].resolve(null);
    calls[2].resolve(61);
    expect(await Promise.all(results)).toEqual([220.5, null, 61]);
  });
});
