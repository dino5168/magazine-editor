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

/** `kind` values of `AppError` in `src-tauri/src/error.rs`. */
export type AppErrorKind =
  | "sqlite"
  | "lockPoisoned"
  | "invalidInput"
  | "io"
  | "invalidProject"
  | "unsupportedVersion"
  | "noProject"
  | "tauri";

/** Error returned by a Tauri command, narrowed by `kind`. */
export class CommandError extends Error {
  readonly kind: AppErrorKind;

  constructor(kind: AppErrorKind, message: string) {
    super(message);
    this.name = "CommandError";
    this.kind = kind;
  }
}
