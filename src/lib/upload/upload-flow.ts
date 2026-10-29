/**
 * 上傳對話框的純邏輯：錯誤碼決定回到哪一步、進度文字、網址預覽、記住確認過的主機。
 * 計畫：docs/13-Plans-電子書上傳/5-desktop上傳-實作-V2.md §4.5、步驟 5。網路請求都在 Rust（src-tauri/src/upload/）。
 */

/** `UploadCode` in Rust `upload/response.rs` (serialized camelCase). */
export const UPLOAD_CODES = [
  "unauthenticated",
  "tooManyRequests",
  "forbidden",
  "notFound",
  "badInput",
  "uploadInProgress",
  "quotaExceeded",
  "tooLarge",
  "timeout",
  "redirect",
  "network",
  "server",
] as const;

export type UploadCode = (typeof UPLOAD_CODES)[number];

/** The extra fields of an `upload` error (Rust `AppError::Upload`). */
export interface UploadErrorDetails {
  readonly code: UploadCode;
  /** Seconds to wait before trying again, when the server said. */
  readonly retryAfter: number | null;
}

/**
 * Reads the extra fields of an `upload` error.
 *
 * Args:
 *   error: The rejected value of `invoke` (`{ kind, message, code, retryAfter }`).
 *
 * Returns:
 *   The details, or undefined when they are missing or unknown.
 */
export function parseUploadErrorDetails(error: object): UploadErrorDetails | undefined {
  // 來自 IPC 的未知值：逐欄檢查
  const fields = error as Readonly<Record<string, unknown>>;
  const code = UPLOAD_CODES.find((candidate) => candidate === fields.code);
  if (code === undefined) return undefined;
  const { retryAfter } = fields;
  return {
    code,
    retryAfter: typeof retryAfter === "number" && Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
  };
}

/** The steps of the upload dialog. */
export type UploadStep = "login" | "books" | "uploading" | "done";

/**
 * Where the dialog goes after a failed call.
 *
 * Args:
 *   code: The error code.
 *   step: The step the call was made from.
 *
 * Returns:
 *   `login` when the password is needed again, `books` when the list has to be reloaded (the book
 *   was deleted), otherwise the same step (the message is shown there).
 */
export function stepAfterError(code: UploadCode | undefined, step: UploadStep): UploadStep {
  if (code === "unauthenticated") return "login";
  if (code === "notFound") return "books";
  // 上傳中失敗回到選書，可以改選或再試一次
  return step === "uploading" ? "books" : step;
}

/** Address as the user typed it, previewed for the 「將傳送密碼到…」 line. Rust checks it again. */
export interface ServerPreview {
  readonly host: string;
  readonly insecure: boolean;
  /** False for plain http to the internet (Rust refuses it before sending anything). */
  readonly allowed: boolean;
}

/** Same rule as Rust `allows_plain_http`: localhost, 127/8, 10/8, 172.16/12, 192.168/16, ::1. */
function allowsPlainHttp(host: string): boolean {
  if (host === "localhost" || host === "::1") return true;
  const octets = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)?.slice(1).map(Number);
  if (!octets || octets.some((n) => n > 255)) return false;
  const [a, b] = octets;
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * Previews the server address (same idea as Rust `parse_server_url`, only for display).
 *
 * Args:
 *   input: What the user typed.
 *
 * Returns:
 *   Host (punycode, lower case) and whether it is plain http, or null when it does not parse.
 */
export function previewServer(input: string): ServerPreview | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (host === "") return null;
    const insecure = url.protocol === "http:";
    return { host, insecure, allowed: !insecure || allowsPlainHttp(host) };
  } catch {
    return null;
  }
}

/** How many confirmed hosts are remembered. */
export const CONFIRMED_HOSTS_MAX = 20;

/** Whether the user has to confirm sending the password to `host` (the first time only). */
export function needsHostConfirmation(host: string, confirmedHosts: readonly string[]): boolean {
  return !confirmedHosts.includes(host);
}

/**
 * Remembers a confirmed host: newest first, no duplicates, at most `CONFIRMED_HOSTS_MAX`.
 */
export function rememberHost(confirmedHosts: readonly string[], host: string): readonly string[] {
  return [host, ...confirmedHosts.filter((known) => known !== host)].slice(0, CONFIRMED_HOSTS_MAX);
}

/** 「30 秒」/「3 分鐘」(rounded up), like the Rust message. */
export function waitText(seconds: number): string {
  return seconds < 60 ? `${Math.ceil(seconds)} 秒` : `${Math.ceil(seconds / 60)} 分鐘`;
}

/** Payload of `UPLOAD_PROGRESS_EVENT` (Rust `commands/upload.rs`). */
export interface UploadProgress {
  readonly stage: "building" | "uploading" | "processing";
  readonly sent: number;
  readonly total: number;
}

const MB = 1024 * 1024;

/** 0–100 for the progress bar; null while there is nothing to measure (building, processing). */
export function progressPercent(progress: UploadProgress): number | null {
  if (progress.stage !== "uploading" || progress.total <= 0) return null;
  return Math.min(100, Math.round((progress.sent / progress.total) * 100));
}

/** What the dialog says under the progress bar. */
export function progressText(progress: UploadProgress): string {
  switch (progress.stage) {
    case "building":
      return "正在產生翻頁書與封面…";
    case "uploading":
      return `上傳中 ${(progress.sent / MB).toFixed(1)} / ${(progress.total / MB).toFixed(1)} MB`;
    case "processing":
      return "已送出，網站正在檢查與解壓縮…";
    default: {
      const exhaustive: never = progress.stage;
      return exhaustive;
    }
  }
}

/** Book status as shown in the list. */
export function bookStatusText(status: string): string {
  switch (status) {
    case "DRAFT":
      return "草稿";
    case "PUBLIC":
      return "公開";
    case "HIDDEN":
      return "隱藏";
    default:
      return status;
  }
}
