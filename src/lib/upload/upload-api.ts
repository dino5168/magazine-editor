import type { ExportRequest } from "@/lib/export/export-request";
import { callCommand } from "@/lib/project/project-api";

/** Event with the progress of `upload_flipbook` (payload `UploadProgress` in `upload-flow.ts`). */
export const UPLOAD_PROGRESS_EVENT = "upload://progress";

/** The logged-in account as Rust shows it (`SessionInfo`; the token never leaves Rust). */
export interface UploadSession {
  readonly origin: string;
  readonly host: string;
  /** Plain http (this computer or a private address). */
  readonly insecure: boolean;
  readonly displayName: string;
  /** `AUTHOR` / `PUBLISHER_ADMIN` / `ADMIN`. */
  readonly role: string;
  /** False for ADMIN (it belongs to no publisher). */
  readonly canCreateBooks: boolean;
  /** RFC 3339. */
  readonly expiresAt: string;
}

/** A book the account may overwrite (`UploadBook`). */
export interface UploadBook {
  readonly id: string;
  readonly title: string;
  /** `DRAFT` / `PUBLIC` / `HIDDEN`. */
  readonly status: string;
  /** null: nothing uploaded yet. */
  readonly pageCount: number | null;
  readonly updatedAt: string | null;
}

/** One page of the book list (`BookPage`). */
export interface UploadBookPage {
  readonly books: readonly UploadBook[];
  /** Pass back for the next 50; null on the last page. */
  readonly nextCursor: string | null;
}

/** What `upload_flipbook` reports (`UploadResult`). */
export interface UploadResult {
  readonly pageCount: number;
  readonly readerUrl: string;
  /** False when the cover could not be drawn (the website keeps the old one). */
  readonly coverUploaded: boolean;
  readonly skippedImages: number;
}

/** Wrappers around the Rust upload commands (`commands/upload.rs`). Errors of kind `upload` carry `upload.code`. */
export const uploadApi = {
  /** Logs in; the password goes to Rust for this one request and is not kept. */
  login: (server: string, email: string, password: string) => callCommand<UploadSession>("upload_login", { server, email, password }),
  logout: () => callCommand<null>("upload_logout"),
  /** The current login, or null when there is none or it expired. */
  session: () => callCommand<UploadSession | null>("upload_session"),
  listBooks: (after: string | null) => callCommand<UploadBookPage>("upload_list_books", { after }),
  createBook: (title: string) => callCommand<UploadBook>("upload_create_book", { title }),
  /** Builds and uploads the flip book; null when cancelled. Progress: `UPLOAD_PROGRESS_EVENT`. */
  upload: (bookId: string, request: ExportRequest) => callCommand<UploadResult | null>("upload_flipbook", { bookId, request }),
  cancel: () => callCommand<null>("upload_cancel"),
  /** Opens the last uploaded book in the browser (the URL stays in Rust). */
  openReader: () => callCommand<null>("upload_open_reader"),
};
