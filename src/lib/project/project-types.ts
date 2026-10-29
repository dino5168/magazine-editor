import type { AssetInfo, EditorDocument, FontFile } from "@/lib/editor/types";
import type { Library } from "@/lib/library/types";

/** Mirrors `ProjectInfo` in `src-tauri/src/project/mod.rs`. */
export interface ProjectInfo {
  readonly id: string;
  /** Absolute folder path; only used to build asset URLs. */
  readonly root: string;
  /** Never saved yet: lives in the local app-data staging folder, so "save" means "save as". */
  readonly untitled: boolean;
}

/** The part of `project.magproj` the editor reads and writes. */
export interface ProjectContent {
  readonly document: EditorDocument;
  readonly assets: readonly AssetInfo[];
}

export interface OpenedProject {
  readonly info: ProjectInfo;
  readonly content: ProjectContent;
  /** The main file was damaged and `project.magproj.bak` was loaded instead. */
  readonly recoveredFromBackup: boolean;
  /** The project's asset library (`library.json`); not used by the editor yet (素材管理 step 5). */
  readonly library: Library;
  /** `library.json` could not be read and was rebuilt from the project's images. */
  readonly libraryRebuilt: boolean;
}

/** A crash-recovery file left by a previous session (`RecoveryEntry` in Rust). */
export interface RecoveryEntry {
  /** Project id; also the recovery file name. */
  readonly id: string;
  readonly documentName: string;
  /** RFC 3339 UTC timestamp of the last automatic backup. */
  readonly savedAt: string;
  readonly untitled: boolean;
  readonly projectRoot: string;
}

/** One face of a font collection (`CollectionFace` in Rust `project/fonts.rs`). */
export interface CollectionFace {
  readonly index: number;
  readonly family: string;
  readonly style: string;
  readonly weight: number;
  /** Why it cannot be imported (Chinese, user-facing), or null. */
  readonly problem: string | null;
}

/** A font installed on this computer (`SystemFont` in Rust `project/system_fonts.rs`). */
export interface SystemFont {
  /** Opaque id for `font_import_system`. */
  readonly id: string;
  /** File name only. */
  readonly file: string;
  /** `system` = `%WINDIR%\Fonts`; `user` = installed by this user only. */
  readonly source: "system" | "user";
  /** Face of a collection (0 for a single font). */
  readonly index: number;
  /** Display family (Traditional Chinese first). */
  readonly family: string;
  /** Family name a CSS `font-family` finds (US English first); the preview draws with it. */
  readonly cssFamily: string;
  /** Every family name in the file (search). */
  readonly aliases: readonly string[];
  readonly style: string;
  readonly weight: number;
  readonly italic: boolean;
  readonly hasChinese: boolean;
  /** Why it cannot be added (Chinese), or null. */
  readonly problem: string | null;
}

/** Result of `font_import_system` (`ImportedFonts` in Rust). */
export interface ImportedFonts {
  readonly regular: FontFile;
  readonly bold: FontFile | null;
}

/** Event with the progress of `font_catalog_download` (Rust `commands/fonts.rs`). */
export const FONT_CATALOG_PROGRESS_EVENT = "font-catalog://progress";

/** Payload of `FONT_CATALOG_PROGRESS_EVENT`: bytes of all the files this download needs. */
export interface FontCatalogProgress {
  readonly id: string;
  readonly received: number;
  readonly total: number;
}

/** Output format of `export_choose_path` (`ExportFormat` in Rust). */
export type ExportFormat = "pdf" | "flipbook" | "flipbookZip" | "pptx";

/** Result of `export_pdf` / `export_flipbook` / `export_pptx` (`ExportResult` in Rust). */
export interface ExportResult {
  readonly pages: number;
  /** Images left out because their file no longer exists in the project, or the format cannot draw it. */
  readonly skippedImages: number;
}

/** `kind` values of `AppError` in `src-tauri/src/error.rs`. */
export const ERROR_KINDS = [
  "sqlite",
  "lockPoisoned",
  "invalidInput",
  "io",
  "invalidProject",
  "unsupportedVersion",
  "noProject",
  "export",
  "tauri",
  // 上傳到網站；Rust 另外帶 code / retryAfter（上傳對話框才會用到）
  "upload",
] as const;

export type AppErrorKind = (typeof ERROR_KINDS)[number];

/** Error returned by a Tauri command, narrowed by `kind`. */
export class CommandError extends Error {
  readonly kind: AppErrorKind;

  constructor(kind: AppErrorKind, message: string) {
    super(message);
    this.name = "CommandError";
    this.kind = kind;
  }
}
