import { describe, expect, it } from "vitest";
import { toCommandError } from "@/lib/project/project-api";
import {
  bookStatusText,
  needsHostConfirmation,
  parseUploadErrorDetails,
  previewServer,
  progressPercent,
  progressText,
  rememberHost,
  stepAfterError,
  waitText,
} from "../upload-flow";

describe("upload errors from Rust", () => {
  it("carry code and retryAfter on CommandError", () => {
    const error = toCommandError({ kind: "upload", message: "嘗試太多次，請 9 分鐘後再試", code: "tooManyRequests", retryAfter: 540 });
    expect(error.kind).toBe("upload");
    expect(error.message).toBe("嘗試太多次，請 9 分鐘後再試");
    expect(error.upload).toEqual({ code: "tooManyRequests", retryAfter: 540 });
  });

  it("ignore unknown codes and bad waits", () => {
    expect(parseUploadErrorDetails({ code: "somethingNew" })).toBeUndefined();
    expect(parseUploadErrorDetails({ code: "network", retryAfter: null })).toEqual({ code: "network", retryAfter: null });
    expect(parseUploadErrorDetails({ code: "network", retryAfter: -5 })?.retryAfter).toBeNull();
    expect(parseUploadErrorDetails({ code: "network", retryAfter: "30" })?.retryAfter).toBeNull();
    // 其他 kind 沒有 upload 欄位
    expect(toCommandError({ kind: "invalidInput", message: "x", code: "network" }).upload).toBeUndefined();
  });
});

describe("stepAfterError", () => {
  it("asks for the password again when the login is gone", () => {
    for (const step of ["login", "books", "uploading"] as const) expect(stepAfterError("unauthenticated", step)).toBe("login");
  });

  it("reloads the books when the book was deleted", () => {
    expect(stepAfterError("notFound", "uploading")).toBe("books");
  });

  it("goes back to the books after a failed upload, stays elsewhere", () => {
    expect(stepAfterError("quotaExceeded", "uploading")).toBe("books");
    expect(stepAfterError("network", "login")).toBe("login");
    expect(stepAfterError(undefined, "books")).toBe("books");
  });
});

describe("previewServer", () => {
  it("shows the host the password goes to", () => {
    expect(previewServer("magazine.example.com")).toEqual({ host: "magazine.example.com", insecure: false, allowed: true });
    expect(previewServer(" HTTPS://API.Example.com:8443 ")).toEqual({ host: "api.example.com", insecure: false, allowed: true });
    expect(previewServer("http://localhost:8081")).toEqual({ host: "localhost", insecure: true, allowed: true });
    expect(previewServer("http://[::1]:8081")).toEqual({ host: "::1", insecure: true, allowed: true });
    expect(previewServer("https://例子.tw")?.host).toBe("xn--fsqu00a.tw");
  });

  it("refuses plain http to the internet, like Rust", () => {
    for (const input of ["http://127.0.0.1", "http://10.1.2.3", "http://172.16.0.1", "http://172.31.255.255", "http://192.168.1.10:8081"]) {
      expect(previewServer(input)?.allowed, input).toBe(true);
    }
    for (const input of ["http://203.0.113.5", "http://172.32.0.1", "http://172.15.0.1", "http://example.com", "http://192.168.1.10.nip.io"]) {
      expect(previewServer(input)?.allowed, input).toBe(false);
    }
    expect(previewServer("https://203.0.113.5")?.allowed).toBe(true);
  });

  it("returns null for nothing usable", () => {
    for (const input of ["", "   ", "ftp://x.com", "https://"]) expect(previewServer(input), input).toBeNull();
  });
});

describe("confirmed hosts", () => {
  it("asks once per host", () => {
    expect(needsHostConfirmation("a.example", [])).toBe(true);
    expect(needsHostConfirmation("a.example", ["a.example"])).toBe(false);
  });

  it("keeps the newest first without duplicates, at most 20", () => {
    expect(rememberHost(["b", "a"], "a")).toEqual(["a", "b"]);
    const many = Array.from({ length: 20 }, (_, n) => `h${n}`);
    const remembered = rememberHost(many, "new");
    expect(remembered).toHaveLength(20);
    expect(remembered[0]).toBe("new");
    expect(remembered).not.toContain("h19");
  });
});

describe("progress", () => {
  it("has a percentage only while sending", () => {
    expect(progressPercent({ stage: "building", sent: 0, total: 0 })).toBeNull();
    expect(progressPercent({ stage: "uploading", sent: 512 * 1024, total: 2 * 1024 * 1024 })).toBe(25);
    expect(progressPercent({ stage: "uploading", sent: 0, total: 0 })).toBeNull();
    expect(progressPercent({ stage: "processing", sent: 10, total: 10 })).toBeNull();
  });

  it("describes each stage", () => {
    expect(progressText({ stage: "building", sent: 0, total: 0 })).toContain("產生");
    expect(progressText({ stage: "uploading", sent: 1.5 * 1024 * 1024, total: 10 * 1024 * 1024 })).toBe("上傳中 1.5 / 10.0 MB");
    expect(progressText({ stage: "processing", sent: 1, total: 1 })).toContain("網站");
  });
});

describe("texts", () => {
  it("waits like the Rust message", () => {
    expect(waitText(30)).toBe("30 秒");
    expect(waitText(61)).toBe("2 分鐘");
  });

  it("names the book states", () => {
    expect(bookStatusText("DRAFT")).toBe("草稿");
    expect(bookStatusText("PUBLIC")).toBe("公開");
    expect(bookStatusText("HIDDEN")).toBe("隱藏");
    expect(bookStatusText("ARCHIVED")).toBe("ARCHIVED");
  });
});
