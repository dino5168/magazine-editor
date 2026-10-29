import { invoke, isTauri, type InvokeArgs, type InvokeOptions } from "@tauri-apps/api/core";
import type { FontFile } from "@/lib/editor/types";
import type { Result } from "@/lib/editor/validation";
import type { ExportRequest } from "@/lib/export/export-request";
import type { Library, LibraryItemKind } from "@/lib/library/types";
import {
  CommandError,
  ERROR_KINDS,
  type AppErrorKind,
  type CollectionFace,
  type ExportFormat,
  type ExportResult,
  type ImportedFonts,
  type OpenedProject,
  type ProjectContent,
  type ProjectInfo,
  type RecoveryEntry,
  type SystemFont,
} from "./project-types";
import { parseUploadErrorDetails } from "@/lib/upload/upload-flow";

function isErrorKind(value: string): value is AppErrorKind {
  return (ERROR_KINDS as readonly string[]).includes(value);
}

/**
 * Converts whatever `invoke` rejected with into a `CommandError`.
 *
 * Args:
 *   error: Rejection value; Rust errors arrive as `{ kind, message }`.
 *
 * Returns:
 *   Typed error.
 */
export function toCommandError(error: unknown): CommandError {
  if (typeof error === "object" && error !== null && "kind" in error && "message" in error) {
    const { kind, message } = error;
    if (typeof kind === "string" && typeof message === "string" && isErrorKind(kind)) {
      return new CommandError(kind, message, kind === "upload" ? parseUploadErrorDetails(error) : undefined);
    }
  }
  return new CommandError("tauri", error instanceof Error ? error.message : String(error));
}

async function call<T>(command: string, args?: InvokeArgs, options?: InvokeOptions): Promise<Result<T>> {
  try {
    return { data: await invoke<T>(command, args, options), error: null };
  } catch (error) {
    return { data: null, error: toCommandError(error) };
  }
}

/** `invoke` returning a `Result` with a typed `CommandError`; for other domains' API wrappers. */
export { call as callCommand };

/** True inside the Tauri window; false in browser-only dev mode (`npm run dev`). */
export const isDesktop: boolean = isTauri();

/** Thin wrappers around the Rust project commands. `null` data means the user cancelled a dialog. */
export const projectApi = {
  create: () => call<ProjectInfo>("project_new"),
  openLast: () => call<OpenedProject | null>("project_open_last"),
  openDialog: () => call<OpenedProject | null>("project_open_dialog"),
  save: (content: ProjectContent) => call<null>("project_save", { content }),
  saveAsDialog: (content: ProjectContent, suggestedName: string) =>
    call<ProjectInfo | null>("project_save_as_dialog", { content, suggestedName }),
  writeLibrary: (projectId: string, library: Library) => call<null>("library_write", { projectId, library }),
  /**
   * Stores a file in the project's asset directories; resolves to its project-relative `src`.
   * Bytes go as a raw body (a JSON array would make a 20 MB image several times larger); the kind
   * and a text file's extension go in headers.
   */
  importLibraryAsset: (bytes: Uint8Array, kind: LibraryItemKind, extension: string) =>
    call<string>("library_import", bytes, { headers: { "x-asset-kind": kind, "x-asset-extension": extension } }),
  readLibraryText: (src: string) => call<string>("library_read_text", { src }),
  /**
   * Checks a TTF / OTF file (or face `index` of a TTC) and stores it in `assets/fonts/` as a single
   * font (raw body, like `importLibraryAsset`); resolves to what `ProjectFont.regular` / `bold`
   * stores. Unusable files fail with `invalidInput`.
   */
  importFont: (bytes: Uint8Array, index?: number) =>
    call<FontFile>("font_import", bytes, index === undefined ? undefined : { headers: { "x-font-index": String(index) } }),
  /** The faces of a font collection (`.ttc`), each with why it cannot be imported (or null). */
  fontCollectionFaces: (bytes: Uint8Array) => call<CollectionFace[]>("font_collection_faces", bytes),
  /** The fonts installed on this computer (cached on the Rust side; the first call takes a moment). */
  listSystemFonts: () => call<SystemFont[]>("system_fonts_list"),
  /** Adds system fonts (ids from `listSystemFonts`) to the project's `assets/fonts/`. */
  importSystemFonts: (regular: string, bold: string | null) => call<ImportedFonts>("font_import_system", { regular, bold }),
  /**
   * Adds a font of the download catalog (`fonts-catalog.json`) to the project: from the local cache
   * or downloaded and checked by Rust (progress: `FONT_CATALOG_PROGRESS_EVENT`); null when cancelled.
   */
  downloadCatalogFont: (id: string) => call<ImportedFonts | null>("font_catalog_download", { id }),
  /** Stops the catalog download in progress. */
  cancelCatalogDownload: () => call<null>("font_catalog_cancel"),
  /** Ids of the catalog fonts already in the local cache. */
  cachedCatalogFonts: () => call<string[]>("font_catalog_cached"),
  /** Path of an image's thumbnail (made on demand), or null to show the original. */
  libraryThumbnail: (src: string) => call<string | null>("library_thumbnail", { src }),
  listRecovery: () => call<RecoveryEntry[]>("recovery_list"),
  restoreRecovery: (id: string) => call<OpenedProject>("recovery_restore", { id }),
  discardRecovery: (id: string) => call<null>("recovery_discard", { id }),
  writeRecovery: (content: ProjectContent) => call<null>("recovery_write", { content }),
  clearRecovery: () => call<null>("recovery_clear"),
  /**
   * Shows the save dialog for `format`; resolves to the chosen file (PDF, flip book zip, PowerPoint) or folder (flip book)
   * name, or null when cancelled.
   */
  chooseExportPath: (format: ExportFormat, suggestedName: string) =>
    call<string | null>("export_choose_path", { format, suggestedName }),
  exportPdf: (request: ExportRequest) => call<ExportResult>("export_pdf", { request }),
  exportFlipbook: (request: ExportRequest) => call<ExportResult>("export_flipbook", { request }),
  /** The same flip book as one `.zip` (`index.html` at the root; the bytes the website upload sends). */
  exportFlipbookZip: (request: ExportRequest) => call<ExportResult>("export_flipbook_zip", { request }),
  exportPptx: (request: ExportRequest) => call<ExportResult>("export_pptx", { request }),
  openLastExport: () => call<null>("export_open_last"),
  /** Starts / stops listening for the MCP bridge (`magazine-mcp.exe`). */
  mcpSetEnabled: (enabled: boolean) => call<null>("mcp_set_enabled", { enabled }),
  /** Answers the MCP tool call `id` from the `mcp://request` event. */
  mcpRespond: (id: number, response: McpToolResponse) => call<null>("mcp_respond", { id, response }),
  /** The file an MCP call names (`attachment.token` of its `mcp://request`); each token works once. */
  mcpTakeAttachment: (token: string) => call<ArrayBuffer>("mcp_take_attachment", { token }),
};

/** `ToolResponse` in Rust `mcp/protocol.rs`; `error` is Chinese and meant for the model. */
export type McpToolResponse =
  | { readonly status: "ok"; readonly data: unknown }
  | { readonly status: "error"; readonly error: string };

/**
 * Returns a user-facing message for a failed project command.
 *
 * Args:
 *   error: Error from `projectApi`.
 *
 * Returns:
 *   Message in Traditional Chinese.
 */
export function describeCommandError(error: Error): string {
  if (!(error instanceof CommandError)) return error.message;
  switch (error.kind) {
    case "invalidInput":
    case "export":
    case "upload":
      // 約定：Rust 端 InvalidInput / Export / Upload 的訊息一律是給使用者看的中文
      return error.message;
    case "unsupportedVersion":
      return "這個專案由較新版本的軟體建立，請更新軟體後再開啟";
    case "invalidProject":
      return `專案檔案已損壞或格式不正確（${error.message}）`;
    case "io":
      return `讀寫檔案失敗（${error.message}）`;
    case "noProject":
      return "目前沒有開啟的專案";
    case "sqlite":
    case "lockPoisoned":
    case "tauri":
      return `發生內部錯誤（${error.message}）`;
    default: {
      const exhaustive: never = error.kind;
      return exhaustive;
    }
  }
}
