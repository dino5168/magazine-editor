import type { AssetInfo, EditorDocument } from "@/lib/editor/types";

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

/** `kind` values of `AppError` in `src-tauri/src/error.rs`. */
export const ERROR_KINDS = [
  "sqlite",
  "lockPoisoned",
  "invalidInput",
  "io",
  "invalidProject",
  "unsupportedVersion",
  "noProject",
  "tauri",
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
